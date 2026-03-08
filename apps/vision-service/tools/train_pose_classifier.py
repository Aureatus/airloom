from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

import numpy as np


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train Airloom pose classifier")
    parser.add_argument("input", type=Path, help="Exported capture root directory")
    parser.add_argument("output", type=Path, help="Output model JSON path")
    parser.add_argument("--stride", type=int, default=3, help="Keep every Nth frame")
    parser.add_argument("--min-probability", type=float, default=0.58)
    parser.add_argument("--min-margin", type=float, default=0.12)
    parser.add_argument(
        "--exclude-label",
        action="append",
        default=[],
        help="Capture labels to exclude from training",
    )
    return parser.parse_args()


def iter_capture_documents(root: Path) -> list[dict[str, object]]:
    return [json.loads(path.read_text()) for path in sorted(root.glob("**/*.json"))]


def load_training_rows(
    root: Path, stride: int, excluded_labels: set[str] | None = None
) -> tuple[list[str], np.ndarray, np.ndarray, list[str]]:
    documents = iter_capture_documents(root)
    rows: list[list[float]] = []
    labels: list[str] = []
    sessions: list[str] = []
    feature_names: list[str] | None = None

    for document in documents:
        label = str(document["label"])
        if excluded_labels and label in excluded_labels:
            continue
        session_id = str(document.get("sessionId", "unknown"))
        frames = document.get("frames", [])
        if not isinstance(frames, list):
            continue
        for index, frame in enumerate(frames):
            if index % max(1, stride) != 0:
                continue
            if not isinstance(frame, dict) or not frame.get("tracking", False):
                continue
            features = frame.get("features")
            if not isinstance(features, dict):
                continue
            if feature_names is None:
                feature_names = sorted(str(name) for name in features)
            rows.append([float(features[name]) for name in feature_names])
            labels.append(label)
            sessions.append(session_id)

    if feature_names is None or not rows:
        raise ValueError("No capture frames with feature payloads were found")

    return feature_names, np.array(rows, dtype=np.float64), np.array(labels), sessions


def train_model(
    feature_names: list[str], x: np.ndarray, y: np.ndarray, sessions: list[str]
) -> dict[str, object]:
    try:
        from sklearn.linear_model import LogisticRegression
        from sklearn.metrics import classification_report, confusion_matrix
    except ImportError as error:  # pragma: no cover - depends on optional group
        raise SystemExit(
            "Training dependencies are missing. Run with `uv sync --group train` first."
        ) from error

    unique_sessions = sorted(set(sessions))
    validation_sessions = set(unique_sessions[::5] or unique_sessions[-1:])
    train_mask = np.array([session not in validation_sessions for session in sessions])
    if not train_mask.any() or train_mask.all() or set(y[train_mask]) != set(y):
        validation_indices: set[int] = set()
        for label in sorted(set(y)):
            label_indices = [index for index, value in enumerate(y) if value == label]
            if len(label_indices) <= 1:
                continue
            validation_indices.add(label_indices[0])
        if validation_indices:
            train_mask = np.array(
                [index not in validation_indices for index in range(len(sessions))]
            )
            validation_sessions = {f"row-{index}" for index in sorted(validation_indices)}
        else:
            train_mask = np.ones(len(sessions), dtype=bool)
            validation_sessions = set()

    mean = x[train_mask].mean(axis=0)
    scale = x[train_mask].std(axis=0)
    scale[scale == 0] = 1.0
    x_train = (x[train_mask] - mean) / scale
    x_val = (x[~train_mask] - mean) / scale if (~train_mask).any() else x_train
    y_train = y[train_mask]
    y_val = y[~train_mask] if (~train_mask).any() else y_train

    model = LogisticRegression(max_iter=2000)
    model.fit(x_train, y_train)

    predictions = model.predict(x_val)
    labels = [str(label) for label in model.classes_]
    report = classification_report(y_val, predictions, labels=labels, output_dict=True)
    matrix = confusion_matrix(y_val, predictions, labels=labels).tolist()

    return {
        "feature_schema_version": int(x[0][0]) if feature_names[0] == "schema_version" else 1,
        "feature_names": feature_names,
        "labels": labels,
        "mean": mean.tolist(),
        "scale": scale.tolist(),
        "weights": model.coef_.tolist(),
        "bias": model.intercept_.tolist(),
        "metrics": {
            "classification_report": report,
            "confusion_matrix": matrix,
            "validation_sessions": sorted(validation_sessions),
            "samples_by_label": dict(
                defaultdict(int, ((label, int((y == label).sum())) for label in labels))
            ),
        },
    }


def main() -> None:
    args = parse_args()
    feature_names, x, y, sessions = load_training_rows(
        args.input,
        args.stride,
        excluded_labels={str(label) for label in args.exclude_label},
    )
    artifact = train_model(feature_names, x, y, sessions)
    artifact.update(
        {
            "model_version": args.output.stem,
            "min_probability": args.min_probability,
            "min_margin": args.min_margin,
        }
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, indent=2))


if __name__ == "__main__":
    main()
