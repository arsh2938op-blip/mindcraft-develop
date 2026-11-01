"""Optional Hugging Face LoRA trainer for FlameAGI's offline dataset.

This does not fine-tune an Ollama-packaged model. Use a compatible Hugging
Face base model, then merge/export it to an Ollama Modelfile separately.
Dependencies are optional until train() is called:
    pip install torch transformers peft datasets accelerate
"""

from pathlib import Path


def train(
    dataset_path: Path,
    base_model: str = "google/gemma-2-2b-it",
    output_dir: str = "train/output/flame-lora",
    epochs: int = 1,
):
    """Fine-tune a LoRA adapter from a JSONL prompt/response dataset."""
    try:
        from datasets import load_dataset
        from peft import LoraConfig, get_peft_model
        from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments
    except ImportError as error:
        raise RuntimeError(
            "Missing training dependencies. Run: pip install torch transformers peft datasets accelerate"
        ) from error

    if not dataset_path.exists():
        raise FileNotFoundError(f"No dataset found at {dataset_path} — run train.py --dry-run first.")
    if not isinstance(epochs, int) or epochs <= 0:
        raise ValueError("epochs must be a positive integer.")

    tokenizer = AutoTokenizer.from_pretrained(base_model)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    model = AutoModelForCausalLM.from_pretrained(base_model)
    model = get_peft_model(model, LoraConfig(
        r=8, lora_alpha=16, target_modules=["q_proj", "v_proj"],
        lora_dropout=0.05, bias="none", task_type="CAUSAL_LM",
    ))
    raw_dataset = load_dataset("json", data_files=str(dataset_path))["train"]

    def format_and_tokenize(example):
        text = f"### Request:\n{example['prompt']}\n\n### Response:\n{example['response']}"
        tokens = tokenizer(text, truncation=True, padding="max_length", max_length=512)
        tokens["labels"] = tokens["input_ids"].copy()
        return tokens

    tokenized = raw_dataset.map(format_and_tokenize)
    arguments = TrainingArguments(
        output_dir=output_dir, num_train_epochs=epochs, per_device_train_batch_size=1,
        gradient_accumulation_steps=4, logging_steps=10, save_strategy="epoch",
    )
    trainer = Trainer(model=model, args=arguments, train_dataset=tokenized)
    trainer.train()
    model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)
    return output_dir
