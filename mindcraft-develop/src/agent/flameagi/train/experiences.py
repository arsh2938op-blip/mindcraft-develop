"""Normalizes live FlameAGI runtime experiences for offline training."""

import json
from pathlib import Path
from typing import Iterator

DATA_PATH = Path(__file__).parent / "data" / "experiences.jsonl"


def load_raw_experiences(path: Path = DATA_PATH) -> Iterator[dict]:
    """Yield records exactly as written by experience.js."""
    if not path.exists():
        return
    with path.open("r", encoding="utf-8") as file:
        for line in file:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def normalize_experience(raw: dict) -> dict:
    """Convert a runtime record into the compact offline-pipeline shape."""
    tool_result = raw.get("toolResult") or {}
    return {
        "request": raw.get("request", "") or "",
        "response": raw.get("modelResponse", "") or raw.get("response", "") or "",
        "action": raw.get("action"),
        "tool_success": tool_result.get("success") if isinstance(tool_result, dict) else None,
        "timestamp": raw.get("timestamp"),
    }


def load_experiences(path: Path = DATA_PATH) -> list[dict]:
    """Load and normalize all available runtime experiences."""
    return [normalize_experience(record) for record in load_raw_experiences(path)]
