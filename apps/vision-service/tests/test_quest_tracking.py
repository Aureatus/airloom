from app.quest_tracking import QuestTracker


def _hand(center_x: float, *, handedness: str, pinch: bool = False) -> dict[str, object]:
    wrist_y = 0.82
    mcp_y = 0.7
    pip_y = 0.54
    tip_y = 0.3
    thumb_tip_x = center_x - 0.12 if handedness == "right" else center_x + 0.12
    index_tip_x = center_x - 0.05 if handedness == "right" else center_x + 0.05
    if pinch:
        thumb_tip_x = index_tip_x
        tip_y = 0.38

    landmarks = [
        {"x": center_x, "y": wrist_y},
        {"x": center_x - 0.06, "y": 0.72},
        {"x": center_x - 0.09, "y": 0.61},
        {"x": center_x - 0.11, "y": 0.49},
        {"x": thumb_tip_x, "y": 0.39 if pinch else 0.47},
        {"x": center_x - 0.08, "y": mcp_y},
        {"x": center_x - 0.07, "y": pip_y},
        {"x": center_x - 0.06, "y": 0.41},
        {"x": index_tip_x, "y": tip_y},
        {"x": center_x - 0.02, "y": mcp_y},
        {"x": center_x - 0.01, "y": pip_y},
        {"x": center_x, "y": 0.4},
        {"x": center_x + 0.01, "y": 0.26},
        {"x": center_x + 0.04, "y": mcp_y},
        {"x": center_x + 0.05, "y": pip_y},
        {"x": center_x + 0.06, "y": 0.43},
        {"x": center_x + 0.07, "y": 0.32},
        {"x": center_x + 0.1, "y": mcp_y},
        {"x": center_x + 0.11, "y": pip_y},
        {"x": center_x + 0.12, "y": 0.48},
        {"x": center_x + 0.13, "y": 0.38},
    ]
    return {
        "handedness": handedness,
        "confidence": 0.95,
        "landmarks": landmarks,
    }


def test_quest_tracker_maps_bridge_fields_and_roles() -> None:
    tracker = QuestTracker(pointer_hand_preference="right", action_hand_preference="left")

    frame = tracker.process(
        {
            "bridge_connected": True,
            "bridge_url": "http://localhost:38419/",
            "hands": [
                _hand(0.7, handedness="right"),
                _hand(0.3, handedness="left", pinch=True),
            ],
        }
    )

    assert frame["tracking"] is True
    assert frame["tracking_backend"] == "quest-bridge"
    assert frame["preview_available"] is False
    assert frame["bridge_connected"] is True
    assert frame["bridge_url"] == "http://localhost:38419/"
    assert frame["hands_tracked"] == 2
    assert frame["pointer_hand"] == "right"
    assert frame["action_hand"] == "left"
    assert frame["action_hand_separate"] is True
    assert frame["pinch_strength"] > 0.6


def test_quest_tracker_reports_no_hands_disconnect() -> None:
    tracker = QuestTracker(tracking_hold_frames=0)

    frame = tracker.process(
        {
            "bridge_connected": False,
            "bridge_url": "http://localhost:38419/",
            "hands": [],
        }
    )

    assert frame["tracking"] is False
    assert frame["tracking_backend"] == "quest-bridge"
    assert frame["bridge_connected"] is False
    assert frame["hands_tracked"] == 0
    assert frame["fallback_reason"] == "no-hands"
