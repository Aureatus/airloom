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
POSE_BLADE_HAND: PoseName = "blade-hand"
POSE_CLOSED_FIST: PoseName = "closed-fist"
POSE_PRIMARY_PINCH: PoseName = "primary-pinch"
POSE_SECONDARY_PINCH: PoseName = "secondary-pinch"
POSE_PEACE_SIGN: PoseName = "peace-sign"

POSE_MIN_SCORE = 0.58
POSE_MIN_MARGIN = 0.12
PINCH_MIN_SCORE = 0.68
STATIC_POSE_MIN_SCORE = 0.55


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
    compactness_penalty = 0.28 * _clamp_unit((0.3 - features.finger_spread) / 0.18)
    return _clamp_unit(0.6 * extension_score + 0.4 * spread - pinch_penalty - compactness_penalty)


def _blade_hand_score(features: PoseFeatures) -> float:
    if not features.open_palm_direction:
        return 0.0

    extension_score = features.extended_fingers / 4
    compactness = _clamp_unit((0.34 - features.finger_spread) / 0.2)
    openness = _clamp_unit((features.average_tip_distance - 1.05) / 0.5)
    pinch_penalty = 0.65 * _clamp_unit(
        (max(features.primary_pinch_strength, features.secondary_pinch_strength) - 0.35) / 0.2
    )
    curl_penalty = 0.4 * _clamp_unit(features.curled_fingers / 2)
    spread_penalty = 0.35 * _clamp_unit((features.finger_spread - 0.34) / 0.14)
    return _clamp_unit(
        0.42 * extension_score
        + 0.26 * compactness
        + 0.2 * openness
        - pinch_penalty
        - curl_penalty
        - spread_penalty
    )


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


def _peace_sign_score(features: PoseFeatures) -> float:
    extension_component = _extended_fraction(features.index.extended, features.middle.extended)
    curl_component = _extended_fraction(features.ring.curled, features.pinky.curled)
    thumb_penalty = 0.2 if features.primary_pinch_strength >= 0.45 else 0.0
    pinch_penalty = 0.45 * _clamp_unit(
        (max(features.primary_pinch_strength, features.secondary_pinch_strength) - 0.38) / 0.24
    )
    spread_component = _clamp_unit((features.finger_spread - 0.42) / 0.25)
    return _clamp_unit(
        0.4 * extension_component
        + 0.26 * curl_component
        + 0.22 * spread_component
        - thumb_penalty
        - pinch_penalty
    )


def score_pose_candidates(features: PoseFeatures) -> PoseScores:
    return cast(
        PoseScores,
        {
            "closed-fist": _closed_fist_score(features),
            "open-palm": _open_palm_score(features),
            "blade-hand": _blade_hand_score(features),
            "primary-pinch": _primary_pinch_score(features),
            "secondary-pinch": _secondary_pinch_score(features),
            "peace-sign": _peace_sign_score(features),
            "neutral": _neutral_score(features),
        },
    )


