"""Builds a JSONL prompt/response dataset from reward-scored experiences."""

import json
from pathlib import Path

OUTPUT_PATH = Path(__file__).parent / "data" / "dataset.jsonl"


def build_dataset(experiences_with_rewards: list[dict], min_reward: float = 0) -> list[dict]:
    """Keep qualifying request/response pairs; exclude negative examples by default."""
    dataset = []
    for experience in experiences_with_rewards:
        if experience.get("reward", 0) < min_reward:
            continue
        request = (experience.get("request") or "").strip()
        response = (experience.get("response") or "").strip()
        if request and response:
            dataset.append({"prompt": request, "response": response, "reward": experience["reward"]})
    return dataset


def save_dataset(dataset: list[dict], path: Path = OUTPUT_PATH) -> Path:
    """Atomically unnecessary offline JSONL output for the optional trainer."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        for row in dataset:
            file.write(json.dumps(row) + "\n")
    return path
