from app.gestures import GestureMachine, compute_pinch_strength


def test_compute_pinch_strength_increases_as_points_move_closer() -> None:
    loose = compute_pinch_strength({"x": 0.1, "y": 0.1}, {"x": 0.35, "y": 0.35})
    tight = compute_pinch_strength({"x": 0.1, "y": 0.1}, {"x": 0.14, "y": 0.14})

    assert tight > loose


def test_gesture_machine_click_cycle() -> None:
    machine = GestureMachine()

    down_events = machine.update(
        {
            "tracking": True,
            "pointer": {"x": 0.5, "y": 0.4},
            "pinch_strength": 0.81,
            "secondary_pinch_strength": 0.12,
            "open_palm_hold": False,
            "confidence": 0.93,
        }
    )
    up_events = machine.update(
        {
            "tracking": True,
            "pointer": {"x": 0.51, "y": 0.41},
            "pinch_strength": 0.34,
            "secondary_pinch_strength": 0.12,
            "open_palm_hold": False,
            "confidence": 0.93,
        }
    )

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
            {
                "tracking": True,
                "pointer": {"x": 0.3, "y": 0.2},
                "pinch_strength": 0.12,
                "secondary_pinch_strength": 0.18,
                "open_palm_hold": True,
                "confidence": 0.88,
            }
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
        {
            "tracking": True,
            "pointer": {"x": 0.4, "y": 0.3},
            "pinch_strength": 0.2,
            "secondary_pinch_strength": 0.84,
            "open_palm_hold": False,
            "confidence": 0.9,
        }
    )
    held_events = machine.update(
        {
            "tracking": True,
            "pointer": {"x": 0.41, "y": 0.3},
            "pinch_strength": 0.2,
            "secondary_pinch_strength": 0.86,
            "open_palm_hold": False,
            "confidence": 0.9,
        }
    )
    release_events = machine.update(
        {
            "tracking": True,
            "pointer": {"x": 0.42, "y": 0.31},
            "pinch_strength": 0.2,
            "secondary_pinch_strength": 0.2,
            "open_palm_hold": False,
            "confidence": 0.9,
        }
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
