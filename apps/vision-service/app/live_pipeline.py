from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from threading import Event, Lock, Thread
from typing import Any, Protocol, cast

from app.latest_value import LatestValue
from app.protocol import FrameState, GestureEvent


@dataclass(slots=True)
class CapturedFrame:
    seq: int
    captured_at: float
    frame: Any


class CameraLike(Protocol):
    def read(self) -> Any: ...


class TrackerLike(Protocol):
    def process(self, frame: Any) -> FrameState: ...


class MachineLike(Protocol):
    def update(self, frame: FrameState) -> list[GestureEvent]: ...


def run_live_pipeline(
    camera: CameraLike,
    *,
    emit_event: Any,
    tracker_factory: Any,
    machine_factory: Any,
    time_source: Any,
    preview_interval_s: float,
    preview_enabled: bool,
    preview_emitter: Any,
    max_frames: int,
) -> int:
    latest_capture = LatestValue[CapturedFrame]()
    stop_event = Event()
    processed_lock = Lock()
    processed_frames = 0
    failure: RuntimeError | None = None

    def fail(error: Exception) -> None:
        nonlocal failure
        with processed_lock:
            if failure is None:
                failure = error if isinstance(error, RuntimeError) else RuntimeError(str(error))
        stop_event.set()

    def note_processed_frame() -> None:
        nonlocal processed_frames
        with processed_lock:
            processed_frames += 1
            if max_frames and processed_frames >= max_frames:
                stop_event.set()

    def capture_loop() -> None:
        sequence = 0
        read_with_metadata: Callable[[int], tuple[int, float, Any]] | None = None
        candidate = getattr(camera, "read_with_metadata", None)
        if callable(candidate):
            read_with_metadata = cast(Callable[[int], tuple[int, float, Any]], candidate)

        try:
            while not stop_event.is_set():
                if read_with_metadata is not None:
                    sequence, captured_at, frame = read_with_metadata(sequence)
                else:
                    frame = camera.read()
                    sequence += 1
                    captured_at = time_source()

                latest_capture.publish(
                    CapturedFrame(
                        seq=sequence,
                        captured_at=captured_at,
                        frame=frame,
                    )
                )
        except Exception as error:  # pragma: no cover - exercised via tests
            fail(error)

    def inference_loop() -> None:
        tracker = tracker_factory()
        machine = machine_factory()
        last_seen_version = 0

        try:
            while not stop_event.is_set():
                update = latest_capture.wait_for_update(last_seen_version, timeout=0.1)
                if update is None:
                    continue

                last_seen_version, captured = update
                frame_state = tracker.process(captured.frame)
                for event in machine.update(frame_state):
                    emit_event(event)
                note_processed_frame()
        except Exception as error:  # pragma: no cover - exercised via tests
            fail(error)

    def preview_loop() -> None:
        if not preview_enabled:
            return

        last_sent_version = 0
        next_tick_at = time_source()

        while not stop_event.is_set():
            delay = max(0.0, next_tick_at - time_source())
            if stop_event.wait(delay):
                return
            next_tick_at = max(next_tick_at + preview_interval_s, time_source())

            update = latest_capture.get_latest()
            if update is None:
                continue

            version, captured = update
            if version == last_sent_version:
                continue

            try:
                emitted = preview_emitter(captured.frame)
            except Exception:
                return

            if emitted:
                last_sent_version = version

    threads = [
        Thread(target=capture_loop, name="airloom-capture", daemon=True),
        Thread(target=inference_loop, name="airloom-inference", daemon=True),
    ]
    if preview_enabled:
        threads.append(Thread(target=preview_loop, name="airloom-preview", daemon=True))

    for thread in threads:
        thread.start()

    try:
        while not stop_event.wait(0.05):
            continue
    finally:
        stop_event.set()
        for thread in threads:
            thread.join(timeout=1.0)

    if failure is not None:
        raise failure

    return processed_frames
