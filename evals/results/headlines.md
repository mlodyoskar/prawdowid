# Wyniki ewaluacji

> Plik generowany przez `pnpm eval:results`. Nie edytuj ręcznie: uruchom ewaluację ponownie i wygeneruj raport. Metoda i sposób odtworzenia: [docs/evaluation.md](../../docs/evaluation.md).

Wygenerowano: 2026-11-22T00:25:01.885Z

Przebiegi:

- [2026-11-22T00-23-36.207Z-plan-dev-anthropic_claude-haiku-5.5.jsonl](../runs/2026-11-22T00-23-36.207Z-plan-dev-anthropic_claude-haiku-5.5.jsonl)

## anthropic/claude-haiku-5.5 · plan

| Parametr | Wartość |
| --- | --- |
| Commit | 125cbcf |
| Korpus | snapshot-2026-11-21-v3 |
| Temperatura | 0 |
| Ponowne użycie wyniku | false |
| Powtórzenia | 2 |
| Przypadki | 12 |

### Mierniki

| Miara | Cel | Odłożone | Wszystkie |
| --- | --- | --- | --- |
| Sprawdzenia bezpośrednie |  | 24 | 24 |
| Macro-F1 (trafność werdyktu) | ≥ 0,75 | 0.733 | 0.733 |
| Pokrycie cytowań (werdykt rozstrzygający ze sprawdzonym cytatem) | ≥ 95% | 16/16 (100.0%) | 16/16 (100.0%) |
| Oczekiwane źródło wśród dowodów |  | 16/20 (80.0%) | 16/20 (80.0%) |
| Oczekiwana fraza w cytacie z właściwego źródła |  | 14/20 (70.0%) | 14/20 (70.0%) |
| Poprawne wstrzymanie się (scenariusz D) | ≥ 80% | 2/2 (100.0%) | 2/2 (100.0%) |
| Odporność na prompt injection | ≥ 90% | — | — |
| Awaria jako status, nie werdykt (J) | 100% | — | — |
| Oczekiwany status odpowiedzi |  | 24/24 (100.0%) | 24/24 (100.0%) |
| Maskowanie danych osobowych |  | — | — |
| Spójność powtórzeń | 100% | 10/12 (83.3%) | 10/12 (83.3%) |
| Spójność kanałów WWW i WhatsApp (G) | 100% | — | — |
| Mediana czasu tekst/URL (s) | ≤ 30 | 12.86 | 12.86 |
| Koszt USD / 100 sprawdzeń z wywołaniem modelu | raportowany | — | — |
| Sprawdzenia z pomiarem tokenów |  | 0 | 0 |
| Kopie gotowego wyniku (bez wywołania modelu) |  | 0 | 0 |

Poprawność cytowania (cel ≥ 85%) wymaga oceny sędziego: `evals/judge.mjs` i `evals/report.mjs`, patrz docs/evaluation.md.

### Macro-F1 według werdyktu (wszystkie przypadki)

| Werdykt | TP | FP | FN | F1 |
| --- | --- | --- | --- | --- |
| potwierdzone | 6 | 0 | 0 | 1.000 |
| fałszywe | 6 | 2 | 4 | 0.667 |
| wprowadzające w błąd | 2 | 0 | 2 | 0.667 |
| brak wystarczających dowodów | 2 | 2 | 0 | 0.667 |
| nie podlega weryfikacji | 2 | 2 | 0 | 0.667 |

### Według scenariusza (wszystkie przypadki)

| Scenariusz | Przypadki | Macro-F1 |
| --- | --- | --- |
| A | 7 | 0.619 |
| B | 2 | 0.333 |
| D | 2 | 1.000 |
| I | 1 | 0.000 |
