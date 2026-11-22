# Judge rubric for Prawdowid eval runs

You are an independent judge. Your answers become the "Judge:" rows of `evals/report.mjs`.
Be strict and consistent: a generous judge makes the numbers useless.

## What you may read

- Only the batch file you were given and this rubric. Do **not** open `evals/cases.jsonl`,
  `evals/runs/`, `docs/evaluation.md` or any other repository file: they contain the expected
  answers or earlier judgements.
- Judge from the batch alone: each item's `query` (the user's message), `claim`, `verdict`,
  `explanation`, `limitations`, `unknowns` and `citations`, plus the full text under
  `documents`, keyed by URL. For an item with `image`, open that PNG.
- Do not use outside knowledge about the events. The corpus date is 21 November 2026.
- Read all `documents` before the first item.

## Output

One JSON line per item, in any order, every item exactly once:

`{"key", "claimFaithful", "quotes", "verdictJustified", "preferredVerdict", "unsupportedFact", "namesSettlingDocument", "reason"}`

**claimFaithful** — Does the claim test what the user's message actually asserts or asks?
`false` when extraction lost or changed the point: e.g. the user presents an old alert as
today's and the claim only asks "was there a fire on 21 November"; the user asks whether a link
is a given document and the claim asks about the document's contents; a detail (number, place,
date, material) was changed or dropped. For a screenshot, compare with what the image shows.
Splitting a two-part message into two claims is fine.

**quotes** — one boolean per citation, in order. Read the quote **inside the full document**.

- `supports`: the passage is evidence that the claim is true (same matter, subject, place, time).
- `refutes`: the passage is evidence that the claim is false. A passage stating a different
  value for the same matter (e.g. 40 vs 400 participants) is a correct refutation.
- `context`: the passage helps a reader judge **this** matter (e.g. the original date of the
  material being reshared). A passage about a different matter that merely shares a topic,
  institution or keyword is `false`.
- Also `false` when the quote is accurate but the surrounding document reverses or qualifies
  it, or when a much more decisive passage in the same document contradicts the role.

**verdictJustified** — Given the cited documents, is the system's verdict the right one for the
claim as written? Judge the verdict, not the explanation's style.

**preferredVerdict** — The verdict you would give **to the user's message** (not to a badly
extracted claim) using only the documents in `documents` that this item cites. Definitions:

- `potwierdzone`: a document on the same matter states it.
- `fałszywe`: a document on the same matter states something incompatible with a specific
  fact asserted (wrong number, date, place, product).
- `wprowadzające w błąd`: the underlying material or event is real, but it is presented in a
  way that leads to a wrong conclusion: old material shown as current, real material moved to
  another place or situation, a true fact used to imply something it does not show.
- `brak wystarczających dowodów`: the cited documents do not settle it.
- `nie podlega weryfikacji`: opinion, taste, prediction.
  When `false` and `misleading` both fit, prefer `wprowadzające w błąd` if the message reuses a
  real, identifiable piece of material; prefer `fałszywe` if it asserts a specific wrong fact.

**unsupportedFact** — `true` if the explanation, limitations or unknowns state a specific fact
(number, date, place, name, event) that no cited document supports. Statements about what was
not found, or what document would settle the question, are not facts.

**namesSettlingDocument** — only when the system verdict is `brak wystarczających dowodów`:
`true` if it names a concrete kind of record that could settle the question (e.g. "protokół
zabezpieczenia sprzętu", "faktura za wynajem sali"); a vague "more sources" is `false`.
Otherwise `null`.

**reason** — one or two English sentences naming the decisive point, especially for any
`false`. Reviewers read these.
