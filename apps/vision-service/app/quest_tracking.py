from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, cast

from app.hand_tracking import (
    _clamp_unit,
    _hand_center,
    _pointer_anchor,
    _remap_pointer_axis,
    _select_hand_roles,
    _vertical_pointer_margin,
)
from app.pose_classifier import classify_pose_with_mode, try_load_pose_model
from app.pose_features import extract_pose_features, flatten_pose_features
from app.protocol import (
    FrameState,
    Landmark,
    PoseClassifierMode,
    PoseName,
    PoseScores,
    empty_pose_scores,
)

QuestHandPreference = Literal["auto", "left", "right"]


def _env_value(name: str, legacy_name: str, default: str) -> str:
    return os.environ.get(name) or os.environ.get(legacy_name, default)


def _normalize_handedness(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    if normalized in {"left", "right"}:
        return normalized
    return None


def _normalize_landmarks(value: object) -> list[Landmark]:
    if not isinstance(value, list):
        return []

    landmarks: list[Landmark] = []
    for point in value:
        if not isinstance(point, dict):
            return []
        x = point.get("x")
        y = point.get("y")
        if not isinstance(x, int | float) or not isinstance(y, int | float):
            return []
        landmarks.append({"x": float(x), "y": float(y)})
    return landmarks


def _empty_frame_state(
    *,
    classifier_mode: PoseClassifierMode,
    model_version: str | None,
    fallback_reason: str,
    bridge_connected: bool,
    bridge_url: str | None,
    hands_tracked: int,
) -> FrameState:
    frame_state: FrameState = {
        "tracking": False,
        "tracking_backend": "quest-bridge",
        "device_name": "Meta Quest Browser",
        "preview_available": False,
        "pose": "unknown",
        "pose_confidence": 0.0,
        "pose_scores": empty_pose_scores(),
        "classifier_mode": classifier_mode,
        "model_version": model_version,
        "pinch_strength": 0.0,
        "secondary_pinch_strength": 0.0,
        "open_palm_hold": False,
        "closed_fist": False,
        "bridge_connected": bridge_connected,
        "hands_tracked": hands_tracked,
        "confidence": 0.0,
        "brightness": 0.5,
        "fallback_reason": fallback_reason,
    }
    if bridge_url is not None:
        frame_state["bridge_url"] = bridge_url
    return frame_state


@dataclass(frozen=True, slots=True)
class _TrackedQuestHand:
    pose: PoseName
    pose_confidence: float
    pose_scores: PoseScores
    classifier_mode: PoseClassifierMode
    model_version: str | None
    primary_pinch_strength: float
    secondary_pinch_strength: float
    open_palm_hold: bool
    closed_fist: bool
    raw_pointer: Landmark
    hand_landmarks: list[Landmark]
    feature_values: dict[str, float]
    center: Landmark
    handedness: str | None
    confidence: float
    learned_pose: PoseName | None = None
    learned_pose_confidence: float | None = None
    shadow_disagreement: bool | None = None


@dataclass(slots=True)
class QuestTracker:
    smoothing_alpha: float = field(
        default_factory=lambda: float(
            _env_value("INCANTATION_SMOOTHING_ALPHA", "AIRLOOM_SMOOTHING_ALPHA", "0.72")
        )
    )
    classifier_mode: PoseClassifierMode = field(
        default_factory=lambda: cast(
            PoseClassifierMode,
            _env_value(
                "INCANTATION_POSE_CLASSIFIER_MODE",
                "AIRLOOM_POSE_CLASSIFIER_MODE",
                "learned",
            ),
        )
    )
    pose_model_path: str | None = field(
        default_factory=lambda: os.environ.get("INCANTATION_POSE_MODEL_PATH")
        or os.environ.get("AIRLOOM_POSE_MODEL_PATH")
    )
    pointer_region_margin: float = field(
        default_factory=lambda: float(
            _env_value(
                "INCANTATION_POINTER_REGION_MARGIN",
                "AIRLOOM_POINTER_REGION_MARGIN",
                "0.12",
            )
        )
    )
    pointer_hand_preference: QuestHandPreference = field(
        default_factory=lambda: cast(
            QuestHandPreference,
            _env_value(
                "INCANTATION_QUEST_POINTER_HAND",
                "AIRLOOM_QUEST_POINTER_HAND",
                "right",
            ),
        )
    )
    action_hand_preference: QuestHandPreference = field(
        default_factory=lambda: cast(
            QuestHandPreference,
            _env_value(
                "INCANTATION_QUEST_ACTION_HAND",
                "AIRLOOM_QUEST_ACTION_HAND",
                "left",
            ),
        )
    )
    pointer_clutch_required: bool = field(
        default_factory=lambda: _env_value(
            "INCANTATION_QUEST_REQUIRE_POINTER_CLUTCH",
            "AIRLOOM_QUEST_REQUIRE_POINTER_CLUTCH",
            "1",
        )
        != "0"
    )
    tracking_hold_frames: int = field(
        default_factory=lambda: int(
            _env_value("INCANTATION_TRACKING_HOLD_FRAMES", "AIRLOOM_TRACKING_HOLD_FRAMES", "3")
        )
    )
    _pose_model: Any | None = field(init=False, default=None)
    _last_frame_state: FrameState | None = field(init=False, default=None)
    _tracking_hold_remaining: int = field(init=False, default=0)
    _last_pointer: Landmark = field(init=False, default_factory=lambda: {"x": 0.5, "y": 0.5})

    def __post_init__(self) -> None:
        self._pose_model = (
            try_load_pose_model(Path(self.pose_model_path)) if self.pose_model_path else None
        )

    def _track_hand(self, hand_payload: dict[str, object]) -> _TrackedQuestHand | None:
        hand_landmarks = _normalize_landmarks(hand_payload.get("landmarks"))
        if len(hand_landmarks) < 21:
            return None

        hand_landmarks = hand_landmarks[:21]
        features = extract_pose_features(hand_landmarks)
        feature_values = flatten_pose_features(hand_landmarks, features)
        classification = classify_pose_with_mode(
            features,
            feature_values,
            mode=self.classifier_mode,
            learned_model=self._pose_model,
        )
        pose_observation = classification.active
        pointer_anchor = _pointer_anchor(hand_landmarks, pose_observation["pose"])
        confidence = hand_payload.get("confidence")
        resolved_confidence = float(confidence) if isinstance(confidence, int | float) else 0.9

        return _TrackedQuestHand(
            pose=pose_observation["pose"],
            pose_confidence=pose_observation["confidence"],
            pose_scores=pose_observation["scores"],
            classifier_mode=classification.mode,
            model_version=classification.model_version,
            primary_pinch_strength=features.primary_pinch_strength,
            secondary_pinch_strength=features.secondary_pinch_strength,
            open_palm_hold=pose_observation["pose"] == "open-palm",
            closed_fist=pose_observation["pose"] == "closed-fist",
            raw_pointer={
                "x": _clamp_unit(pointer_anchor["x"]),
                "y": _clamp_unit(pointer_anchor["y"]),
            },
            hand_landmarks=hand_landmarks,
            feature_values=feature_values,
            center=_hand_center(hand_landmarks),
            handedness=_normalize_handedness(hand_payload.get("handedness")),
            confidence=_clamp_unit(resolved_confidence),
            learned_pose=(
                classification.learned["pose"] if classification.learned is not None else None
            ),
            learned_pose_confidence=(
                classification.learned["confidence"] if classification.learned is not None else None
            ),
            shadow_disagreement=classification.shadow_disagreement,
        )

    def _resolve_role_indices(self, hands: list[_TrackedQuestHand]) -> tuple[int, int, str | None]:
        if len(hands) <= 1:
            return (0, 0, "single-hand-mode")

        handedness_to_index = {
            hand.handedness: index
            for index, hand in enumerate(hands)
            if hand.handedness is not None
        }
        pointer_index = handedness_to_index.get(self.pointer_hand_preference)
        action_index = handedness_to_index.get(self.action_hand_preference)
        if pointer_index is not None and action_index is not None and pointer_index != action_index:
            return (pointer_index, action_index, None)

        fallback_reason = None
        if self.pointer_hand_preference != "auto" or self.action_hand_preference != "auto":
            fallback_reason = "preferred-hand-missing"

        selected = _select_hand_roles(
            [hand.center for hand in hands],
            False,
            [hand.handedness for hand in hands],
        )
        if fallback_reason is None and any(hand.handedness is None for hand in hands):
            fallback_reason = "handedness-fallback"
        return (selected[0], selected[1], fallback_reason)

    def _fallback_frame_state(
        self,
        *,
        fallback_reason: str,
        bridge_connected: bool,
        bridge_url: str | None,
        hands_tracked: int,
    ) -> FrameState:
        if self._last_frame_state is not None and self._tracking_hold_remaining > 0:
            self._tracking_hold_remaining -= 1
            held_state = dict(self._last_frame_state)
            held_state["confidence"] = 0.0
            held_state["bridge_connected"] = bridge_connected
            held_state["hands_tracked"] = hands_tracked
            held_state["fallback_reason"] = "dropout-hold"
            if bridge_url is not None:
                held_state["bridge_url"] = bridge_url
            return cast(FrameState, held_state)

        self._last_frame_state = None
        self._tracking_hold_remaining = 0
        return _empty_frame_state(
            classifier_mode=self.classifier_mode,
            model_version=None,
            fallback_reason=fallback_reason,
            bridge_connected=bridge_connected,
            bridge_url=bridge_url,
            hands_tracked=hands_tracked,
        )

    def process(self, payload: dict[str, object]) -> FrameState:
        bridge_connected = bool(payload.get("bridge_connected", True))
        bridge_url_raw = payload.get("bridge_url")
        bridge_url = bridge_url_raw if isinstance(bridge_url_raw, str) else None
        raw_hands = payload.get("hands")
        if not isinstance(raw_hands, list):
            return self._fallback_frame_state(
                fallback_reason="bridge-disconnected",
                bridge_connected=bridge_connected,
                bridge_url=bridge_url,
                hands_tracked=0,
            )

        tracked_hands = [
            tracked
            for tracked in (
                self._track_hand(cast(dict[str, object], hand_payload))
                for hand_payload in raw_hands[:2]
                if isinstance(hand_payload, dict)
            )
            if tracked is not None
        ]

        hands_tracked = len(tracked_hands)
        if not tracked_hands:
            return self._fallback_frame_state(
                fallback_reason="no-hands",
                bridge_connected=bridge_connected,
                bridge_url=bridge_url,
                hands_tracked=hands_tracked,
            )

        pointer_index, action_index, role_reason = self._resolve_role_indices(tracked_hands)
        pointer_hand = tracked_hands[pointer_index]
        action_hand = tracked_hands[action_index]
        remapped_pointer = {
            "x": _remap_pointer_axis(pointer_hand.raw_pointer["x"], self.pointer_region_margin),
            "y": _remap_pointer_axis(
                pointer_hand.raw_pointer["y"], _vertical_pointer_margin(self.pointer_region_margin)
            ),
        }
        self._last_pointer = remapped_pointer
        pointer_closed_fist = pointer_hand.closed_fist if self.pointer_clutch_required else True

        frame_state: FrameState = {
            "tracking": True,
            "tracking_backend": "quest-bridge",
            "device_name": "Meta Quest Browser",
            "preview_available": False,
            "pointer": {
                "x": _clamp_unit(self._last_pointer["x"]),
                "y": _clamp_unit(self._last_pointer["y"]),
            },
            "raw_pointer": pointer_hand.raw_pointer,
            "pose": pointer_hand.pose,
            "pose_confidence": pointer_hand.pose_confidence,
            "pose_scores": pointer_hand.pose_scores,
            "classifier_mode": pointer_hand.classifier_mode,
            "model_version": pointer_hand.model_version,
            "pinch_strength": action_hand.primary_pinch_strength,
            "secondary_pinch_strength": action_hand.secondary_pinch_strength,
            "action_pose": action_hand.pose,
            "action_pose_confidence": action_hand.pose_confidence,
            "action_pose_scores": action_hand.pose_scores,
            "action_pinch_strength": action_hand.primary_pinch_strength,
            "action_secondary_pinch_strength": action_hand.secondary_pinch_strength,
            "action_open_palm_hold": action_hand.open_palm_hold,
            "action_hand_separate": pointer_index != action_index,
            "action_pointer": action_hand.raw_pointer,
            "pointer_hand": pointer_hand.handedness or "single-hand",
            "action_hand": action_hand.handedness or "single-hand",
            "open_palm_hold": action_hand.open_palm_hold,
            "closed_fist": pointer_closed_fist,
            "bridge_connected": bridge_connected,
            "hands_tracked": hands_tracked,
            "confidence": sum(hand.confidence for hand in tracked_hands) / max(1, hands_tracked),
            "brightness": 0.5,
            "hand_landmarks": pointer_hand.hand_landmarks,
            "action_hand_landmarks": action_hand.hand_landmarks,
            "feature_values": pointer_hand.feature_values,
        }
        if bridge_url is not None:
            frame_state["bridge_url"] = bridge_url
        if role_reason is not None:
            frame_state["fallback_reason"] = role_reason
        if pointer_hand.learned_pose is not None:
            frame_state["learned_pose"] = pointer_hand.learned_pose
            if pointer_hand.learned_pose_confidence is not None:
                frame_state["learned_pose_confidence"] = pointer_hand.learned_pose_confidence
            if pointer_hand.shadow_disagreement is not None:
                frame_state["shadow_disagreement"] = pointer_hand.shadow_disagreement

        self._last_frame_state = frame_state
        self._tracking_hold_remaining = max(0, self.tracking_hold_frames)
        return frame_state
