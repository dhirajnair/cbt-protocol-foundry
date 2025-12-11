"""
RAGAS evaluation harness for prompts in backend/app/agents/prompts.py

Usage example:
  python evals/ragas_harness.py \
    --cases evals/cases.jsonl \
    --prompt-name DRAFTER_TASK_PROMPT \
    --model gpt-4o-mini \
    --run-dir evals/runs

Test a modified prompt (no repo change):
  --new-prompt-file /path/to/new_prompt.txt
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
from typing import Any, Dict, List

import openai
from ragas import evaluate
from ragas.llms import OpenAI as RagasOpenAI
from ragas.metrics import answer_relevancy, coherence


def load_cases(path: Path) -> List[Dict[str, Any]]:
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def load_prompt(prompt_name: str, new_prompt_file: Path | None) -> str:
    if new_prompt_file:
        return new_prompt_file.read_text()
    from backend.app.agents import prompts  # local import to avoid side effects at module load

    if not hasattr(prompts, prompt_name):
        raise ValueError(f"Prompt {prompt_name} not found in prompts.py")
    return getattr(prompts, prompt_name)


def maybe_load_system_prompt(prompt_name: str) -> str | None:
    if prompt_name.endswith("_TASK_PROMPT"):
        system_name = prompt_name.replace("_TASK_PROMPT", "_SYSTEM_PROMPT")
        from backend.app.agents import prompts

        if hasattr(prompts, system_name):
            return getattr(prompts, system_name)
    return None


def render_prompt(prompt_template: str, variables: Dict[str, Any]) -> str:
    return prompt_template.format(**variables)


def chat_completion(model: str, system_prompt: str | None, user_prompt: str, temperature: float = 0.0) -> str:
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_prompt})
    resp = openai.ChatCompletion.create(model=model, messages=messages, temperature=temperature)
    return resp["choices"][0]["message"]["content"]


def hash_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:10]


def main() -> None:
    parser = argparse.ArgumentParser(description="RAGAS prompt regression harness")
    parser.add_argument("--cases", default="evals/cases.jsonl", help="Path to cases.jsonl")
    parser.add_argument("--prompt-name", required=True, help="Prompt constant name (e.g., DRAFTER_TASK_PROMPT)")
    parser.add_argument("--model", default="gpt-4o-mini", help="Model name for generation and judging")
    parser.add_argument("--temperature", type=float, default=0.0, help="Generation temperature")
    parser.add_argument("--run-dir", default="evals/runs", help="Directory to store run artifacts")
    parser.add_argument("--new-prompt-file", type=str, default=None, help="Optional path to a modified prompt text")
    args = parser.parse_args()

    cases_path = Path(args.cases)
    run_dir = Path(args.run_dir)
    run_id = dt.datetime.utcnow().strftime("run-%Y%m%d-%H%M%S")
    out_dir = run_dir / run_id
    out_dir.mkdir(parents=True, exist_ok=True)

    prompt_template = load_prompt(args.prompt_name, Path(args.new_prompt_file) if args.new_prompt_file else None)
    system_prompt = maybe_load_system_prompt(args.prompt_name)
    prompt_hash = hash_text(prompt_template)

    cases = [c for c in load_cases(cases_path) if c.get("prompt") == args.prompt_name]
    if not cases:
        raise ValueError(f"No cases found for prompt {args.prompt_name} in {cases_path}")

    results = []
    for case in cases:
        user_prompt = render_prompt(prompt_template, case["input"])
        output = chat_completion(args.model, system_prompt, user_prompt, temperature=args.temperature)
        results.append(
            {
                "agent": case["agent"],
                "prompt": case["prompt"],
                "input": case["input"],
                "expected": case["expected"],
                "tags": case.get("tags", []),
                "output": output,
            }
        )

    dataset = {
        "question": [json.dumps(r["input"]) for r in results],
        "answer": [r["output"] for r in results],
        "ground_truth": [json.dumps(r["expected"]) for r in results],
        "contexts": [[] for _ in results],
    }

    llm = RagasOpenAI(model=args.model, temperature=0.0)
    eval_result = evaluate(dataset=dataset, metrics=[answer_relevancy, coherence], llm=llm)
    summary = {
        "prompt_name": args.prompt_name,
        "prompt_hash": prompt_hash,
        "model": args.model,
        "temperature": args.temperature,
        "run_id": run_id,
        "metrics": eval_result,
        "case_count": len(results),
    }

    (out_dir / "responses.jsonl").write_text("\n".join(json.dumps(r) for r in results))
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2))
    print(f"Run complete. Artifacts in {out_dir}")


if __name__ == "__main__":
    main()
