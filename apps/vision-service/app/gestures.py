from __future__ import annotations

from dataclasses import dataclass

from app.protocol import FrameState, GestureEvent, Landmark, StatusEvent

PINCH_ON_THRESHOLD = 0.78
PINCH_OFF_THRESHOLD = 0.52
RIGHT_CLICK_ON_THRESHOLD = 0.8
RIGHT_CLICK_OFF_THRESHOLD = 0.56


def _distance(a: Landmark, b: Landmark) -> float:
    return ((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2) ** 0.5


def compute_pinch_strength(thumb_tip: Landmark, index_tip: Landmark) -> float:
    distance = _distance(thumb_tip, index_tip)
    return max(0.0, min(1.0, 1 - (distance / 0.25)))


@dataclass(slots=True)
class GestureMachine:
    pinch_active: bool = False
    drag_active: bool = False
    secondary_pinch_active: bool = False
    open_palm_counter: int = 0

    def update(self, frame: FrameState) -> list[GestureEvent]:
        events: list[GestureEvent] = []
        tracking = frame["tracking"]
        pinch_strength = frame["pinch_strength"]
        secondary_pinch_strength = frame["secondary_pinch_strength"]

        status_event: StatusEvent = {
            "type": "status",
            "tracking": tracking,
            "pinchStrength": pinch_strength,
            "gesture": "idle",
        }

        if not tracking:
            self.pinch_active = False
            self.drag_active = False
            self.secondary_pinch_active = False
            self.open_palm_counter = 0
            status_event["gesture"] = "searching"
            events.append(status_event)
            return events

        pointer = frame.get("pointer")
        if pointer is not None:
            events.append(
                {
                    "type": "pointer.observed",
                    "x": pointer["x"],
                    "y": pointer["y"],
                    "confidence": frame["confidence"],
                }
            )

        if pinch_strength >= PINCH_ON_THRESHOLD and not self.pinch_active:
            self.pinch_active = True
            self.drag_active = True
            status_event["gesture"] = "pinch-start"
            events.append({"type": "gesture.intent", "gesture": "primary-pinch", "phase": "start"})
        elif pinch_strength <= PINCH_OFF_THRESHOLD and self.pinch_active:
            self.pinch_active = False
            status_event["gesture"] = "pinch-release"
            if self.drag_active:
                self.drag_active = False
                events.append(
                    {"type": "gesture.intent", "gesture": "primary-pinch", "phase": "end"}
                )
        elif self.drag_active:
            status_event["gesture"] = "dragging"

        if secondary_pinch_strength >= RIGHT_CLICK_ON_THRESHOLD and not self.secondary_pinch_active:
            self.secondary_pinch_active = True
            status_event["gesture"] = "right-click"
            events.append(
                {
                    "type": "gesture.intent",
                    "gesture": "thumb-middle-pinch",
                    "phase": "instant",
                }
            )
        elif secondary_pinch_strength <= RIGHT_CLICK_OFF_THRESHOLD and self.secondary_pinch_active:
            self.secondary_pinch_active = False

        if frame["open_palm_hold"]:
            self.open_palm_counter += 1
            if self.open_palm_counter == 12:
                status_event["gesture"] = "open-palm-hold"
                events.append(
                    {
                        "type": "gesture.intent",
                        "gesture": "open-palm-hold",
                        "phase": "instant",
                    }
                )
        else:
            self.open_palm_counter = 0

        events.append(status_event)
        return events
