from __future__ import annotations

from time import monotonic, sleep

from app.live_pipeline import run_live_pipeline
from app.protocol import FrameState, GestureEvent, empty_pose_scores, pose_scores_for_pose


class _FastCounterCamera:
    def __init__(self) -> None:
        self._value = 0

    def read(self) -> int:
        self._value += 1
        return self._value


class _RecordingTracker:
    def __init__(self, delay_s: float = 0.0) -> None:
        self.delay_s = delay_s
        self.seen_frames: list[int] = []

    def process(self, frame: int) -> FrameState:
        self.seen_frames.append(frame)
        if self.delay_s > 0:
            sleep(self.delay_s)
        return {
            "tracking": True,
            "pointer": {"x": 0.5, "y": 0.5},
            "pose": "neutral",
            "pose_confidence": 0.72,
            "pose_scores": pose_scores_for_pose("neutral", 0.72),
            "pinch_strength": 0.0,
            "secondary_pinch_strength": 0.0,
            "open_palm_hold": False,
            "closed_fist": False,
            "confidence": 1.0,
            "brightness": 0.4,
        }


class _StatusMachine:
    def update(self, frame: FrameState) -> list[GestureEvent]:
        return [
            {
                "type": "status",
                "tracking": frame["tracking"],
                "pinchStrength": frame["pinch_strength"],
                "gesture": "idle",
                "debug": {
                    "confidence": frame["confidence"],
                    "brightness": frame.get("brightness", 0.0),
                    "frameDelayMs": frame.get("delay_ms", 0),
                    "pose": frame.get("pose", "unknown"),
                    "poseConfidence": frame.get("pose_confidence", 0.0),
                    "poseScores": frame.get("pose_scores", empty_pose_scores()),
                    "classifierMode": frame.get("classifier_mode", "rules"),
                    "modelVersion": frame.get("model_version"),
                    "closedFist": frame.get("closed_fist", False),
                    "closedFistFrames": 0,
                    "closedFistReleaseFrames": 0,
                    "closedFistLatched": False,
                    "openPalmHold": frame["open_palm_hold"],
                    "secondaryPinchStrength": frame["secondary_pinch_strength"],
                },
            }
        ]


def test_live_pipeline_drops_stale_frames_under_slow_inference() -> None:
    tracker = _RecordingTracker(delay_s=0.01)
    processed = run_live_pipeline(
        _FastCounterCamera(),
        emit_event=lambda _event: None,
        tracker_factory=lambda: tracker,
        machine_factory=_StatusMachine,
        time_source=monotonic,
        preview_interval_s=1.0,
        preview_enabled=False,
        preview_emitter=lambda _frame, _frame_state: True,
        max_frames=5,
    )

    assert processed == 5
    assert len(tracker.seen_frames) == 5
    assert any(
        next_frame - current_frame > 1
        for current_frame, next_frame in zip(
            tracker.seen_frames,
            tracker.seen_frames[1:],
            strict=False,
        )
    )


def test_live_pipeline_survives_preview_emitter_failure() -> None:
    tracker = _RecordingTracker(delay_s=0.01)
    events: list[object] = []
    preview_attempts = 0

    def preview_emitter(_frame: object, _frame_state: FrameState | None) -> bool:
        nonlocal preview_attempts
        preview_attempts += 1
        raise RuntimeError("preview consumer disconnected")

    processed = run_live_pipeline(
        _FastCounterCamera(),
        emit_event=events.append,
        tracker_factory=lambda: tracker,
        machine_factory=_StatusMachine,
        time_source=monotonic,
        preview_interval_s=0.001,
        preview_enabled=True,
        preview_emitter=preview_emitter,
        max_frames=3,
    )

    assert processed == 3
    assert len(events) == 3
    assert preview_attempts >= 1
