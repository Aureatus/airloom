from typing import cast

from app.hand_tracking import (
    HandTracker,
    _pointer_anchor,
    _remap_pointer_axis,
    _select_hand_roles,
)
from app.protocol import FrameState, Landmark, pose_scores_for_pose


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
    assert held.get("fallback_reason") == "dropout-hold"
    assert dropped["tracking"] is True
    assert lost["tracking"] is False
    assert lost["pose"] == "unknown"
    assert lost.get("fallback_reason") == "no-hands"


def test_pointer_anchor_uses_index_tip_for_non_fist_pose() -> None:
    landmarks = [{"x": 0.0, "y": 0.0} for _ in range(21)]
    landmarks[8] = {"x": 0.72, "y": 0.18}

    assert _pointer_anchor(cast(list[Landmark], landmarks), "open-palm") == {
        "x": 0.72,
        "y": 0.18,
    }


def test_pointer_anchor_uses_palm_center_for_closed_fist() -> None:
    landmarks = [{"x": 0.0, "y": 0.0} for _ in range(21)]
    landmarks[0] = {"x": 0.20, "y": 0.30}
    landmarks[5] = {"x": 0.30, "y": 0.20}
    landmarks[9] = {"x": 0.40, "y": 0.25}
    landmarks[13] = {"x": 0.50, "y": 0.30}
    landmarks[17] = {"x": 0.60, "y": 0.35}
    landmarks[8] = {"x": 0.90, "y": 0.05}

    anchor = _pointer_anchor(cast(list[Landmark], landmarks), "closed-fist")

    assert anchor["x"] == 0.4
    assert abs(anchor["y"] - 0.28) < 1e-9


def test_select_hand_roles_prefers_user_right_hand_for_pointer() -> None:
    pointer_index, action_index = _select_hand_roles(
        [{"x": 0.75, "y": 0.5}, {"x": 0.25, "y": 0.5}],
        mirror_x=True,
    )

    assert pointer_index == 1
    assert action_index == 0


def test_select_hand_roles_prefers_explicit_handedness_when_available() -> None:
    pointer_index, action_index = _select_hand_roles(
        [{"x": 0.25, "y": 0.5}, {"x": 0.75, "y": 0.5}],
        mirror_x=True,
        handedness_labels=["left", "right"],
    )

    assert pointer_index == 1
    assert action_index == 0


def test_pointer_region_margin_remaps_inner_area_to_full_range() -> None:
    assert _remap_pointer_axis(0.12, 0.12) == 0.0
    assert _remap_pointer_axis(0.88, 0.12) == 1.0
    assert _remap_pointer_axis(0.5, 0.12) == 0.5
