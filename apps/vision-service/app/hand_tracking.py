from __future__ import annotations

# pyright: reportMissingImports=false
import importlib
import importlib.util
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, cast

from app.model_assets import ensure_hand_landmarker_model
from app.pose_classifier import classify_pose_with_mode, try_load_pose_model
from app.pose_features import extract_pose_features, flatten_pose_features
from app.protocol import FrameState, Landmark, PoseClassifierMode, empty_pose_scores
from app.smoothing import ExponentialSmoother

os.environ.setdefault("GLOG_minloglevel", "2")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")


def _clamp_unit(value: float) -> float:
    return max(0.0, min(1.0, value))


@dataclass
class HandTracker:
    smoothing_alpha: float = field(
        default_factory=lambda: float(os.environ.get("AIRLOOM_SMOOTHING_ALPHA", "0.72"))
    )
    mirror_x: bool = field(default_factory=lambda: os.environ.get("AIRLOOM_MIRROR_X", "1") != "0")
    classifier_mode: PoseClassifierMode = field(
        default_factory=lambda: cast(
            PoseClassifierMode, os.environ.get("AIRLOOM_POSE_CLASSIFIER_MODE", "learned")
        )
    )
    pose_model_path: str | None = field(
        default_factory=lambda: os.environ.get("AIRLOOM_POSE_MODEL_PATH")
    )
    capture_controller: Any | None = None
    _smoother: ExponentialSmoother = field(init=False)
    _hands: Any | None = field(init=False, default=None)
    _mediapipe: Any | None = field(init=False, default=None)
    _pose_model: Any | None = field(init=False, default=None)

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
            model_path = ensure_hand_landmarker_model()
            options = vision.HandLandmarkerOptions(
                base_options=tasks.BaseOptions(model_asset_path=str(model_path)),
                running_mode=vision.RunningMode.VIDEO,
                num_hands=1,
                min_hand_detection_confidence=0.55,
                min_hand_presence_confidence=0.55,
                min_tracking_confidence=0.55,
            )
            self._hands = vision.HandLandmarker.create_from_options(options)

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
        result = self._hands.detect_for_video(image, timestamp_ms)
        if not result.hand_landmarks:
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
            }

        landmarks = result.hand_landmarks[0]
        hand_landmarks = [
            cast(Landmark, {"x": landmark.x, "y": landmark.y}) for landmark in landmarks
        ]
        index_tip = hand_landmarks[8]
        features = extract_pose_features(hand_landmarks)
        feature_values = flatten_pose_features(hand_landmarks, features)
        classification = classify_pose_with_mode(
            features,
            feature_values,
            mode=self.classifier_mode,
            learned_model=self._pose_model,
        )
        pose_observation = classification.active
        pointer_x = 1 - index_tip["x"] if self.mirror_x else index_tip["x"]
        smooth_x, smooth_y = self._smoother.update(
            _clamp_unit(pointer_x), _clamp_unit(index_tip["y"])
        )

        frame_state: FrameState = {
            "tracking": True,
            "pointer": {"x": _clamp_unit(smooth_x), "y": _clamp_unit(smooth_y)},
            "raw_pointer": {"x": _clamp_unit(pointer_x), "y": _clamp_unit(index_tip["y"])},
            "pose": pose_observation["pose"],
            "pose_confidence": pose_observation["confidence"],
            "pose_scores": pose_observation["scores"],
            "classifier_mode": classification.mode,
            "model_version": classification.model_version,
            "pinch_strength": features.primary_pinch_strength,
            "secondary_pinch_strength": features.secondary_pinch_strength,
            "open_palm_hold": pose_observation["pose"] == "open-palm",
            "closed_fist": pose_observation["pose"] == "closed-fist",
            "confidence": 0.9,
            "brightness": brightness,
            "hand_landmarks": hand_landmarks,
            "feature_values": feature_values,
        }
        if classification.learned is not None:
            frame_state["learned_pose"] = classification.learned["pose"]
            frame_state["learned_pose_confidence"] = classification.learned["confidence"]
            frame_state["shadow_disagreement"] = classification.shadow_disagreement

        if self.capture_controller is not None:
            self.capture_controller.observe(frame_state)

        return frame_state
