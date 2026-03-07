from __future__ import annotations

# pyright: reportMissingImports=false
import importlib
import importlib.util
from dataclasses import dataclass, field
from typing import Any, cast

from app.gestures import compute_pinch_strength
from app.model_assets import ensure_hand_landmarker_model
from app.protocol import FrameState, Landmark
from app.smoothing import ExponentialSmoother


@dataclass
class HandTracker:
    smoothing_alpha: float = 0.35
    _smoother: ExponentialSmoother = field(init=False)
    _hands: Any | None = field(init=False, default=None)
    _mediapipe: Any | None = field(init=False, default=None)

    def __post_init__(self) -> None:
        self._smoother = ExponentialSmoother(alpha=self.smoothing_alpha)
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
                running_mode=vision.RunningMode.IMAGE,
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
                "pinch_strength": 0.0,
                "secondary_pinch_strength": 0.0,
                "open_palm_hold": False,
                "confidence": 0.0,
            }

        import cv2

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = self._mediapipe.Image(
            image_format=self._mediapipe.ImageFormat.SRGB,
            data=rgb_frame,
        )
        result = self._hands.detect(image)
        if not result.hand_landmarks:
            return {
                "tracking": False,
                "pinch_strength": 0.0,
                "secondary_pinch_strength": 0.0,
                "open_palm_hold": False,
                "confidence": 0.0,
            }

        landmarks = result.hand_landmarks[0]
        index_tip: Landmark = cast(Landmark, {"x": landmarks[8].x, "y": landmarks[8].y})
        thumb_tip: Landmark = cast(Landmark, {"x": landmarks[4].x, "y": landmarks[4].y})
        middle_tip: Landmark = cast(Landmark, {"x": landmarks[12].x, "y": landmarks[12].y})
        wrist: Landmark = cast(Landmark, {"x": landmarks[0].x, "y": landmarks[0].y})
        smooth_x, smooth_y = self._smoother.update(index_tip["x"], index_tip["y"])

        return {
            "tracking": True,
            "pointer": {"x": smooth_x, "y": smooth_y},
            "pinch_strength": compute_pinch_strength(thumb_tip, index_tip),
            "secondary_pinch_strength": compute_pinch_strength(thumb_tip, middle_tip),
            "open_palm_hold": middle_tip["y"] < wrist["y"],
            "confidence": 0.9,
        }
