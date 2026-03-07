from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import cast

from app.pose_features import FEATURE_SCHEMA_VERSION, PoseFeatures
from app.pose_model import PoseModelArtifact, load_pose_model, predict_pose_model
from app.protocol import PoseClassifierMode, PoseName, PoseObservation, PoseScores

POSE_UNKNOWN: PoseName = "unknown"
POSE_NEUTRAL: PoseName = "neutral"
POSE_OPEN_PALM: PoseName = "open-palm"
POSE_CLOSED_FIST: PoseName = "closed-fist"
POSE_PRIMARY_PINCH: PoseName = "primary-pinch"
POSE_SECONDARY_PINCH: PoseName = "secondary-pinch"

POSE_MIN_SCORE = 0.58
POSE_MIN_MARGIN = 0.12


@dataclass(frozen=True, slots=True)
class PoseClassificationResult:
    active: PoseObservation
    rule: PoseObservation
    learned: PoseObservation | None
    mode: PoseClassifierMode
    model_version: str | None

    @property
    def shadow_disagreement(self) -> bool:
        return self.learned is not None and self.learned["pose"] != self.rule["pose"]


def _clamp_unit(value: float) -> float:
    return max(0.0, min(1.0, value))


def _closed_fist_score(features: PoseFeatures) -> float:
    if features.extended_fingers > 0:
        return 0.0

    curled_score = features.curled_fingers / 4
    compactness = _clamp_unit((1.7 - features.average_tip_distance) / 0.75)
    return 0.65 * curled_score + 0.35 * compactness


def _open_palm_score(features: PoseFeatures) -> float:
    if not features.open_palm_direction:
        return 0.0

    extension_score = features.extended_fingers / 4
    spread = _clamp_unit((features.average_tip_distance - 1.35) / 0.9)
    pinch_penalty = 0.5 * _clamp_unit(
        (max(features.primary_pinch_strength, features.secondary_pinch_strength) - 0.55) / 0.25
    )
    return _clamp_unit(0.6 * extension_score + 0.4 * spread - pinch_penalty)


def _extended_fraction(*values: bool) -> float:
    return sum(values) / len(values)


def _primary_pinch_score(features: PoseFeatures) -> float:
    if features.primary_pinch_strength < 0.58:
        return 0.0

    pinch_component = _clamp_unit((features.primary_pinch_strength - 0.52) / 0.38)
    support_component = _extended_fraction(
        features.middle.extended,
        features.ring.extended,
        features.pinky.extended,
    )
    index_posture = 1.0 if features.index.extended else 0.55 if not features.index.curled else 0.2
    spread_component = _clamp_unit((features.average_tip_distance - 0.8) / 0.85)
    curled_penalty = 0.55 * _clamp_unit((features.curled_fingers - 1) / 2)
    return _clamp_unit(
        0.58 * pinch_component
        + 0.16 * support_component
        + 0.14 * index_posture
        + 0.14 * spread_component
        - curled_penalty
    )


def _secondary_pinch_score(features: PoseFeatures) -> float:
    if features.secondary_pinch_strength < 0.62:
        return 0.0

    pinch_component = _clamp_unit((features.secondary_pinch_strength - 0.58) / 0.34)
    support_component = _extended_fraction(
        features.index.extended,
        features.ring.extended,
        features.pinky.extended,
    )
    middle_posture = (
        1.0 if features.middle.extended else 0.55 if not features.middle.curled else 0.2
    )
    spread_component = _clamp_unit((features.average_tip_distance - 0.78) / 0.82)
    curled_penalty = 0.55 * _clamp_unit((features.curled_fingers - 1) / 2)
    return _clamp_unit(
        0.58 * pinch_component
        + 0.16 * support_component
        + 0.14 * middle_posture
        + 0.14 * spread_component
        - curled_penalty
    )


def _neutral_score(features: PoseFeatures) -> float:
    if features.curled_fingers == 0 and features.extended_fingers == 0:
        return 0.7
    if features.curled_fingers <= 2 and features.extended_fingers <= 2:
        return 0.45
    return 0.0


def score_pose_candidates(features: PoseFeatures) -> PoseScores:
    return cast(
        PoseScores,
        {
            "closed-fist": _closed_fist_score(features),
            "open-palm": _open_palm_score(features),
            "primary-pinch": _primary_pinch_score(features),
            "secondary-pinch": _secondary_pinch_score(features),
            "neutral": _neutral_score(features),
        },
    )


def classify_pose(features: PoseFeatures) -> PoseObservation:
    scores = score_pose_candidates(features)
    ordered: list[tuple[PoseName, float]] = sorted(
        [
            (POSE_CLOSED_FIST, scores["closed-fist"]),
            (POSE_OPEN_PALM, scores["open-palm"]),
            (POSE_PRIMARY_PINCH, scores["primary-pinch"]),
            (POSE_SECONDARY_PINCH, scores["secondary-pinch"]),
            (POSE_NEUTRAL, scores["neutral"]),
        ],
        key=lambda item: item[1],
        reverse=True,
    )
    best_pose, best_score = ordered[0]
    second_score = ordered[1][1] if len(ordered) > 1 else 0.0

    if (
        scores["primary-pinch"] >= 0.7
        and scores["primary-pinch"] >= scores["open-palm"] - 0.06
        and scores["closed-fist"] < 0.55
    ):
        best_pose = POSE_PRIMARY_PINCH
        best_score = scores["primary-pinch"]
        second_score = max(
            scores["closed-fist"],
            scores["open-palm"],
            scores["secondary-pinch"],
            scores["neutral"],
        )

    if (
        scores["secondary-pinch"] >= 0.7
        and scores["secondary-pinch"] >= scores["open-palm"] - 0.06
        and scores["closed-fist"] < 0.55
        and scores["secondary-pinch"] >= best_score
    ):
        best_pose = POSE_SECONDARY_PINCH
        best_score = scores["secondary-pinch"]
        second_score = max(
            scores["closed-fist"],
            scores["open-palm"],
            scores["primary-pinch"],
            scores["neutral"],
        )

    if best_score < POSE_MIN_SCORE or best_score - second_score < POSE_MIN_MARGIN:
        return {"pose": POSE_UNKNOWN, "confidence": _clamp_unit(best_score), "scores": scores}

    return {"pose": best_pose, "confidence": _clamp_unit(best_score), "scores": scores}


def try_load_pose_model(path: Path | None) -> PoseModelArtifact | None:
    if path is None or not path.exists():
        return None
    model = load_pose_model(path)
    if model.feature_schema_version != FEATURE_SCHEMA_VERSION:
        return None
    return model


def classify_pose_with_mode(
    features: PoseFeatures,
    feature_values: dict[str, float],
    *,
    mode: PoseClassifierMode,
    learned_model: PoseModelArtifact | None,
) -> PoseClassificationResult:
    rule_observation = classify_pose(features)
    learned_observation = (
        predict_pose_model(learned_model, feature_values) if learned_model is not None else None
    )

    if mode == "learned" and learned_observation is not None:
        active = learned_observation
    else:
        active = rule_observation

    if mode == "shadow" and learned_observation is not None:
        active = rule_observation

    return PoseClassificationResult(
        active=active,
        rule=rule_observation,
        learned=learned_observation,
        mode=mode if learned_model is not None or mode == "rules" else "rules",
        model_version=learned_model.model_version if learned_model is not None else None,
    )
