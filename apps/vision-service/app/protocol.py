from __future__ import annotations

from typing import Literal, NotRequired, TypedDict


class Landmark(TypedDict):
    x: float
    y: float


PoseName = Literal[
    "unknown",
    "neutral",
    "open-palm",
    "closed-fist",
    "primary-pinch",
    "secondary-pinch",
]

PoseClassifierMode = Literal["rules", "shadow", "learned"]


PoseScores = TypedDict(
    "PoseScores",
    {
        "neutral": float,
        "open-palm": float,
        "closed-fist": float,
        "primary-pinch": float,
        "secondary-pinch": float,
    },
)


def empty_pose_scores() -> PoseScores:
    return {
        "neutral": 0.0,
        "open-palm": 0.0,
        "closed-fist": 0.0,
        "primary-pinch": 0.0,
        "secondary-pinch": 0.0,
    }


def pose_scores_for_pose(pose: PoseName, confidence: float) -> PoseScores:
    scores = empty_pose_scores()
    if pose != "unknown":
        scores[pose] = confidence
    return scores


CaptureCounts = TypedDict(
    "CaptureCounts",
    {
        "neutral": int,
        "open-palm": int,
        "closed-fist": int,
        "primary-pinch": int,
        "secondary-pinch": int,
    },
)


def empty_capture_counts() -> CaptureCounts:
    return {
        "neutral": 0,
        "open-palm": 0,
        "closed-fist": 0,
        "primary-pinch": 0,
        "secondary-pinch": 0,
    }


class PoseObservation(TypedDict):
    pose: PoseName
    confidence: float
    scores: PoseScores


class PointerObservedEvent(TypedDict):
    type: Literal["pointer.observed"]
    x: float
    y: float
    confidence: float


class ScrollObservedEvent(TypedDict):
    type: Literal["scroll.observed"]
    amount: float


class GestureIntentEvent(TypedDict):
    type: Literal["gesture.intent"]
    gesture: str
    phase: Literal["start", "end", "instant"]


class DebugFrameEvent(TypedDict):
    type: Literal["debug.frame"]
    mimeType: Literal["image/jpeg"]
    data: str
    width: int
    height: int


class CaptureStateEvent(TypedDict):
    type: Literal["capture.state"]
    sessionId: str
    activeLabel: PoseName
    recording: bool
    takeCount: int
    counts: CaptureCounts
    lastTakeId: str | None
    exportPath: str | None
    message: str | None


class StatusEvent(TypedDict):
    type: Literal["status"]
    tracking: bool
    pinchStrength: float
    gesture: str
    debug: NotRequired[StatusDebug]


class StatusDebug(TypedDict):
    confidence: float
    brightness: float
    frameDelayMs: int
    pose: PoseName
    poseConfidence: float
    poseScores: PoseScores
    classifierMode: PoseClassifierMode
    modelVersion: str | None
    learnedPose: NotRequired[PoseName]
    learnedPoseConfidence: NotRequired[float]
    shadowDisagreement: NotRequired[bool]
    closedFist: bool
    closedFistFrames: int
    closedFistReleaseFrames: int
    closedFistLatched: bool
    openPalmHold: bool
    secondaryPinchStrength: float
    pointerHand: NotRequired[str]
    actionHand: NotRequired[str]
    fallbackReason: NotRequired[str]


GestureEvent = (
    PointerObservedEvent
    | ScrollObservedEvent
    | GestureIntentEvent
    | DebugFrameEvent
    | StatusEvent
    | CaptureStateEvent
)


class FrameState(TypedDict):
    tracking: bool
    pointer: NotRequired[Landmark]
    raw_pointer: NotRequired[Landmark]
    pose: PoseName
    pose_confidence: float
    pose_scores: NotRequired[PoseScores]
    classifier_mode: NotRequired[PoseClassifierMode]
    model_version: NotRequired[str | None]
    learned_pose: NotRequired[PoseName]
    learned_pose_confidence: NotRequired[float]
    shadow_disagreement: NotRequired[bool]
    pinch_strength: float
    secondary_pinch_strength: float
    action_pose: NotRequired[PoseName]
    action_pose_confidence: NotRequired[float]
    action_pose_scores: NotRequired[PoseScores]
    action_pinch_strength: NotRequired[float]
    action_secondary_pinch_strength: NotRequired[float]
    action_open_palm_hold: NotRequired[bool]
    action_hand_separate: NotRequired[bool]
    action_pointer: NotRequired[Landmark]
    pointer_hand: NotRequired[str]
    action_hand: NotRequired[str]
    open_palm_hold: bool
    closed_fist: NotRequired[bool]
    confidence: float
    brightness: NotRequired[float]
    hand_landmarks: NotRequired[list[Landmark]]
    feature_values: NotRequired[dict[str, float]]
    delay_ms: NotRequired[int]
    fallback_reason: NotRequired[str]
