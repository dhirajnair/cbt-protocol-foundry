Prompt evaluation (RAGAS harness) — git-tracked layout

Layout (tracked)
- evals/cases.jsonl          # eval scenarios (inputs, expected signals, tags)
- evals/ragas_harness.py     # runner (no app code changes)
- evals/runs/                # run artifacts (responses + summary per run)
- evals/prompts-baseline.md  # optional prompt snapshot + commit hash
- evals/judges/              # optional judge prompt rubrics (.md)

Prereqs
- `pip install ragas openai`
- `export OPENAI_API_KEY=...`

Run a baseline (current prompts in repo)
```
python evals/ragas_harness.py \
  --cases evals/cases.jsonl \
  --prompt-name DRAFTER_TASK_PROMPT \
  --model gpt-4o-mini \
  --run-dir evals/runs
```
Artifacts: `evals/runs/run-YYYYMMDD-HHMMSS/{responses.jsonl, summary.json}` (includes `prompt_hash`).

Test a new prompt version (without editing repo)
1) Save the new prompt text to a temp file, e.g., `/tmp/new_drafter_prompt.txt`.
2) Run:
```
python evals/ragas_harness.py \
  --cases evals/cases.jsonl \
  --prompt-name DRAFTER_TASK_PROMPT \
  --new-prompt-file /tmp/new_drafter_prompt.txt \
  --model gpt-4o-mini \
  --run-dir evals/runs
```
3) Compare the new `summary.json` to the baseline: regress if metrics drop or expectations in `cases.jsonl` are violated (inspect `responses.jsonl`).

Notes
- For TASK prompts, the harness auto-loads the sibling SYSTEM prompt if present.
- Metrics here are soft semantic scores; pair with the expected fields in `cases.jsonl` for hard/structure checks.
- If a change is intentional, accept the new run as baseline and keep the prior summary for history.***
