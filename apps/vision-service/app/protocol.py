from __future__ import annotations

from typing import Literal, NotRequired, TypedDict


class Landmark(TypedDict):
    x: float
    y: float


class PointerObservedEvent(TypedDict):
    type: Literal["pointer.observed"]
    x: float
    y: float
    confidence: float


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


class StatusEvent(TypedDict):
    type: Literal["status"]
    tracking: bool
    pinchStrength: float
    gesture: str
    debug: NotRequired[StatusDebug]


class StatusDebug(TypedDict):
    confidence: float
    brightness: float
    closedFist: bool
    openPalmHold: bool
    secondaryPinchStrength: float


GestureEvent = PointerObservedEvent | GestureIntentEvent | DebugFrameEvent | StatusEvent


class FrameState(TypedDict):
    tracking: bool
    pointer: NotRequired[Landmark]
    raw_pointer: NotRequired[Landmark]
    pinch_strength: float
    secondary_pinch_strength: float
    open_palm_hold: bool
    closed_fist: NotRequired[bool]
    confidence: float
    brightness: NotRequired[float]
    hand_landmarks: NotRequired[list[Landmark]]
    delay_ms: NotRequired[int]
