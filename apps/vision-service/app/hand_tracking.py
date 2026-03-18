from __future__ import annotations

# pyright: reportMissingImports=false
import importlib
import importlib.util
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, cast

from app.model_assets import ensure_gesture_recognizer_model, ensure_hand_landmarker_model
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
from app.smoothing import ExponentialSmoother

os.environ.setdefault("GLOG_minloglevel", "2")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")


def _clamp_unit(value: float) -> float:
    return max(0.0, min(1.0, value))


def _average_landmarks(*points: Landmark) -> Landmark:
    count = max(1, len(points))
    return {
        "x": sum(point["x"] for point in points) / count,
        "y": sum(point["y"] for point in points) / count,
    }


def _pointer_anchor(landmarks: list[Landmark], pose: str) -> Landmark:
    if pose == "closed-fist":
        return _average_landmarks(
            landmarks[0],
            landmarks[5],
            landmarks[9],
            landmarks[13],
            landmarks[17],
        )

    if pose == "blade-hand":
        return _average_landmarks(
            landmarks[0],
            landmarks[5],
            landmarks[9],
            landmarks[13],
            landmarks[17],
        )

    return landmarks[8]


def _hand_center(landmarks: list[Landmark]) -> Landmark:
    return _average_landmarks(
        landmarks[0],
        landmarks[5],
        landmarks[9],
        landmarks[13],
        landmarks[17],
    )


def _hand_user_x(center: Landmark, mirror_x: bool) -> float:
    return 1 - center["x"] if mirror_x else center["x"]


def _remap_pointer_axis(value: float, margin: float) -> float:
    if margin <= 0:
        return _clamp_unit(value)

    minimum = margin
    maximum = 1 - margin
    if maximum <= minimum:
        return 0.5

    return _clamp_unit((value - minimum) / (maximum - minimum))


def _vertical_pointer_margin(margin: float) -> float:
    return min(margin, 0.06)


def _normalize_handedness_label(label: str | None) -> str | None:
    if label is None:
        return None

    normalized = label.strip().lower()
    if normalized in {"left", "right"}:
        return normalized

    return None


def _env_value(name: str, legacy_name: str, default: str) -> str:
    return os.environ.get(name) or os.environ.get(legacy_name, default)


def _extract_handedness_labels(result: Any) -> list[str | None]:
    raw_handedness = getattr(result, "handedness", None)
    if not raw_handedness:
        return []

    labels: list[str | None] = []
    for hand_handedness in raw_handedness:
        label: str | None = None
        for category in hand_handedness:
            category_name = getattr(category, "category_name", None)
            label = _normalize_handedness_label(category_name)
            if label is not None:
                break
        labels.append(label)

    return labels


def _select_hand_roles(
    centers: list[Landmark],
    mirror_x: bool,
    handedness_labels: list[str | None] | None = None,
) -> tuple[int, int]:
    if not centers:
        return (0, 0)

    if len(centers) == 1:
        return (0, 0)

    if handedness_labels is not None:
        right_indices = [
            index
            for index, label in enumerate(handedness_labels[: len(centers)])
            if label == "right"
        ]
        left_indices = [
            index
            for index, label in enumerate(handedness_labels[: len(centers)])
            if label == "left"
        ]
        if len(right_indices) == 1 and len(left_indices) == 1:
            return (right_indices[0], left_indices[0])

    ordered = sorted(
        range(len(centers)),
        key=lambda index: _hand_user_x(centers[index], mirror_x),
    )
    return (ordered[-1], ordered[0])


@dataclass(frozen=True, slots=True)
class _TrackedHand:
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
    handedness: str | None = None
    learned_pose: PoseName | None = None
    learned_pose_confidence: float | None = None
    shadow_disagreement: bool | None = None


