from __future__ import annotations

from typing import Literal, NotRequired, TypedDict


class Landmark(TypedDict):
    x: float
    y: float


class PointerMoveEvent(TypedDict):
    type: Literal["pointer.move"]
    x: float
    y: float
    confidence: float


class PointerButtonEvent(TypedDict):
    type: Literal["pointer.down", "pointer.up", "click"]
    button: Literal["left", "right"]


class KeyTapEvent(TypedDict):
    type: Literal["key.tap"]
    key: str


class GestureTriggerEvent(TypedDict):
    type: Literal["gesture.trigger"]
    gesture: str


class StatusEvent(TypedDict):
    type: Literal["status"]
    tracking: bool
    pinchStrength: float
    gesture: str


GestureEvent = (
    PointerMoveEvent | PointerButtonEvent | KeyTapEvent | GestureTriggerEvent | StatusEvent
)


class FrameState(TypedDict):
    tracking: bool
    pointer: NotRequired[Landmark]
    pinch_strength: float
    secondary_pinch_strength: float
    open_palm_hold: bool
    confidence: float
