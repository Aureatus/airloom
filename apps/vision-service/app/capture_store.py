from __future__ import annotations

import json
import shutil
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal
from uuid import uuid4

from app.protocol import CaptureCounts, PoseClassifierMode, empty_capture_counts

CaptureLabel = Literal[
    "neutral",
    "open-palm",
    "blade-hand",
    "closed-fist",
    "primary-pinch",
    "secondary-pinch",
    "peace-sign",
]


@dataclass(frozen=True, slots=True)
class CaptureTakeRecord:
    take_id: str
    path: Path
    label: CaptureLabel


def _timestamp() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _increment_count(counts: CaptureCounts, label: CaptureLabel) -> None:
    if label == "neutral":
        counts["neutral"] += 1
    elif label == "open-palm":
        counts["open-palm"] += 1
    elif label == "blade-hand":
        counts["blade-hand"] += 1
    elif label == "closed-fist":
        counts["closed-fist"] += 1
    elif label == "primary-pinch":
        counts["primary-pinch"] += 1
    elif label == "secondary-pinch":
        counts["secondary-pinch"] += 1
    else:
        counts["peace-sign"] += 1


def _decrement_count(counts: CaptureCounts, label: CaptureLabel) -> None:
    if label == "neutral":
        counts["neutral"] = max(0, counts["neutral"] - 1)
    elif label == "open-palm":
        counts["open-palm"] = max(0, counts["open-palm"] - 1)
    elif label == "blade-hand":
        counts["blade-hand"] = max(0, counts["blade-hand"] - 1)
    elif label == "closed-fist":
        counts["closed-fist"] = max(0, counts["closed-fist"] - 1)
    elif label == "primary-pinch":
        counts["primary-pinch"] = max(0, counts["primary-pinch"] - 1)
    elif label == "secondary-pinch":
        counts["secondary-pinch"] = max(0, counts["secondary-pinch"] - 1)
    else:
        counts["peace-sign"] = max(0, counts["peace-sign"] - 1)


@dataclass(slots=True)
class CaptureStore:
    root_dir: Path
    export_dir: Path
    session_id: str = field(default_factory=lambda: uuid4().hex)
    counts: CaptureCounts = field(default_factory=empty_capture_counts)
    take_count: int = 0
    last_take_id: str | None = None
    last_take_path: Path | None = None
    last_export_path: Path | None = None
    take_history: list[CaptureTakeRecord] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.root_dir.mkdir(parents=True, exist_ok=True)
        self.export_dir.mkdir(parents=True, exist_ok=True)
        self.session_dir.mkdir(parents=True, exist_ok=True)

    @property
    def session_dir(self) -> Path:
        return self.root_dir / self.session_id

    def save_take(
        self,
        *,
        label: CaptureLabel,
        frames: list[dict[str, object]],
        classifier_mode: PoseClassifierMode,
        mirror_x: bool,
        model_version: str | None,
    ) -> Path:
        take_id = uuid4().hex
        path = self.session_dir / f"{take_id}.json"
        document = {
            "schemaVersion": 1,
            "takeId": take_id,
            "sessionId": self.session_id,
            "capturedAt": _timestamp(),
            "source": "calibration-ui",
            "label": label,
            "meta": {
                "poseClassifierMode": classifier_mode,
                "mirrorX": mirror_x,
                "modelVersion": model_version,
            },
            "frames": frames,
        }
        path.write_text(json.dumps(document, indent=2))
        self.take_count += 1
        _increment_count(self.counts, label)
        self.take_history.append(CaptureTakeRecord(take_id=take_id, path=path, label=label))
        self.last_take_id = take_id
        self.last_take_path = path
        return path

    def discard_last_take(self) -> bool:
        if not self.take_history:
            return False

        latest_take = self.take_history.pop()
        if latest_take.path.exists():
            latest_take.path.unlink()
        self.take_count = max(0, self.take_count - 1)
        _decrement_count(self.counts, latest_take.label)

        previous_take = self.take_history[-1] if self.take_history else None
        self.last_take_path = previous_take.path if previous_take is not None else None
        self.last_take_id = previous_take.take_id if previous_take is not None else None
        return True

    def export_session(self) -> Path:
        destination = self.export_dir / self.session_id
        if destination.exists():
            shutil.rmtree(destination)
        shutil.copytree(self.session_dir, destination)
        self.last_export_path = destination
        return destination
