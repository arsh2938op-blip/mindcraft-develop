from experiences import ExperienceStore
from rewards import MinecraftRewardCalculator
from datasets import build_dataset
from trainer import FlameTrainer


def main():

    print("\n🔥 FlameAGI Training Pipeline Test")
    print("----------------------------------------")

    # 1. Create test experiences
    store = ExperienceStore()

    store.record(
        request="Mine stone",
        response="I mined stone successfully.",
        outcome="success",
        context={
            "task_completed": True,
            "survived": True
        }
    )

    store.record(
        request="Enter dangerous cave",
        response="I died in the cave.",
        outcome="failure",
        context={
            "died": True
        }
    )

    experiences = store.all()

    print(f"Experiences: {len(experiences)}")

    # 2. Calculate rewards
    calculator = MinecraftRewardCalculator()

    rewards = []

    for experience in experiences:

        result = calculator.calculate(
            experience
        )

        rewards.append(
            result.reward
        )

        print(
            f"Reward: {result.reward:+.2f} | "
            f"{result.reason}"
        )

    # 3. Build dataset
    dataset = build_dataset(
        experiences,
        rewards
    )

    print(
        f"Dataset entries: {len(dataset)}"
    )

    # 4. Trainer
    trainer = FlameTrainer()

    result = trainer.train(
        dataset
    )

    print("\n✅ Pipeline test complete!")
    print(
        f"Steps: {result.steps_completed}"
    )
    print(
        f"Samples: {result.samples_processed}"
    )
    print(
        f"Average reward: {result.average_reward:.2f}"
    )
    print(
        f"Average loss: {result.average_loss:.2f}"
    )


if __name__ == "__main__":
    main()