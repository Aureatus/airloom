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


class StatusEvent(TypedDict):
    type: Literal["status"]
    tracking: bool
    pinchStrength: float
    gesture: str


GestureEvent = PointerObservedEvent | GestureIntentEvent | StatusEvent


class FrameState(TypedDict):
    tracking: bool
    pointer: NotRequired[Landmark]
    pinch_strength: float
    secondary_pinch_strength: float
    open_palm_hold: bool
    confidence: float
