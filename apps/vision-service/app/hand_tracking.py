from __future__ import annotations

# pyright: reportMissingImports=false
import importlib
import importlib.util
from dataclasses import dataclass, field
from typing import Any, cast

from app.gestures import compute_pinch_strength
from app.protocol import FrameState, Landmark
from app.smoothing import ExponentialSmoother


@dataclass
class HandTracker:
    smoothing_alpha: float = 0.35
    _smoother: ExponentialSmoother = field(init=False)
    _hands: Any | None = field(init=False, default=None)

    def __post_init__(self) -> None:
        self._smoother = ExponentialSmoother(alpha=self.smoothing_alpha)
        mediapipe = (
            importlib.import_module("mediapipe") if importlib.util.find_spec("mediapipe") else None
        )
        if mediapipe is not None:
            solutions = cast(Any, mediapipe).solutions
            self._hands = solutions.hands.Hands(
                model_complexity=0,
                min_detection_confidence=0.55,
                min_tracking_confidence=0.55,
                max_num_hands=1,
            )

    def process(self, frame: Any) -> FrameState:
        if self._hands is None:
            return {
                "tracking": False,
                "pinch_strength": 0.0,
                "secondary_pinch_strength": 0.0,
                "open_palm_hold": False,
                "confidence": 0.0,
            }

        import cv2

        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = self._hands.process(rgb_frame)
        if not result.multi_hand_landmarks:
            return {
                "tracking": False,
                "pinch_strength": 0.0,
                "secondary_pinch_strength": 0.0,
                "open_palm_hold": False,
                "confidence": 0.0,
            }

        landmarks = result.multi_hand_landmarks[0].landmark
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
