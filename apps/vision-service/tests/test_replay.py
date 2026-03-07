from pathlib import Path

from app.replay import load_fixture, run_replay

FIXTURES = Path(__file__).parent / "fixtures" / "landmark_sequences"


def test_combo_fixture_emits_click_right_and_enter_intents() -> None:
    events = run_replay(load_fixture(FIXTURES / "combo-click-right-enter.json"))

    assert any(
        event.get("type") == "gesture.intent"
        and event.get("gesture") == "primary-pinch"
        and event.get("phase") == "start"
        for event in events
    )
    assert any(
        event.get("type") == "gesture.intent"
        and event.get("gesture") == "primary-pinch"
        and event.get("phase") == "end"
        for event in events
    )
    assert any(
        event.get("type") == "gesture.intent"
        and event.get("gesture") == "thumb-middle-pinch"
        and event.get("phase") == "instant"
        for event in events
    )
    assert any(
        event.get("type") == "gesture.intent"
        and event.get("gesture") == "open-palm-hold"
        and event.get("phase") == "instant"
        for event in events
    )


def test_drag_fixture_emits_one_press_cycle_without_secondary_intents() -> None:
    events = run_replay(load_fixture(FIXTURES / "drag-release.json"))

    primary_events = [
        event
        for event in events
        if event.get("type") == "gesture.intent" and event.get("gesture") == "primary-pinch"
    ]

    assert [event.get("phase") for event in primary_events] == ["start", "end"]
    assert not any(
        event.get("type") == "gesture.intent" and event.get("gesture") == "thumb-middle-pinch"
        for event in events
    )