@dataclass
class HandTracker:
    smoothing_alpha: float = field(
        default_factory=lambda: float(
            _env_value("INCANTATION_SMOOTHING_ALPHA", "AIRLOOM_SMOOTHING_ALPHA", "0.72")
        )
    )
    mirror_x: bool = field(
        default_factory=lambda: _env_value("INCANTATION_MIRROR_X", "AIRLOOM_MIRROR_X", "1") != "0"
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
    capture_controller: Any | None = None
    tracking_hold_frames: int = field(
        default_factory=lambda: int(
            _env_value(
                "INCANTATION_TRACKING_HOLD_FRAMES",
                "AIRLOOM_TRACKING_HOLD_FRAMES",
                "3",
            )
        )
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
    _smoother: ExponentialSmoother = field(init=False)
    _hands: Any | None = field(init=False, default=None)
    _recognizer: Any | None = field(init=False, default=None)
    _mediapipe: Any | None = field(init=False, default=None)
    _pose_model: Any | None = field(init=False, default=None)
    _last_frame_state: FrameState | None = field(init=False, default=None)
    _tracking_hold_remaining: int = field(init=False, default=0)

    def __post_init__(self) -> None:
        self._smoother = ExponentialSmoother(alpha=self.smoothing_alpha)
        self._pose_model = (
            try_load_pose_model(Path(self.pose_model_path)) if self.pose_model_path else None
        )
        mediapipe = (
            importlib.import_module("mediapipe") if importlib.util.find_spec("mediapipe") else None
        )
        if mediapipe is not None:
            self._mediapipe = cast(Any, mediapipe)
            tasks = importlib.import_module("mediapipe.tasks.python")
            vision = importlib.import_module("mediapipe.tasks.python.vision")
            hand_model_path = ensure_hand_landmarker_model()
            hand_options = vision.HandLandmarkerOptions(
                base_options=tasks.BaseOptions(model_asset_path=str(hand_model_path)),
                running_mode=vision.RunningMode.VIDEO,
                num_hands=2,
                min_hand_detection_confidence=0.45,
                min_hand_presence_confidence=0.45,
                min_tracking_confidence=0.4,
            )
            self._hands = vision.HandLandmarker.create_from_options(hand_options)

            if self.classifier_mode != "learned":
                recognizer_model_path = ensure_gesture_recognizer_model()
                recognizer_options = vision.GestureRecognizerOptions(
                    base_options=tasks.BaseOptions(model_asset_path=str(recognizer_model_path)),
                    running_mode=vision.RunningMode.VIDEO,
                    num_hands=2,
                    min_hand_detection_confidence=0.45,
                    min_hand_presence_confidence=0.45,
                    min_tracking_confidence=0.4,
                )
                self._recognizer = vision.GestureRecognizer.create_from_options(recognizer_options)

    def _extract_static_gesture_scores(self, result: Any) -> list[dict[str, float]]:
        categories = getattr(result, "gestures", None)
        if not categories:
            return []

        gesture_scores: list[dict[str, float]] = []
        for hand_categories in categories:
            scores: dict[str, float] = {}
            for category in hand_categories:
                label = getattr(category, "category_name", None)
                score = getattr(category, "score", None)
                if isinstance(label, str) and isinstance(score, int | float):
                    scores[label] = float(score)
            gesture_scores.append(scores)

        return gesture_scores

    def _track_hand(
        self,
        hand_landmarks: list[Landmark],
        static_gesture_scores: dict[str, float] | None = None,
        handedness: str | None = None,
    ) -> _TrackedHand:
        features = extract_pose_features(hand_landmarks)
        feature_values = flatten_pose_features(hand_landmarks, features)
        classification = classify_pose_with_mode(
            features,
            feature_values,
            mode=self.classifier_mode,
            learned_model=self._pose_model,
            static_gesture_scores=static_gesture_scores,
        )
        pose_observation = classification.active
        pointer_anchor = _pointer_anchor(hand_landmarks, pose_observation["pose"])
        pointer_x = 1 - pointer_anchor["x"] if self.mirror_x else pointer_anchor["x"]

        return _TrackedHand(
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
                "x": _clamp_unit(pointer_x),
                "y": _clamp_unit(pointer_anchor["y"]),
            },
            hand_landmarks=hand_landmarks,
            feature_values=feature_values,
            center=_hand_center(hand_landmarks),
            handedness=handedness,
            learned_pose=(
                classification.learned["pose"] if classification.learned is not None else None
            ),
            learned_pose_confidence=(
                classification.learned["confidence"] if classification.learned is not None else None
            ),
            shadow_disagreement=classification.shadow_disagreement,
        )

    def _fallback_frame_state(self, brightness: float) -> FrameState:
        if self._last_frame_state is not None and self._tracking_hold_remaining > 0:
            self._tracking_hold_remaining -= 1
            held_state = dict(self._last_frame_state)
            held_state["confidence"] = 0.0
            held_state["brightness"] = brightness
            held_state["fallback_reason"] = "dropout-hold"
            return cast(FrameState, held_state)

        self._last_frame_state = None
        self._tracking_hold_remaining = 0
        return {
            "tracking": False,
            "pose": "unknown",
            "pose_confidence": 0.0,
            "pose_scores": empty_pose_scores(),
            "classifier_mode": self.classifier_mode,
            "model_version": None,
            "pinch_strength": 0.0,
            "secondary_pinch_strength": 0.0,
            "open_palm_hold": False,
            "closed_fist": False,
            "confidence": 0.0,
            "brightness": brightness,
            "fallback_reason": "no-hands",
        }

    def process(self, frame: Any) -> FrameState:
        if self._hands is None or self._mediapipe is None:
            return {
                "tracking": False,
                "pose": "unknown",
                "pose_confidence": 0.0,
                "pose_scores": empty_pose_scores(),
                "classifier_mode": self.classifier_mode,
                "model_version": None,
                "pinch_strength": 0.0,
                "secondary_pinch_strength": 0.0,
                "open_palm_hold": False,
                "closed_fist": False,
                "confidence": 0.0,
                "brightness": 0.0,
            }

        import cv2

        brightness = float(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).mean() / 255.0)
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = self._mediapipe.Image(
            image_format=self._mediapipe.ImageFormat.SRGB,
            data=rgb_frame,
        )
        timestamp_ms = time.monotonic_ns() // 1_000_000
        static_gesture_scores_by_hand: list[dict[str, float]] = []
        if self._recognizer is not None:
            recognizer_result = self._recognizer.recognize_for_video(image, timestamp_ms)
            hand_landmarks_result = recognizer_result
            static_gesture_scores_by_hand = self._extract_static_gesture_scores(recognizer_result)
        else:
            hand_landmarks_result = self._hands.detect_for_video(image, timestamp_ms)

        handedness_labels = _extract_handedness_labels(hand_landmarks_result)

        if not hand_landmarks_result.hand_landmarks:
            return self._fallback_frame_state(brightness)

        tracked_hands: list[_TrackedHand] = []
        for index, landmarks in enumerate(hand_landmarks_result.hand_landmarks[:2]):
            hand_landmarks = [
                cast(Landmark, {"x": landmark.x, "y": landmark.y}) for landmark in landmarks
            ]
            tracked_hands.append(
                self._track_hand(
                    hand_landmarks,
                    static_gesture_scores_by_hand[index]
                    if index < len(static_gesture_scores_by_hand)
                    else None,
                    handedness_labels[index] if index < len(handedness_labels) else None,
                )
            )

        pointer_index, action_index = _select_hand_roles(
            [hand.center for hand in tracked_hands],
            self.mirror_x,
            [hand.handedness for hand in tracked_hands],
        )
        pointer_hand = tracked_hands[pointer_index]
        action_hand = tracked_hands[action_index]
        role_reason = None
        if len(tracked_hands) == 1:
            role_reason = "single-hand-mode"
        elif pointer_hand.handedness is None or action_hand.handedness is None:
            role_reason = "handedness-fallback"
        remapped_pointer = {
            "x": _remap_pointer_axis(pointer_hand.raw_pointer["x"], self.pointer_region_margin),
            "y": _remap_pointer_axis(
                pointer_hand.raw_pointer["y"], _vertical_pointer_margin(self.pointer_region_margin)
            ),
        }
        smooth_x, smooth_y = self._smoother.update(
            remapped_pointer["x"],
            remapped_pointer["y"],
        )

        frame_state: FrameState = {
            "tracking": True,
            "pointer": {"x": _clamp_unit(smooth_x), "y": _clamp_unit(smooth_y)},
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
            "pointer_hand": (
                pointer_hand.handedness
                or ("single-hand" if len(tracked_hands) == 1 else "spatial-right")
            ),
            "action_hand": (
                action_hand.handedness
                or ("single-hand" if len(tracked_hands) == 1 else "spatial-left")
            ),
            "open_palm_hold": action_hand.open_palm_hold,
            "closed_fist": pointer_hand.closed_fist,
            "confidence": 0.9,
            "brightness": brightness,
            "hand_landmarks": pointer_hand.hand_landmarks,
            "action_hand_landmarks": action_hand.hand_landmarks,
            "feature_values": pointer_hand.feature_values,
        }
        if role_reason is not None:
            frame_state["fallback_reason"] = role_reason
        self._last_frame_state = frame_state
        self._tracking_hold_remaining = max(0, self.tracking_hold_frames)
        if pointer_hand.learned_pose is not None:
            frame_state["learned_pose"] = pointer_hand.learned_pose
            if pointer_hand.learned_pose_confidence is not None:
                frame_state["learned_pose_confidence"] = pointer_hand.learned_pose_confidence
            if pointer_hand.shadow_disagreement is not None:
                frame_state["shadow_disagreement"] = pointer_hand.shadow_disagreement

        if self.capture_controller is not None:
            self.capture_controller.observe(frame_state)

        return frame_state
