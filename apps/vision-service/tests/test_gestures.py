from typing import cast

from app.gestures import GestureMachine
from app.pose_features import compute_pinch_strength
from app.protocol import FrameState, PoseScores, empty_pose_scores


def pose_scores(pose: str = "neutral", confidence: float = 0.9, **overrides: float) -> PoseScores:
    scores = empty_pose_scores()
    if pose in scores:
        scores[pose] = confidence
    for key, value in overrides.items():
        normalized_key = key.replace("_", "-")
        if normalized_key in scores:
            scores[normalized_key] = value
    return scores


def frame_state(**overrides: object) -> FrameState:
    pose = cast(str, overrides.get("pose", "neutral"))
    pose_confidence = float(cast(float | int, overrides.get("pose_confidence", 0.9)))
    return cast(
        FrameState,
        {
            "tracking": True,
            "pointer": {"x": 0.5, "y": 0.4},
            "pose": pose,
            "pose_confidence": pose_confidence,
            "pose_scores": cast(
                PoseScores,
                overrides.get("pose_scores", pose_scores(pose=pose, confidence=pose_confidence)),
            ),
            "pinch_strength": 0.1,
            "secondary_pinch_strength": 0.1,
            "open_palm_hold": False,
            "closed_fist": False,
            "confidence": 0.9,
            **overrides,
        },
    )


def test_compute_pinch_strength_increases_as_points_move_closer() -> None:
    loose = compute_pinch_strength({"x": 0.1, "y": 0.1}, {"x": 0.35, "y": 0.35})
    tight = compute_pinch_strength({"x": 0.1, "y": 0.1}, {"x": 0.14, "y": 0.14})

    assert tight > loose


def test_gesture_machine_click_cycle() -> None:
    machine = GestureMachine()

    first_down_events = machine.update(
        frame_state(
            pose="primary-pinch",
            pinch_strength=0.81,
            secondary_pinch_strength=0.12,
            confidence=0.93,
        )
    )
    second_down_events = machine.update(
        frame_state(
            pointer={"x": 0.51, "y": 0.41},
            pose="primary-pinch",
            pinch_strength=0.84,
            secondary_pinch_strength=0.12,
            confidence=0.93,
        )
    )
    down_events = first_down_events + second_down_events
    first_up_events = machine.update(
        frame_state(
            pointer={"x": 0.51, "y": 0.41},
            pose="neutral",
            pinch_strength=0.34,
            secondary_pinch_strength=0.12,
            confidence=0.93,
        )
    )
    second_up_events = machine.update(
        frame_state(
            pointer={"x": 0.51, "y": 0.41},
            pose="neutral",
            pinch_strength=0.34,
            secondary_pinch_strength=0.12,
            confidence=0.93,
        )
    )
    up_events = first_up_events + second_up_events

    assert any(
        event["type"] == "gesture.intent"
        and event["gesture"] == "primary-pinch"
        and event["phase"] == "start"
        for event in down_events
    )
    assert any(
        event["type"] == "gesture.intent"
        and event["gesture"] == "primary-pinch"
        and event["phase"] == "end"
        for event in up_events
    )


def test_open_palm_hold_emits_enter() -> None:
    machine = GestureMachine()
    trigger_events = []
    for _ in range(12):
        trigger_events = machine.update(
            frame_state(
                pointer={"x": 0.3, "y": 0.2},
                pose="open-palm",
                pinch_strength=0.12,
                secondary_pinch_strength=0.18,
                open_palm_hold=True,
                confidence=0.88,
            )
        )

    assert any(
        event.get("type") == "gesture.intent"
        and event.get("gesture") == "open-palm-hold"
        and event.get("phase") == "instant"
        for event in trigger_events
    )


def test_secondary_pinch_emits_right_click_once_per_cycle() -> None:
    machine = GestureMachine()

    armed_events = machine.update(
        frame_state(
            pointer={"x": 0.4, "y": 0.3},
            pose="secondary-pinch",
            pinch_strength=0.2,
            secondary_pinch_strength=0.84,
        )
    )
    held_events = machine.update(
        frame_state(
            pointer={"x": 0.41, "y": 0.3},
            pose="secondary-pinch",
            pinch_strength=0.2,
            secondary_pinch_strength=0.86,
        )
    )
    release_events = machine.update(
        frame_state(
            pointer={"x": 0.42, "y": 0.31},
            pose="neutral",
            pinch_strength=0.2,
            secondary_pinch_strength=0.2,
        )
    )

    assert (
        sum(
            1
            for event in armed_events
            if event.get("type") == "gesture.intent"
            and event.get("gesture") == "thumb-middle-pinch"
            and event.get("phase") == "instant"
        )
        == 1
    )
    assert not any(event.get("type") == "gesture.intent" for event in held_events)
    assert not any(event.get("type") == "gesture.intent" for event in release_events)


