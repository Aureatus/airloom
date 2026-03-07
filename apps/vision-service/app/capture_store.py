from __future__ import annotations

import json
import shutil
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from app.protocol import CaptureCounts, PoseClassifierMode, PoseName, empty_capture_counts


def _timestamp() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


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
        label: PoseName,
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
        self.counts[label] += 1
        self.last_take_id = take_id
        self.last_take_path = path
        return path

    def discard_last_take(self) -> bool:
        if (
            self.last_take_path is None
            or not self.last_take_path.exists()
            or self.last_take_id is None
        ):
            return False
        payload = json.loads(self.last_take_path.read_text())
        label = payload.get("label")
        self.last_take_path.unlink()
        self.take_count = max(0, self.take_count - 1)
        if isinstance(label, str) and label in self.counts:
            self.counts[label] = max(0, self.counts[label] - 1)
        self.last_take_path = None
        self.last_take_id = None
        return True

    def export_session(self) -> Path:
        destination = self.export_dir / self.session_id
        if destination.exists():
            shutil.rmtree(destination)
        shutil.copytree(self.session_dir, destination)
        self.last_export_path = destination
        return destination
