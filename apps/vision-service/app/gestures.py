from __future__ import annotations

from dataclasses import dataclass
from typing import cast

from app.protocol import (
    FrameState,
    GestureEvent,
    PoseScores,
    StatusDebug,
    StatusEvent,
    empty_pose_scores,
)

PRIMARY_PINCH_ON_FRAMES = 1
PRIMARY_PINCH_OFF_FRAMES = 2
PRIMARY_PINCH_REARM_FRAMES = 3
SECONDARY_PINCH_ON_FRAMES = 1
SECONDARY_PINCH_OFF_FRAMES = 1
PRIMARY_PINCH_SUSTAIN_STRENGTH = 0.72
PRIMARY_PINCH_SUSTAIN_SCORE = 0.46
SECONDARY_PINCH_SUSTAIN_STRENGTH = 0.72
SECONDARY_PINCH_SUSTAIN_SCORE = 0.46
PEACE_SIGN_ON_FRAMES = 2
PEACE_SIGN_OFF_FRAMES = 2
PEACE_SIGN_SUSTAIN_SCORE = 0.58
CLOSED_FIST_SUSTAIN_SCORE = 0.5
SECONDARY_PINCH_SCROLL_MIN_DELTA = 0.01
SECONDARY_PINCH_SCROLL_GAIN = 90.0


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
    primary_pinch_cooldown_frames: int = 0
    peace_sign_active: bool = False
    peace_sign_counter: int = 0
    peace_sign_release_counter: int = 0
    secondary_pinch_counter: int = 0
    secondary_pinch_release_counter: int = 0
    secondary_pinch_scroll_anchor_y: float | None = None
    secondary_pinch_scrolled: bool = False
    closed_fist_counter: int = 0
    closed_fist_release_counter: int = 0
    closed_fist_latched: bool = False

    def update(self, frame: FrameState) -> list[GestureEvent]:
        events: list[GestureEvent] = []
        primary_pinch_rearmed = False
        tracking = frame["tracking"]
        pose = frame.get("pose", "unknown")
        pose_confidence = frame.get("pose_confidence", 0.0)
        pose_scores = _frame_pose_scores(frame)
        action_pose = frame.get("action_pose", pose)
        action_pose_scores = cast(PoseScores, frame.get("action_pose_scores", pose_scores))
        pinch_strength = frame.get("action_pinch_strength", frame["pinch_strength"])
        secondary_pinch_strength = frame.get(
            "action_secondary_pinch_strength",
            frame["secondary_pinch_strength"],
        )
        action_hand_separate = frame.get("action_hand_separate", False)
        action_pointer = frame.get("action_pointer")
        closed_fist_score = pose_scores["closed-fist"]
        action_closed_fist_score = action_pose_scores["closed-fist"]
        primary_pinch_score = action_pose_scores["primary-pinch"]
        secondary_pinch_score = action_pose_scores["secondary-pinch"]
        peace_sign_score = action_pose_scores["peace-sign"]
        closed_fist = pose == "closed-fist" or (
            (self.closed_fist_counter > 0 or self.closed_fist_latched)
            and pose not in {"primary-pinch", "secondary-pinch", "open-palm"}
            and closed_fist_score >= CLOSED_FIST_SUSTAIN_SCORE
        )
        open_palm_hold = frame.get("action_open_palm_hold", action_pose == "open-palm")
        peace_sign = action_pose == "peace-sign" or (
            self.peace_sign_active
            and peace_sign_score >= PEACE_SIGN_SUSTAIN_SCORE
            and action_pose not in {"primary-pinch", "secondary-pinch", "closed-fist"}
        )
        primary_pinch = action_pose == "primary-pinch" or (
            self.pinch_active
            and action_pose != "closed-fist"
            and action_closed_fist_score < 0.6
            and pinch_strength >= PRIMARY_PINCH_SUSTAIN_STRENGTH
            and primary_pinch_score >= PRIMARY_PINCH_SUSTAIN_SCORE
        )
        if not self.pinch_active and self.primary_pinch_cooldown_frames > 0:
            primary_pinch = False
        secondary_pinch = action_pose == "secondary-pinch" or (
            self.secondary_pinch_active
            and action_pose != "closed-fist"
            and action_closed_fist_score < 0.6
            and secondary_pinch_strength >= SECONDARY_PINCH_SUSTAIN_STRENGTH
            and secondary_pinch_score >= SECONDARY_PINCH_SUSTAIN_SCORE
        )
        if peace_sign:
            primary_pinch = False
            secondary_pinch = False
            open_palm_hold = False

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
        if "pointer_hand" in frame:
            status_debug["pointerHand"] = frame["pointer_hand"]
        if "action_hand" in frame:
            status_debug["actionHand"] = frame["action_hand"]
        if "fallback_reason" in frame:
            status_debug["fallbackReason"] = frame["fallback_reason"]
        if "learned_pose" in frame:
            status_debug["learnedPose"] = frame["learned_pose"]
            status_debug["learnedPoseConfidence"] = frame.get("learned_pose_confidence", 0.0)
        if "shadow_disagreement" in frame:
            status_debug["shadowDisagreement"] = frame["shadow_disagreement"]
        status_event["debug"] = status_debug

        if not tracking:
            if self.peace_sign_active:
                events.append({"type": "gesture.intent", "gesture": "peace-sign", "phase": "end"})
            self.pinch_active = False
            self.drag_active = False
            self.secondary_pinch_active = False
            self.open_palm_counter = 0
            self.primary_pinch_counter = 0
            self.primary_pinch_release_counter = 0
            self.primary_pinch_cooldown_frames = 0
            self.peace_sign_active = False
            self.peace_sign_counter = 0
            self.peace_sign_release_counter = 0
            self.secondary_pinch_counter = 0
            self.secondary_pinch_release_counter = 0
            self.secondary_pinch_scroll_anchor_y = None
            self.secondary_pinch_scrolled = False
            self.closed_fist_counter = 0
            self.closed_fist_release_counter = 0
            self.closed_fist_latched = False
            status_debug["closedFistFrames"] = 0
            status_debug["closedFistReleaseFrames"] = 0
            status_debug["closedFistLatched"] = False
            status_event["gesture"] = "searching"
            events.append(status_event)
            return events

        if peace_sign:
            self.peace_sign_counter += 1
            self.peace_sign_release_counter = 0
            if self.peace_sign_counter >= PEACE_SIGN_ON_FRAMES and not self.peace_sign_active:
                self.peace_sign_active = True
                status_event["gesture"] = "push-to-talk"
                events.append({"type": "gesture.intent", "gesture": "peace-sign", "phase": "start"})
        else:
            self.peace_sign_counter = 0
            if self.peace_sign_active:
                self.peace_sign_release_counter += 1
                if self.peace_sign_release_counter >= PEACE_SIGN_OFF_FRAMES:
                    self.peace_sign_active = False
                    status_event["gesture"] = "push-to-talk-release"
                    events.append(
                        {"type": "gesture.intent", "gesture": "peace-sign", "phase": "end"}
                    )
            else:
                self.peace_sign_release_counter = 0

        if self.peace_sign_active:
            status_event["gesture"] = "push-to-talk"

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
                        self.primary_pinch_cooldown_frames = PRIMARY_PINCH_REARM_FRAMES
                        primary_pinch_rearmed = True
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
                self.secondary_pinch_scroll_anchor_y = None
                self.secondary_pinch_scrolled = False
        else:
            self.secondary_pinch_counter = 0
            if self.secondary_pinch_active:
                self.secondary_pinch_release_counter += 1
                if self.secondary_pinch_release_counter >= SECONDARY_PINCH_OFF_FRAMES:
                    if not self.secondary_pinch_scrolled:
                        status_event["gesture"] = "right-click"
                        events.append(
                            {
                                "type": "gesture.intent",
                                "gesture": "thumb-middle-pinch",
                                "phase": "instant",
                            }
                        )
                    self.secondary_pinch_active = False
                    self.secondary_pinch_scroll_anchor_y = None
                    self.secondary_pinch_scrolled = False
            else:
                self.secondary_pinch_release_counter = 0

        if closed_fist:
            if not action_hand_separate:
                self.pinch_active = False
                self.drag_active = False
                self.peace_sign_active = False
                self.peace_sign_counter = 0
                self.peace_sign_release_counter = 0
                self.secondary_pinch_active = False
                self.primary_pinch_counter = 0
                self.primary_pinch_release_counter = 0
                self.primary_pinch_cooldown_frames = 0
                self.secondary_pinch_counter = 0
                self.secondary_pinch_release_counter = 0
            self.closed_fist_counter += 1
            self.closed_fist_release_counter = 0
            self.closed_fist_latched = True
            if not action_hand_separate:
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

        if self.secondary_pinch_active and action_pointer is not None:
            action_y = action_pointer["y"]
            if self.secondary_pinch_scroll_anchor_y is None:
                self.secondary_pinch_scroll_anchor_y = action_y
            else:
                delta_y = action_y - self.secondary_pinch_scroll_anchor_y
                if abs(delta_y) >= SECONDARY_PINCH_SCROLL_MIN_DELTA:
                    self.secondary_pinch_scrolled = True
                    status_event["gesture"] = "scrolling"
                    events.append(
                        {
                            "type": "scroll.observed",
                            "amount": delta_y * SECONDARY_PINCH_SCROLL_GAIN,
                        }
                    )
                    self.secondary_pinch_scroll_anchor_y = action_y

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

        if (
            self.primary_pinch_cooldown_frames > 0
            and not self.pinch_active
            and not primary_pinch_rearmed
        ):
            self.primary_pinch_cooldown_frames -= 1

        return events