def test_closed_fist_emits_pointer_observations_only_while_held() -> None:
    machine = GestureMachine()
    trigger_events = []

    for _ in range(4):
        trigger_events = machine.update(
            frame_state(
                pose="closed-fist",
                pinch_strength=0.18,
                secondary_pinch_strength=0.16,
                closed_fist=True,
                confidence=0.91,
            )
        )

    assert any(event.get("type") == "pointer.observed" for event in trigger_events)
    assert any(
        event.get("type") == "status" and event.get("debug", {}).get("closedFistLatched") is True
        for event in trigger_events
    )

    held_events = machine.update(
        frame_state(
            pose="closed-fist",
            pinch_strength=0.18,
            secondary_pinch_strength=0.16,
            closed_fist=True,
            confidence=0.91,
        )
    )

    assert any(event.get("type") == "pointer.observed" for event in held_events)


def test_closed_fist_emits_status_before_pointer_observation() -> None:
    machine = GestureMachine()

    events = machine.update(
        frame_state(
            pose="closed-fist",
            pinch_strength=0.18,
            secondary_pinch_strength=0.16,
            closed_fist=True,
            confidence=0.91,
        )
    )

    assert [event["type"] for event in events] == ["status", "pointer.observed"]


def test_closed_fist_stops_pointer_observations_after_release() -> None:
    machine = GestureMachine()

    for _ in range(4):
        machine.update(
            frame_state(
                pose="closed-fist",
                pinch_strength=0.18,
                secondary_pinch_strength=0.16,
                closed_fist=True,
                confidence=0.91,
            )
        )

    release_events = machine.update(
        frame_state(
            pose="open-palm",
            pinch_strength=0.18,
            secondary_pinch_strength=0.16,
            confidence=0.91,
        )
    )

    assert not any(event.get("type") == "pointer.observed" for event in release_events)
    assert any(
        event.get("type") == "status" and event.get("debug", {}).get("closedFistLatched") is False
        for event in release_events
    )


def test_closed_fist_does_not_start_dragging() -> None:
    machine = GestureMachine()

    events = machine.update(
        frame_state(
            pose="closed-fist",
            pinch_strength=0.92,
            secondary_pinch_strength=0.22,
            closed_fist=True,
            confidence=0.91,
        )
    )

    assert not any(
        event.get("type") == "gesture.intent" and event.get("gesture") == "primary-pinch"
        for event in events
    )


def test_primary_pinch_survives_single_unknown_frame_when_signal_stays_strong() -> None:
    machine = GestureMachine()

    machine.update(
        frame_state(
            pose="primary-pinch",
            pose_confidence=0.86,
            pose_scores=pose_scores(
                pose="primary-pinch",
                confidence=0.86,
                open_palm=0.72,
                closed_fist=0.14,
            ),
            pinch_strength=0.84,
        )
    )

    noisy_events = machine.update(
        frame_state(
            pose="unknown",
            pose_confidence=0.58,
            pose_scores=pose_scores(
                pose="neutral",
                confidence=0.3,
                primary_pinch=0.52,
                open_palm=0.48,
                closed_fist=0.18,
            ),
            pinch_strength=0.79,
        )
    )

    assert not any(
        event.get("type") == "gesture.intent" and event.get("phase") == "end"
        for event in noisy_events
    )


def test_primary_pinch_releases_after_a_weak_non_pinch_frame() -> None:
    machine = GestureMachine()

    machine.update(
        frame_state(
            pose="primary-pinch",
            pose_confidence=0.86,
            pose_scores=pose_scores(pose="primary-pinch", confidence=0.86, open_palm=0.68),
            pinch_strength=0.84,
        )
    )

    release_events = machine.update(
        frame_state(
            pose="neutral",
            pose_confidence=0.62,
            pose_scores=pose_scores(pose="neutral", confidence=0.62, primary_pinch=0.18),
            pinch_strength=0.22,
        )
    )

    assert any(
        event.get("type") == "gesture.intent"
        and event.get("gesture") == "primary-pinch"
        and event.get("phase") == "end"
        for event in release_events
    )
