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


def test_closed_fist_near_pinch_fixture_never_emits_primary_pinch() -> None:
    events = run_replay(load_fixture(FIXTURES / "closed-fist-near-pinch.json"))

    assert any(
        event.get("type") == "gesture.intent"
        and event.get("gesture") == "closed-fist"
        and event.get("phase") == "instant"
        for event in events
    )
    assert not any(
        event.get("type") == "gesture.intent" and event.get("gesture") == "primary-pinch"
        for event in events
    )


def test_capture_document_frames_can_be_replayed(tmp_path) -> None:
    fixture_path = tmp_path / "capture.json"
    fixture_path.write_text(
        """
        {
          "sessionId": "session-1",
          "label": "primary-pinch",
          "frames": [
            {
              "tracking": true,
              "brightness": 0.4,
              "landmarks": [{"x": 0.1, "y": 0.1}],
              "features": {
                "primary_pinch_strength": 0.85,
                "secondary_pinch_strength": 0.12
              },
              "rulePose": "primary-pinch",
              "ruleConfidence": 0.85,
              "ruleScores": {
                "neutral": 0.05,
                "open-palm": 0.1,
                "closed-fist": 0.02,
                "primary-pinch": 0.85,
                "secondary-pinch": 0.08
              }
            },
            {
              "tracking": true,
              "brightness": 0.4,
              "landmarks": [{"x": 0.1, "y": 0.1}],
              "features": {
                "primary_pinch_strength": 0.2,
                "secondary_pinch_strength": 0.1
              },
              "rulePose": "neutral",
              "ruleConfidence": 0.7,
              "ruleScores": {
                "neutral": 0.7,
                "open-palm": 0.1,
                "closed-fist": 0.02,
                "primary-pinch": 0.2,
                "secondary-pinch": 0.03
              }
            }
          ]
        }
        """
    )

    events = run_replay(load_fixture(fixture_path))

    assert any(
        event.get("type") == "gesture.intent"
        and event.get("gesture") == "primary-pinch"
        and event.get("phase") == "start"
        for event in events
    )
