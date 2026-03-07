from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any, BinaryIO

from app.camera import Camera
from app.gestures import GestureMachine
from app.hand_tracking import HandTracker
from app.live_pipeline import run_live_pipeline
from app.protocol import FrameState, Landmark
from app.replay import iter_replay, load_fixture

DEBUG_PREVIEW_MAX_WIDTH = 320
DEBUG_PREVIEW_JPEG_QUALITY = 70
DEBUG_PREVIEW_FPS = max(1, int(os.environ.get("AIRLOOM_DEBUG_PREVIEW_FPS", "12")))
DEBUG_PREVIEW_INTERVAL_S = 1 / DEBUG_PREVIEW_FPS
DEBUG_PREVIEW_ENABLED = os.environ.get("AIRLOOM_DEBUG_PREVIEW", "0") == "1"
DEBUG_PREVIEW_FD = 3


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Airloom vision service")
    parser.add_argument("--stdio", action="store_true", help="emit events as JSON lines to stdout")
    parser.add_argument("--fixture", type=Path, help="replay a landmark/frame-state fixture")
    parser.add_argument(
        "--max-frames", type=int, default=0, help="cap live processing frames for testing"
    )
    return parser.parse_args()


def emit(event: object) -> None:
    print(json.dumps(event), flush=True)


def emit_camera_unavailable(message: str, emit_event: Callable[[object], None]) -> None:
    print(f"vision service: {message}", file=sys.stderr, flush=True)
    emit_event(
        {
            "type": "status",
            "tracking": False,
            "pinchStrength": 0.0,
            "gesture": "camera-unavailable",
            "debug": {
                "confidence": 0.0,
                "brightness": 0.0,
                "closedFist": False,
                "openPalmHold": False,
                "secondaryPinchStrength": 0.0,
            },
        }
    )


def _draw_marker(frame: Any, point: Landmark, color: tuple[int, int, int], radius: int) -> None:
    import cv2

    height, width = frame.shape[:2]
    center = (int(point["x"] * width), int(point["y"] * height))
    cv2.circle(frame, center, radius, color, thickness=-1)


def annotate_debug_frame(frame: Any, frame_state: FrameState | None) -> Any:
    import cv2

    annotated = frame.copy()
    height, width = annotated.shape[:2]

    if frame_state is not None:
        for point in frame_state.get("hand_landmarks", []):
            _draw_marker(annotated, point, (94, 215, 190), 3)

        raw_pointer = frame_state.get("raw_pointer")
        if raw_pointer is not None:
            _draw_marker(annotated, raw_pointer, (255, 209, 102), 6)

        pointer = frame_state.get("pointer")
        if pointer is not None:
            _draw_marker(annotated, pointer, (255, 127, 107), 5)

        label = (
            f"tracking={frame_state['tracking']} pinch={frame_state['pinch_strength']:.2f} "
            f"secondary={frame_state['secondary_pinch_strength']:.2f} "
            f"fist={frame_state.get('closed_fist', False)}"
        )
        cv2.putText(
            annotated,
            label,
            (14, 28),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (244, 248, 248),
            2,
            cv2.LINE_AA,
        )

    cv2.rectangle(annotated, (0, 0), (width - 1, height - 1), (94, 215, 190), 1)
    return annotated


def encode_debug_frame(frame: Any, frame_state: FrameState | None = None) -> bytes | None:
    import cv2

    if not hasattr(frame, "shape"):
        return None

    preview_source = annotate_debug_frame(frame, frame_state)

    height, width = preview_source.shape[:2]
    if width <= 0 or height <= 0:
        return None

    scale = min(1.0, DEBUG_PREVIEW_MAX_WIDTH / width)
    preview = preview_source
    preview_width = width
    preview_height = height
    if scale < 1.0:
        preview_width = max(1, int(width * scale))
        preview_height = max(1, int(height * scale))
        preview = cv2.resize(preview_source, (preview_width, preview_height))

    ok, encoded = cv2.imencode(
        ".jpg",
        preview,
        [int(cv2.IMWRITE_JPEG_QUALITY), DEBUG_PREVIEW_JPEG_QUALITY],
    )
    if not ok:
        return None

    return encoded.tobytes()


def open_preview_pipe() -> BinaryIO | None:
    try:
        preview_fd = os.dup(DEBUG_PREVIEW_FD)
    except OSError:
        return None

    return os.fdopen(preview_fd, "wb", buffering=0)


def emit_preview_frame(
    frame: Any, frame_state: FrameState | None, preview_pipe: BinaryIO | None
) -> bool:
    if preview_pipe is None:
        return False

    encoded = encode_debug_frame(frame, frame_state)
    if encoded is None:
        return False

    preview_pipe.write(len(encoded).to_bytes(4, byteorder="big"))
    preview_pipe.write(encoded)
    preview_pipe.flush()
    return True


def run_fixture(path: Path) -> None:
    frames = load_fixture(path)
    for frame, events in iter_replay(frames):
        for event in events:
            emit(event)

        delay_ms = frame.get("delay_ms", 0)
        if delay_ms > 0:
            time.sleep(delay_ms / 1000)


def run_live(
    max_frames: int,
    emit_event: Callable[[object], None] = emit,
    sleep_for: Callable[[float], None] = time.sleep,
    time_source: Callable[[], float] = time.monotonic,
    camera_factory: Callable[[], Any] = Camera,
    tracker_factory: Callable[[], Any] = HandTracker,
    machine_factory: Callable[[], Any] = GestureMachine,
    preview_enabled: bool = DEBUG_PREVIEW_ENABLED,
    preview_emitter: Callable[[Any, FrameState | None], bool] | None = None,
) -> None:
    processed = 0
    preview_pipe = open_preview_pipe() if preview_enabled and preview_emitter is None else None
    emit_preview = preview_emitter or (
        lambda frame, frame_state: emit_preview_frame(frame, frame_state, preview_pipe)
    )

    try:
        while True:
            try:
                with camera_factory() as camera:
                    processed += run_live_pipeline(
                        camera,
                        emit_event=emit_event,
                        tracker_factory=tracker_factory,
                        machine_factory=machine_factory,
                        time_source=time_source,
                        preview_interval_s=DEBUG_PREVIEW_INTERVAL_S,
                        preview_enabled=preview_enabled,
                        preview_emitter=emit_preview,
                        max_frames=max(0, max_frames - processed),
                    )
                    if max_frames and processed >= max_frames:
                        return
            except RuntimeError as error:
                emit_camera_unavailable(str(error), emit_event)
                processed += 1
                if max_frames and processed >= max_frames:
                    return
                sleep_for(1.0)
    finally:
        if preview_pipe is not None:
            preview_pipe.close()


def main() -> None:
    args = parse_args()
    if args.fixture is not None:
        run_fixture(args.fixture)
        return

    run_live(args.max_frames)


if __name__ == "__main__":
    main()
