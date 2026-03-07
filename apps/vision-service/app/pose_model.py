from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from app.protocol import PoseName, PoseObservation, PoseScores, empty_pose_scores


@dataclass(frozen=True, slots=True)
class PoseModelArtifact:
    feature_schema_version: int
    feature_names: tuple[str, ...]
    labels: tuple[PoseName, ...]
    mean: np.ndarray
    scale: np.ndarray
    weights: np.ndarray
    bias: np.ndarray
    min_probability: float
    min_margin: float
    model_version: str


def load_pose_model(path: Path) -> PoseModelArtifact:
    payload = json.loads(path.read_text())
    labels = tuple(payload["labels"])
    feature_names = tuple(payload["feature_names"])
    return PoseModelArtifact(
        feature_schema_version=int(payload["feature_schema_version"]),
        feature_names=feature_names,
        labels=labels,
        mean=np.array(payload["mean"], dtype=np.float64),
        scale=np.array(payload["scale"], dtype=np.float64),
        weights=np.array(payload["weights"], dtype=np.float64),
        bias=np.array(payload["bias"], dtype=np.float64),
        min_probability=float(payload.get("min_probability", 0.6)),
        min_margin=float(payload.get("min_margin", 0.12)),
        model_version=str(payload.get("model_version", path.stem)),
    )


def _softmax(values: np.ndarray) -> np.ndarray:
    shifted = values - np.max(values)
    exps = np.exp(shifted)
    return exps / np.sum(exps)


def _scores_from_probabilities(
    labels: tuple[PoseName, ...], probabilities: np.ndarray
) -> PoseScores:
    scores = empty_pose_scores()
    for index, label in enumerate(labels):
        if label == "unknown":
            continue
        scores[label] = float(probabilities[index])
    return scores


def predict_pose_model(
    model: PoseModelArtifact, feature_values: dict[str, float]
) -> PoseObservation:
    vector = np.array([feature_values[name] for name in model.feature_names], dtype=np.float64)
    normalized = (vector - model.mean) / np.where(model.scale == 0, 1.0, model.scale)
    logits = normalized @ model.weights.T + model.bias
    probabilities = _softmax(logits)
    scores = _scores_from_probabilities(model.labels, probabilities)

    ordered = sorted(
        [(label, float(probabilities[index])) for index, label in enumerate(model.labels)],
        key=lambda item: item[1],
        reverse=True,
    )
    best_pose, best_score = ordered[0]
    second_score = ordered[1][1] if len(ordered) > 1 else 0.0

    if best_score < model.min_probability or best_score - second_score < model.min_margin:
        return {"pose": "unknown", "confidence": best_score, "scores": scores}

    return {"pose": best_pose, "confidence": best_score, "scores": scores}
