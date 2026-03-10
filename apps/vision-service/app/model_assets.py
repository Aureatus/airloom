from __future__ import annotations

import os
import shutil
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
        return Path(xdg_cache) / "incantation" / "models"

    return Path.home() / ".cache" / "incantation" / "models"


def _legacy_cache_dir() -> Path:
    xdg_cache = os.environ.get("XDG_CACHE_HOME")
    if xdg_cache:
        return Path(xdg_cache) / "airloom" / "models"

    return Path.home() / ".cache" / "airloom" / "models"


def _prepare_cache_dir() -> Path:
    cache_dir = _default_cache_dir()
    legacy_cache_dir = _legacy_cache_dir()
    if not cache_dir.exists() and legacy_cache_dir.exists():
        cache_dir.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(legacy_cache_dir, cache_dir, dirs_exist_ok=True)

    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


def ensure_hand_landmarker_model() -> Path:
    override = os.environ.get("INCANTATION_HAND_LANDMARKER_MODEL") or os.environ.get(
        "AIRLOOM_HAND_LANDMARKER_MODEL"
    )
    if override:
        path = Path(override).expanduser().resolve()
        if not path.exists():
            raise RuntimeError(f"INCANTATION_HAND_LANDMARKER_MODEL does not exist: {path}")
        return path

    cache_dir = _prepare_cache_dir()
    model_path = cache_dir / "hand_landmarker.task"
    if model_path.exists():
        return model_path

    temp_path = model_path.with_suffix(".task.part")
    with urlopen(HAND_LANDMARKER_MODEL_URL, timeout=60) as response:
        temp_path.write_bytes(response.read())

    temp_path.replace(model_path)
    return model_path


def ensure_gesture_recognizer_model() -> Path:
    override = os.environ.get("INCANTATION_GESTURE_RECOGNIZER_MODEL") or os.environ.get(
        "AIRLOOM_GESTURE_RECOGNIZER_MODEL"
    )
    if override:
        path = Path(override).expanduser().resolve()
        if not path.exists():
            raise RuntimeError(f"INCANTATION_GESTURE_RECOGNIZER_MODEL does not exist: {path}")
        return path

    cache_dir = _prepare_cache_dir()
    model_path = cache_dir / "gesture_recognizer.task"
    if model_path.exists():
        return model_path

    temp_path = model_path.with_suffix(".task.part")
    with urlopen(GESTURE_RECOGNIZER_MODEL_URL, timeout=60) as response:
        temp_path.write_bytes(response.read())

    temp_path.replace(model_path)
    return model_path