def classify_pose(features: PoseFeatures) -> PoseObservation:
    scores = score_pose_candidates(features)
    ordered: list[tuple[PoseName, float]] = sorted(
        [
            (POSE_CLOSED_FIST, scores["closed-fist"]),
            (POSE_OPEN_PALM, scores["open-palm"]),
            (POSE_BLADE_HAND, scores["blade-hand"]),
            (POSE_PRIMARY_PINCH, scores["primary-pinch"]),
            (POSE_SECONDARY_PINCH, scores["secondary-pinch"]),
            (POSE_PEACE_SIGN, scores["peace-sign"]),
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
            scores["blade-hand"],
            scores["secondary-pinch"],
            scores["peace-sign"],
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
            scores["blade-hand"],
            scores["primary-pinch"],
            scores["peace-sign"],
            scores["neutral"],
        )

    if (
        scores["peace-sign"] >= 0.68
        and scores["peace-sign"] >= max(scores["open-palm"], scores["closed-fist"]) + 0.05
        and scores["primary-pinch"] < 0.62
        and scores["secondary-pinch"] < 0.62
    ):
        best_pose = POSE_PEACE_SIGN
        best_score = scores["peace-sign"]
        second_score = max(
            scores["open-palm"],
            scores["closed-fist"],
            scores["blade-hand"],
            scores["primary-pinch"],
            scores["secondary-pinch"],
            scores["neutral"],
        )

    if (
        scores["blade-hand"] >= 0.66
        and scores["blade-hand"] >= scores["open-palm"] + 0.04
        and scores["blade-hand"] >= scores["neutral"] + 0.08
        and max(scores["primary-pinch"], scores["secondary-pinch"]) < 0.52
    ):
        best_pose = POSE_BLADE_HAND
        best_score = scores["blade-hand"]
        second_score = max(
            scores["open-palm"],
            scores["closed-fist"],
            scores["primary-pinch"],
            scores["secondary-pinch"],
            scores["peace-sign"],
            scores["neutral"],
        )

    if (
        scores["blade-hand"] >= 0.72
        and scores["blade-hand"] >= scores["open-palm"] - 0.06
        and scores["peace-sign"] < 0.55
        and max(scores["primary-pinch"], scores["secondary-pinch"]) < 0.52
    ):
        return {"pose": POSE_BLADE_HAND, "confidence": scores["blade-hand"], "scores": scores}

    if best_score < POSE_MIN_SCORE or best_score - second_score < POSE_MIN_MARGIN:
        return {"pose": POSE_UNKNOWN, "confidence": _clamp_unit(best_score), "scores": scores}

    return {"pose": best_pose, "confidence": _clamp_unit(best_score), "scores": scores}


def _static_score(static_gesture_scores: dict[str, float] | None, label: str) -> float:
    if static_gesture_scores is None:
        return 0.0
    return _clamp_unit(static_gesture_scores.get(label, 0.0))


def classify_hybrid_pose(
    features: PoseFeatures,
    *,
    static_gesture_scores: dict[str, float] | None = None,
    learned_scores: PoseScores | None = None,
) -> PoseObservation:
    primary_score = (
        _clamp_unit(learned_scores["primary-pinch"])
        if learned_scores is not None
        else _primary_pinch_score(features)
    )
    secondary_score = (
        _clamp_unit(learned_scores["secondary-pinch"])
        if learned_scores is not None
        else _secondary_pinch_score(features)
    )
    blade_score = (
        _clamp_unit(learned_scores["blade-hand"])
        if learned_scores is not None
        else _blade_hand_score(features)
    )
    peace_score = max(_peace_sign_score(features), _static_score(static_gesture_scores, "Victory"))
    open_score = _static_score(static_gesture_scores, "Open_Palm")
    closed_score = _static_score(static_gesture_scores, "Closed_Fist")

    if static_gesture_scores is None:
        open_score = max(open_score, _open_palm_score(features))
        closed_score = max(closed_score, _closed_fist_score(features))

    neutral_score = _clamp_unit(
        max(
            0.35,
            1.0 - max(primary_score, secondary_score, blade_score, open_score, closed_score),
        )
    )
    scores = cast(
        PoseScores,
        {
            "closed-fist": closed_score,
            "open-palm": open_score,
            "blade-hand": blade_score,
            "primary-pinch": primary_score,
            "secondary-pinch": secondary_score,
            "peace-sign": peace_score,
            "neutral": neutral_score,
        },
    )

    if (
        primary_score >= PINCH_MIN_SCORE
        and primary_score >= secondary_score + 0.04
        and primary_score >= max(open_score, closed_score) - 0.03
    ):
        return {"pose": POSE_PRIMARY_PINCH, "confidence": primary_score, "scores": scores}

    if (
        secondary_score >= PINCH_MIN_SCORE
        and secondary_score >= primary_score + 0.04
        and secondary_score >= max(open_score, closed_score) - 0.03
    ):
        return {"pose": POSE_SECONDARY_PINCH, "confidence": secondary_score, "scores": scores}

    if (
        blade_score >= STATIC_POSE_MIN_SCORE
        and blade_score >= max(primary_score, secondary_score, open_score, closed_score) + 0.03
    ):
        return {"pose": POSE_BLADE_HAND, "confidence": blade_score, "scores": scores}

    if (
        peace_score >= STATIC_POSE_MIN_SCORE
        and peace_score
        >= max(primary_score, secondary_score, blade_score, open_score, closed_score) + 0.03
    ):
        return {"pose": POSE_PEACE_SIGN, "confidence": peace_score, "scores": scores}

    if closed_score >= STATIC_POSE_MIN_SCORE and closed_score >= open_score + 0.03:
        return {"pose": POSE_CLOSED_FIST, "confidence": closed_score, "scores": scores}

    if open_score >= STATIC_POSE_MIN_SCORE and open_score >= closed_score + 0.03:
        return {"pose": POSE_OPEN_PALM, "confidence": open_score, "scores": scores}

    return {"pose": POSE_NEUTRAL, "confidence": neutral_score, "scores": scores}


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
    static_gesture_scores: dict[str, float] | None = None,
) -> PoseClassificationResult:
    rule_observation = classify_hybrid_pose(features, static_gesture_scores=static_gesture_scores)
    learned_observation = (
        predict_pose_model(learned_model, feature_values) if learned_model is not None else None
    )
    hybrid_observation = classify_hybrid_pose(
        features,
        static_gesture_scores=static_gesture_scores,
        learned_scores=learned_observation["scores"] if learned_observation is not None else None,
    )

    if mode == "learned" and learned_observation is not None:
        active = learned_observation
    else:
        active = hybrid_observation if learned_observation is not None else rule_observation

    if hybrid_observation["pose"] == POSE_PEACE_SIGN:
        active = hybrid_observation

    if mode == "shadow" and learned_observation is not None:
        active = hybrid_observation

    return PoseClassificationResult(
        active=active,
        rule=rule_observation,
        learned=learned_observation,
        mode=mode if learned_model is not None or mode == "rules" else "rules",
        model_version=learned_model.model_version if learned_model is not None else None,
    )
