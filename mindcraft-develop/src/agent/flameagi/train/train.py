"""Explicit entry point for FlameAGI's offline training pipeline.

The live bot never imports or runs this module.
Flow: experiences.py -> rewards.py -> datasets.py -> optional trainer.py
"""

import argparse

from datasets import build_dataset, save_dataset
from experiences import load_experiences
from rewards import attach_rewards, summarize


def main():
    parser = argparse.ArgumentParser(description="FlameAGI offline training pipeline")
    parser.add_argument("--dry-run", action="store_true", help="Build and summarize without model training.")
    parser.add_argument("--min-reward", type=float, default=0, help="Drop examples below this reward.")
    parser.add_argument("--base-model", default="google/gemma-2-2b-it")
    parser.add_argument("--epochs", type=int, default=1)
    args = parser.parse_args()

    experiences = load_experiences()
    print(f"Loaded {len(experiences)} raw experiences.")
    scored = attach_rewards(experiences)
    print(f"Reward summary: {summarize(scored)}")
    dataset = build_dataset(scored, min_reward=args.min_reward)
    dataset_path = save_dataset(dataset)
    print(f"Built dataset: {len(dataset)} examples -> {dataset_path}")
    if args.dry_run:
        print("--dry-run set: stopping before training.")
        return

    from trainer import train

    output_dir = train(dataset_path, base_model=args.base_model, epochs=args.epochs)
    print(f"Training complete. Adapter saved to: {output_dir}")


if __name__ == "__main__":
    main()
