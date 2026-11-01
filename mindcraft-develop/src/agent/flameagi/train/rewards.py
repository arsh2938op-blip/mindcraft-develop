"""Calculates a deliberately simple reward signal per offline experience."""

from typing import Optional

REWARD_TOOL_SUCCESS = 10
REWARD_TOOL_FAILURE = -10
REWARD_HAS_RESPONSE = 1
REWARD_EMPTY_RESPONSE = -1


def compute_reward(experience: dict) -> float:
    """Score one normalized experience without mutating it."""
    tool_success: Optional[bool] = experience.get("tool_success")
    if tool_success is True:
        return REWARD_TOOL_SUCCESS
    if tool_success is False:
        return REWARD_TOOL_FAILURE
    return REWARD_HAS_RESPONSE if (experience.get("response") or "").strip() else REWARD_EMPTY_RESPONSE


def attach_rewards(experiences: list[dict]) -> list[dict]:
    """Return copies with a reward field added."""
    return [{**experience, "reward": compute_reward(experience)} for experience in experiences]


def summarize(experiences_with_rewards: list[dict]) -> dict:
    """Return compact reward statistics for dry runs."""
    if not experiences_with_rewards:
        return {"count": 0, "total": 0, "average": 0}
    rewards = [experience["reward"] for experience in experiences_with_rewards]
    return {"count": len(rewards), "total": sum(rewards), "average": sum(rewards) / len(rewards)}
