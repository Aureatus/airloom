from __future__ import annotations

import os
from pathlib import Path
from urllib.request import urlopen

HAND_LANDMARKER_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task"
)
GESTURE_RECOGNIZER_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task"
)


def _default_cache_dir() -> Path:
    xdg_cache = os.environ.get("XDG_CACHE_HOME")
    if xdg_cache:
        return Path(xdg_cache) / "airloom" / "models"

    return Path.home() / ".cache" / "airloom" / "models"


def ensure_hand_landmarker_model() -> Path:
    override = os.environ.get("AIRLOOM_HAND_LANDMARKER_MODEL")
    if override:
        path = Path(override).expanduser().resolve()
        if not path.exists():
            raise RuntimeError(f"AIRLOOM_HAND_LANDMARKER_MODEL does not exist: {path}")
        return path

    cache_dir = _default_cache_dir()
    cache_dir.mkdir(parents=True, exist_ok=True)
    model_path = cache_dir / "hand_landmarker.task"
    if model_path.exists():
        return model_path

    temp_path = model_path.with_suffix(".task.part")
    with urlopen(HAND_LANDMARKER_MODEL_URL, timeout=60) as response:
        temp_path.write_bytes(response.read())

    temp_path.replace(model_path)
    return model_path


def ensure_gesture_recognizer_model() -> Path:
    override = os.environ.get("AIRLOOM_GESTURE_RECOGNIZER_MODEL")
    if override:
        path = Path(override).expanduser().resolve()
        if not path.exists():
            raise RuntimeError(f"AIRLOOM_GESTURE_RECOGNIZER_MODEL does not exist: {path}")
        return path

    cache_dir = _default_cache_dir()
    cache_dir.mkdir(parents=True, exist_ok=True)
    model_path = cache_dir / "gesture_recognizer.task"
    if model_path.exists():
        return model_path

    temp_path = model_path.with_suffix(".task.part")
    with urlopen(GESTURE_RECOGNIZER_MODEL_URL, timeout=60) as response:
        temp_path.write_bytes(response.read())

    temp_path.replace(model_path)
    return model_path
