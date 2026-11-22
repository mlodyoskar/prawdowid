# Wyniki ewaluacji

> Plik generowany przez `pnpm eval:results`. Nie edytuj ręcznie: uruchom ewaluację ponownie i wygeneruj raport. Metoda i sposób odtworzenia: [docs/evaluation.md](../../docs/evaluation.md).

Wygenerowano: 2026-11-22T08:44:05.390Z

Przebiegi:

- [2026-11-22T08-33-26.551Z-plan-dev-anthropic_claude-haiku-5.5.jsonl](../runs/2026-11-22T08-33-26.551Z-plan-dev-anthropic_claude-haiku-5.5.jsonl)
- [2026-11-22T08-39-13.699Z-plan-held-out-anthropic_claude-haiku-5.5.jsonl](../runs/2026-11-22T08-39-13.699Z-plan-held-out-anthropic_claude-haiku-5.5.jsonl)

## anthropic/claude-haiku-5.5 · plan

| Parametr | Wartość |
| --- | --- |
| Commit | 807a6d2, 807a6d2-dirty |
| Korpus | snapshot-2026-11-22-v8 |
| Temperatura | 0 |
| Ponowne użycie wyniku | false |
| Powtórzenia | 3 |
| Przypadki | 52 |

### Mierniki

| Miara | Cel | Rozwojowe | Odłożone | Wszystkie |
| --- | --- | --- | --- | --- |
| Sprawdzenia bezpośrednie |  | 111 | 45 | 156 |
| Macro-F1 (trafność werdyktu) | ≥ 0,75 | 0.851 | 0.812 | 0.859 |
| Pokrycie cytowań (werdykt rozstrzygający ze sprawdzonym cytatem) | ≥ 95% | 84/84 (100.0%) | 41/41 (100.0%) | 125/125 (100.0%) |
| Oczekiwane źródło wśród dowodów |  | 75/75 (100.0%) | 33/33 (100.0%) | 108/108 (100.0%) |
| Oczekiwana fraza w cytacie z właściwego źródła |  | 69/75 (92.0%) | 32/33 (97.0%) | 101/108 (93.5%) |
| Poprawne wstrzymanie się (scenariusz D) | ≥ 80% | 12/12 (100.0%) | 6/6 (100.0%) | 18/18 (100.0%) |
| Odporność na prompt injection | ≥ 90% | 15/15 (100.0%) | — | 15/15 (100.0%) |
| Awaria jako status, nie werdykt (J) | 100% | 12/12 (100.0%) | — | 12/12 (100.0%) |
| Oczekiwany status odpowiedzi |  | 111/111 (100.0%) | 45/45 (100.0%) | 156/156 (100.0%) |
| Maskowanie danych osobowych |  | 3/3 (100.0%) | — | 3/3 (100.0%) |
| Spójność powtórzeń | 100% | 31/37 (83.8%) | 12/15 (80.0%) | 43/52 (82.7%) |
| Spójność kanałów WWW i WhatsApp (G) | 100% | 12/12 (100.0%) | 6/6 (100.0%) | 18/18 (100.0%) |
| Mediana czasu tekst/URL (s) | ≤ 30 | 12.01 | 12.03 | 12.01 |
| Koszt USD / 100 sprawdzeń z wywołaniem modelu | raportowany | 0.252 | 0.278 | 0.260 |
| Sprawdzenia z pomiarem tokenów |  | 108 | 45 | 153 |
| Kopie gotowego wyniku (bez wywołania modelu) |  | 0 | 0 | 0 |

Poprawność cytowania (cel ≥ 85%) wymaga oceny sędziego: `evals/judge.mjs` i `evals/report.mjs`, patrz docs/evaluation.md.

### Macro-F1 według werdyktu (wszystkie przypadki)

| Werdykt | TP | FP | FN | F1 |
| --- | --- | --- | --- | --- |
| potwierdzone | 52 | 18 | 5 | 0.819 |
| fałszywe | 31 | 1 | 5 | 0.912 |
| wprowadzające w błąd | 13 | 10 | 2 | 0.684 |
| brak wystarczających dowodów | 18 | 5 | 0 | 0.878 |
| nie podlega weryfikacji | 9 | 0 | 0 | 1.000 |

### Według scenariusza (wszystkie przypadki)

| Scenariusz | Przypadki | Macro-F1 |
| --- | --- | --- |
| A | 14 | 0.642 |
| B | 8 | 0.858 |
| D | 9 | 1.000 |
| E | 5 | 1.000 |
| F | 3 | 0.636 |
| I | 3 | 0.099 |
| J | 4 | — |
| X | 6 | 0.600 |
