from __future__ import annotations

from dataclasses import dataclass

from app.protocol import (
    FrameState,
    GestureEvent,
    PoseScores,
    StatusDebug,
    StatusEvent,
    empty_pose_scores,
)

PRIMARY_PINCH_ON_FRAMES = 1
PRIMARY_PINCH_OFF_FRAMES = 1
SECONDARY_PINCH_ON_FRAMES = 1
SECONDARY_PINCH_OFF_FRAMES = 1
PRIMARY_PINCH_SUSTAIN_STRENGTH = 0.72
PRIMARY_PINCH_SUSTAIN_SCORE = 0.46
SECONDARY_PINCH_SUSTAIN_STRENGTH = 0.72
SECONDARY_PINCH_SUSTAIN_SCORE = 0.46
CLOSED_FIST_SUSTAIN_SCORE = 0.5


def _frame_pose_scores(frame: FrameState) -> PoseScores:
    return frame.get("pose_scores") or empty_pose_scores()


@dataclass(slots=True)
class GestureMachine:
    pinch_active: bool = False
    drag_active: bool = False
    secondary_pinch_active: bool = False
    open_palm_counter: int = 0
    primary_pinch_counter: int = 0
    primary_pinch_release_counter: int = 0
    secondary_pinch_counter: int = 0
    secondary_pinch_release_counter: int = 0
    closed_fist_counter: int = 0
    closed_fist_release_counter: int = 0
    closed_fist_latched: bool = False

    def update(self, frame: FrameState) -> list[GestureEvent]:
        events: list[GestureEvent] = []
        tracking = frame["tracking"]
        pose = frame.get("pose", "unknown")
        pose_confidence = frame.get("pose_confidence", 0.0)
        pose_scores = _frame_pose_scores(frame)
        pinch_strength = frame["pinch_strength"]
        secondary_pinch_strength = frame["secondary_pinch_strength"]
        closed_fist_score = pose_scores["closed-fist"]
        primary_pinch_score = pose_scores["primary-pinch"]
        secondary_pinch_score = pose_scores["secondary-pinch"]
        closed_fist = pose == "closed-fist" or (
            (self.closed_fist_counter > 0 or self.closed_fist_latched)
            and pose not in {"primary-pinch", "secondary-pinch", "open-palm"}
            and closed_fist_score >= CLOSED_FIST_SUSTAIN_SCORE
        )
        open_palm_hold = pose == "open-palm"
        primary_pinch = pose == "primary-pinch" or (
            self.pinch_active
            and pose != "closed-fist"
            and closed_fist_score < 0.6
            and pinch_strength >= PRIMARY_PINCH_SUSTAIN_STRENGTH
            and primary_pinch_score >= PRIMARY_PINCH_SUSTAIN_SCORE
        )
        secondary_pinch = pose == "secondary-pinch" or (
            self.secondary_pinch_active
            and pose != "closed-fist"
            and closed_fist_score < 0.6
            and secondary_pinch_strength >= SECONDARY_PINCH_SUSTAIN_STRENGTH
            and secondary_pinch_score >= SECONDARY_PINCH_SUSTAIN_SCORE
        )

        status_event: StatusEvent = {
            "type": "status",
            "tracking": tracking,
            "pinchStrength": pinch_strength,
            "gesture": pose if pose not in {"neutral", "unknown"} else "idle",
        }
        status_debug: StatusDebug = {
            "confidence": frame["confidence"],
            "brightness": frame.get("brightness", 0.0),
            "frameDelayMs": frame.get("delay_ms", 0),
            "pose": pose,
            "poseConfidence": pose_confidence,
            "poseScores": pose_scores,
            "classifierMode": frame.get("classifier_mode", "rules"),
            "modelVersion": frame.get("model_version"),
            "closedFist": closed_fist,
            "closedFistFrames": self.closed_fist_counter,
            "closedFistReleaseFrames": self.closed_fist_release_counter,
            "closedFistLatched": self.closed_fist_latched,
            "openPalmHold": open_palm_hold,
            "secondaryPinchStrength": secondary_pinch_strength,
        }
        if "learned_pose" in frame:
            status_debug["learnedPose"] = frame["learned_pose"]
            status_debug["learnedPoseConfidence"] = frame.get("learned_pose_confidence", 0.0)
        if "shadow_disagreement" in frame:
            status_debug["shadowDisagreement"] = frame["shadow_disagreement"]
        status_event["debug"] = status_debug

        if not tracking:
            self.pinch_active = False
            self.drag_active = False
            self.secondary_pinch_active = False
            self.open_palm_counter = 0
            self.primary_pinch_counter = 0
            self.primary_pinch_release_counter = 0
            self.secondary_pinch_counter = 0
            self.secondary_pinch_release_counter = 0
            self.closed_fist_counter = 0
            self.closed_fist_release_counter = 0
            self.closed_fist_latched = False
            status_debug["closedFistFrames"] = 0
            status_debug["closedFistReleaseFrames"] = 0
            status_debug["closedFistLatched"] = False
            status_event["gesture"] = "searching"
            events.append(status_event)
            return events

        pointer = frame.get("pointer")
        if pointer is not None and closed_fist:
            events.append(
                {
                    "type": "pointer.observed",
                    "x": pointer["x"],
                    "y": pointer["y"],
                    "confidence": frame["confidence"],
                }
            )

        if primary_pinch:
            self.primary_pinch_counter += 1
            self.primary_pinch_release_counter = 0
            if self.primary_pinch_counter >= PRIMARY_PINCH_ON_FRAMES and not self.pinch_active:
                self.pinch_active = True
                self.drag_active = True
                status_event["gesture"] = "pinch-start"
                events.append(
                    {"type": "gesture.intent", "gesture": "primary-pinch", "phase": "start"}
                )
        else:
            self.primary_pinch_counter = 0
            if self.pinch_active:
                self.primary_pinch_release_counter += 1
                if self.primary_pinch_release_counter >= PRIMARY_PINCH_OFF_FRAMES:
                    self.pinch_active = False
                    status_event["gesture"] = "pinch-release"
                    if self.drag_active:
                        self.drag_active = False
                        events.append(
                            {"type": "gesture.intent", "gesture": "primary-pinch", "phase": "end"}
                        )
            else:
                self.primary_pinch_release_counter = 0

        if secondary_pinch:
            self.secondary_pinch_counter += 1
            self.secondary_pinch_release_counter = 0
            if (
                self.secondary_pinch_counter >= SECONDARY_PINCH_ON_FRAMES
                and not self.secondary_pinch_active
            ):
                self.secondary_pinch_active = True
                status_event["gesture"] = "right-click"
                events.append(
                    {
                        "type": "gesture.intent",
                        "gesture": "thumb-middle-pinch",
                        "phase": "instant",
                    }
                )
        else:
            self.secondary_pinch_counter = 0
            if self.secondary_pinch_active:
                self.secondary_pinch_release_counter += 1
                if self.secondary_pinch_release_counter >= SECONDARY_PINCH_OFF_FRAMES:
                    self.secondary_pinch_active = False
            else:
                self.secondary_pinch_release_counter = 0

        if closed_fist:
            self.pinch_active = False
            self.drag_active = False
            self.secondary_pinch_active = False
            self.primary_pinch_counter = 0
            self.primary_pinch_release_counter = 0
            self.secondary_pinch_counter = 0
            self.secondary_pinch_release_counter = 0
            self.closed_fist_counter += 1
            self.closed_fist_release_counter = 0
            self.closed_fist_latched = True
            status_event["gesture"] = "closed-fist"
        else:
            self.closed_fist_counter = 0
            self.closed_fist_release_counter += 1
            self.closed_fist_latched = False

        status_debug["closedFistFrames"] = self.closed_fist_counter
        status_debug["closedFistReleaseFrames"] = self.closed_fist_release_counter
        status_debug["closedFistLatched"] = self.closed_fist_latched

        if self.drag_active:
            status_event["gesture"] = "dragging"

        if open_palm_hold:
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
