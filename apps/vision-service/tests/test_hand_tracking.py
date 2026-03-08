from typing import cast

from app.hand_tracking import HandTracker
from app.protocol import FrameState, pose_scores_for_pose


def test_hand_tracker_reuses_last_frame_briefly_during_dropout() -> None:
    tracker = HandTracker(tracking_hold_frames=2)
    tracker._last_frame_state = cast(
        FrameState,
        {
            "tracking": True,
            "pointer": {"x": 0.4, "y": 0.3},
            "pose": "closed-fist",
            "pose_confidence": 0.8,
            "pose_scores": pose_scores_for_pose("closed-fist", 0.8),
            "classifier_mode": "learned",
            "model_version": None,
            "pinch_strength": 0.1,
            "secondary_pinch_strength": 0.1,
            "open_palm_hold": False,
            "closed_fist": True,
            "confidence": 0.9,
            "brightness": 0.4,
        },
    )
    tracker._tracking_hold_remaining = 2

    held = tracker._fallback_frame_state(0.25)
    dropped = tracker._fallback_frame_state(0.2)
    lost = tracker._fallback_frame_state(0.15)

    assert held["tracking"] is True
    assert held["pose"] == "closed-fist"
    assert held.get("brightness") == 0.25
    assert dropped["tracking"] is True
    assert lost["tracking"] is False
    assert lost["pose"] == "unknown"
