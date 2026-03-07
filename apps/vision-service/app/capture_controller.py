from __future__ import annotations

import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import cast

from app.capture_store import CaptureStore
from app.protocol import CaptureCounts, CaptureStateEvent, FrameState, GestureEvent, PoseName

CAPTUREABLE_POSES: set[PoseName] = {
    "neutral",
    "open-palm",
    "closed-fist",
    "primary-pinch",
    "secondary-pinch",
}
MIN_CAPTURE_FRAMES = 5


@dataclass(slots=True)
class CaptureController:
    root_dir: Path
    export_dir: Path
    emit_event: Callable[[GestureEvent], None]
    mirror_x: bool
    active_label: PoseName = "neutral"
    recording: bool = False
    _store: CaptureStore = field(init=False)
    _lock: threading.Lock = field(init=False, default_factory=threading.Lock)
    _current_frames: list[dict[str, object]] = field(init=False, default_factory=list)
    _last_frame_state: FrameState | None = field(init=False, default=None)
    _started_at: float = field(init=False, default=0.0)
    _message: str | None = field(init=False, default=None)

    def __post_init__(self) -> None:
        self._store = CaptureStore(self.root_dir, self.export_dir)

    def _snapshot_unlocked(self) -> CaptureStateEvent:
        snapshot: CaptureStateEvent = {
            "type": "capture.state",
            "sessionId": self._store.session_id,
            "activeLabel": self.active_label,
            "recording": self.recording,
            "takeCount": self._store.take_count,
            "counts": cast(CaptureCounts, dict(self._store.counts)),
            "lastTakeId": self._store.last_take_id,
            "exportPath": str(self._store.last_export_path)
            if self._store.last_export_path
            else None,
            "message": self._message,
        }
        return snapshot

    def snapshot(self) -> CaptureStateEvent:
        with self._lock:
            return self._snapshot_unlocked()

    def emit_state(self, message: str | None = None) -> None:
        with self._lock:
            self._message = message
            snapshot = self._snapshot_unlocked()
        self.emit_event(snapshot)

    def set_label(self, label: PoseName) -> None:
        if label not in CAPTUREABLE_POSES:
            self.emit_state("Unsupported capture label")
            return
        with self._lock:
            self.active_label = label
        self.emit_state(None)

    def start(self) -> None:
        with self._lock:
            self.recording = True
            self._current_frames = []
            self._last_frame_state = None
            self._started_at = time.monotonic()
        self.emit_state("Recording capture take")

    def stop(self) -> None:
        with self._lock:
            if not self.recording:
                snapshot = self._snapshot_unlocked()
            else:
                self.recording = False
                frame_count = len(self._current_frames)
                if frame_count < MIN_CAPTURE_FRAMES or self._last_frame_state is None:
                    self._current_frames = []
                    self._last_frame_state = None
                    self._message = f"Discarded short take ({frame_count} frames)"
                    snapshot = self._snapshot_unlocked()
                    self.emit_event(snapshot)
                    return
                self._store.save_take(
                    label=self.active_label,
                    frames=self._current_frames,
                    classifier_mode=self._last_frame_state.get("classifier_mode", "rules"),
                    mirror_x=self.mirror_x,
                    model_version=self._last_frame_state.get("model_version"),
                )
                self._current_frames = []
                self._last_frame_state = None
                self._message = "Saved capture take"
                snapshot = self._snapshot_unlocked()
        self.emit_event(snapshot)

    def discard_last(self) -> None:
        discarded = self._store.discard_last_take()
        self.emit_state("Discarded last take" if discarded else "No capture take to discard")

    def export_session(self) -> None:
        destination = self._store.export_session()
        self.emit_state(f"Exported capture session to {destination}")

    def observe(self, frame_state: FrameState) -> None:
        with self._lock:
            if not self.recording:
                return
            if not frame_state.get("tracking") or "hand_landmarks" not in frame_state:
                return
            self._last_frame_state = frame_state
            timestamp_ms = int((time.monotonic() - self._started_at) * 1000)
            self._current_frames.append(
                {
                    "seq": len(self._current_frames) + 1,
                    "tsMs": timestamp_ms,
                    "tracking": frame_state["tracking"],
                    "brightness": frame_state.get("brightness", 0.0),
                    "landmarks": frame_state["hand_landmarks"],
                    "features": frame_state.get("feature_values", {}),
                    "rulePose": frame_state["pose"],
                    "ruleConfidence": frame_state["pose_confidence"],
                    "ruleScores": frame_state.get("pose_scores", {}),
                }
            )
