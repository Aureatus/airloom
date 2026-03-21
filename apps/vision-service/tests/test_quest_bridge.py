from typing import cast

from app.protocol import FrameState, GestureEvent, StatusDebug, empty_pose_scores
from app.quest_bridge import run_quest_bridge


class _FakeBridgeState:
    def __init__(self) -> None:
        self.bridge_url = "http://localhost:38419/"
        self._updates = [
            None,
            (
                1,
                {
                    "bridge_connected": True,
                    "bridge_url": self.bridge_url,
                    "hands": [{"handedness": "right", "landmarks": []}],
                },
            ),
        ]
        self._snapshots = [(False, False), (True, True)]

    def wait_for_update(self, _last_version: int, *, timeout: float):
        del timeout
        if not self._updates:
            return None
        return self._updates.pop(0)

    def connection_snapshot(self, *, now: float):
        del now
        if not self._snapshots:
            return (True, True)
        return self._snapshots.pop(0)


class _FakeServer:
    def __init__(self) -> None:
        self.bridge_state = _FakeBridgeState()

    def serve_forever(self) -> None:
        return

    def shutdown(self) -> None:
        return

    def server_close(self) -> None:
        return


class _FakeTracker:
    def process(self, payload: dict[str, object]) -> FrameState:
        tracking = bool(payload.get("hands"))
        return {
            "tracking": tracking,
            "tracking_backend": "quest-bridge",
            "pose": "neutral" if tracking else "unknown",
            "pose_confidence": 0.8 if tracking else 0.0,
            "pose_scores": empty_pose_scores(),
            "classifier_mode": "rules",
            "model_version": None,
            "pinch_strength": 0.72 if tracking else 0.0,
            "secondary_pinch_strength": 0.0,
            "open_palm_hold": False,
            "closed_fist": tracking,
            "bridge_connected": bool(payload.get("bridge_connected", False)),
            "bridge_url": cast(str, payload.get("bridge_url", "http://localhost:38419/")),
            "hands_tracked": len(cast(list[object], payload.get("hands", []))),
            "confidence": 0.9 if tracking else 0.0,
            "brightness": 0.5,
            "fallback_reason": "bridge-awaiting-connection" if not tracking else "live",
        }


class _FakeMachine:
    def update(self, frame: FrameState) -> list[GestureEvent]:
        debug: StatusDebug = {
            "trackingBackend": frame.get("tracking_backend", "quest-bridge"),
            "confidence": frame["confidence"],
            "brightness": frame.get("brightness", 0.5),
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
            "bridgeConnected": frame.get("bridge_connected", False),
            "bridgeUrl": frame.get("bridge_url", "http://localhost:38419/"),
            "handsTracked": frame.get("hands_tracked", 0),
        }
        if "fallback_reason" in frame:
            debug["fallbackReason"] = frame["fallback_reason"]
        return [
            {
                "type": "status",
                "tracking": frame["tracking"],
                "pinchStrength": frame["pinch_strength"],
                "gesture": frame.get("fallback_reason", "idle"),
                "debug": debug,
            }
        ]


def test_run_quest_bridge_emits_waiting_then_live_status() -> None:
    events: list[object] = []

    run_quest_bridge(
        2,
        emit_event=events.append,
        sleep_for=lambda _seconds: None,
        tracker_factory=_FakeTracker,
        machine_factory=_FakeMachine,
        server_factory=lambda _port: _FakeServer(),
    )

    assert cast(dict[str, object], events[0])["type"] == "capture.state"
    waiting = cast(dict[str, object], events[1])
    live = cast(dict[str, object], events[2])
    assert waiting["type"] == "status"
    assert waiting["tracking"] is False
    assert cast(dict[str, object], waiting["debug"])["bridgeConnected"] is False
    assert live["type"] == "status"
    assert live["tracking"] is True
    assert cast(dict[str, object], live["debug"])["bridgeConnected"] is True
    assert cast(dict[str, object], live["debug"])["handsTracked"] == 1
