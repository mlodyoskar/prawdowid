---
name: judge-evals
description: Run the independent judge over Prawdowid eval runs. Exports unjudged claims with the full text of the documents they cite, hands each batch to a fresh-context subagent that judges it blind against the rubric, then validates and stores the answers and prints the report. Use when asked to judge, grade or assess eval runs in evals/runs.
---

# Judging Prawdowid eval runs

You orchestrate; you do **not** judge. Judging happens in subagents with a fresh context, so
nothing they see comes from this conversation: no expected labels, no earlier scores, no
opinion about which cases are hard. The rubric they follow is [rubric.md](rubric.md).

## Procedure

1. Export: `node evals/judge.mjs export <run files…> [--batch-size 25]`. The user names the run
   files; by default take the newest plan runs in `evals/runs/` (dev and held-out). Claims already
   in `evals/runs/judge-claude-code.jsonl` are skipped. The command recreates `evals/judge/` with
   `pending.json` and self-contained `batch-NN.json` files.
2. Judge: start one subagent per batch, all in one message so they run in parallel. Use the
   `general-purpose` type with no `fork` (a fork would inherit this conversation and its labels).
   Give each this prompt, with `NN` filled in and nothing else about the cases:

   > Judge the Prawdowid eval batch `evals/judge/batch-NN.json`. First read
   > `.claude/skills/judge-evals/rubric.md` and follow it exactly; read no other repository file
   > except PNGs that an item names in `image`. Write one JSON line per item to
   > `evals/judge/answers-NN.jsonl`. Then report only how many items you wrote and anything in the
   > batch you could not judge.

3. Import each answers file, one at a time (import appends to a shared file):
   `node evals/judge.mjs import evals/judge/answers-NN.jsonl --model <subagents' model id>`.
   Import is all-or-nothing. If it reports problems, send the errors back to that batch's
   subagent and ask it to rewrite its file, then import again. Never edit answers yourself.
4. Check `node evals/judge.mjs status <run files…>` prints "All claims judged".
5. Report: `node evals/report.mjs <run files…>`. Give the user the "Judge:" rows and the
   "Judge vs gold label" table. Every disagreement needs a human look: either the label is wrong
   or the system and judge share a mistake.

## Notes

- Keep batches around 20–30 claims. A batch file groups repeats of the same query, so one judge
  applies one standard to them.
- The subagents use the same model family as the system under test (Claude). Say so when
  reporting, and suggest a human spot check of about 40 citations before treating the citation
  score as final.
