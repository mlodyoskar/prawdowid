# Wyniki ewaluacji

> Plik generowany przez `pnpm eval:results`. Nie edytuj ręcznie: uruchom ewaluację ponownie i wygeneruj raport. Metoda i sposób odtworzenia: [docs/evaluation.md](../../docs/evaluation.md).

Wygenerowano: 2026-11-21T23:59:18.506Z

Przebiegi:

- [2026-11-21T23-13-10.284Z-plan-dev-anthropic_claude-haiku-5.5.jsonl](../runs/2026-11-21T23-13-10.284Z-plan-dev-anthropic_claude-haiku-5.5.jsonl)
- [2026-11-21T23-13-10.284Z-plan-held-out-anthropic_claude-haiku-5.5.jsonl](../runs/2026-11-21T23-13-10.284Z-plan-held-out-anthropic_claude-haiku-5.5.jsonl)

## anthropic/claude-haiku-5.5 · plan

| Parametr | Wartość |
| --- | --- |
| Commit | nie zapisano (przebieg sprzed zapisu commita) |
| Korpus | snapshot-2026-11-21-v3 |
| Temperatura | 0 |
| Ponowne użycie wyniku | true |
| Powtórzenia | 3 |
| Przypadki | 48 |

### Mierniki

| Miara | Cel | Rozwojowe | Odłożone | Wszystkie |
| --- | --- | --- | --- | --- |
| Sprawdzenia bezpośrednie |  | 108 | 36 | 144 |
| Macro-F1 (trafność werdyktu) | ≥ 0,75 | 0.687 | 0.619 | 0.673 |
| Pokrycie cytowań (werdykt rozstrzygający ze sprawdzonym cytatem) | ≥ 95% | 72/72 (100.0%) | 24/24 (100.0%) | 96/96 (100.0%) |
| Oczekiwane źródło wśród dowodów |  | 72/72 (100.0%) | 24/24 (100.0%) | 96/96 (100.0%) |
| Oczekiwana fraza w cytacie z właściwego źródła |  | 66/72 (91.7%) | 18/24 (75.0%) | 84/96 (87.5%) |
| Poprawne wstrzymanie się (scenariusz D) | ≥ 80% | 12/12 (100.0%) | 6/6 (100.0%) | 18/18 (100.0%) |
| Odporność na prompt injection | ≥ 90% | 12/15 (80.0%) | — | 12/15 (80.0%) |
| Awaria jako status, nie werdykt (J) | 100% | 12/12 (100.0%) | — | 12/12 (100.0%) |
| Oczekiwany status odpowiedzi |  | 108/108 (100.0%) | 36/36 (100.0%) | 144/144 (100.0%) |
| Maskowanie danych osobowych |  | 3/3 (100.0%) | — | 3/3 (100.0%) |
| Spójność powtórzeń | 100% | 36/36 (100.0%) | 12/12 (100.0%) | 48/48 (100.0%) |
| Spójność kanałów WWW i WhatsApp (G) | 100% | 12/12 (100.0%) | 6/6 (100.0%) | 18/18 (100.0%) |
| Mediana czasu tekst/URL (s) | ≤ 30 | 10.72 | 11.67 | 10.90 |
| Koszt USD / 100 sprawdzeń z wywołaniem modelu | raportowany | 0.215 | 0.210 | 0.214 |
| Sprawdzenia z pomiarem tokenów |  | 47 | 14 | 61 |
| Kopie gotowego wyniku (bez wywołania modelu) |  | 58 | 22 | 80 |

Poprawność cytowania (cel ≥ 85%) wymaga oceny sędziego: `evals/judge.mjs` i `evals/report.mjs`, patrz docs/evaluation.md.

### Macro-F1 według werdyktu (wszystkie przypadki)

| Werdykt | TP | FP | FN | F1 |
| --- | --- | --- | --- | --- |
| potwierdzone | 48 | 18 | 6 | 0.800 |
| fałszywe | 27 | 0 | 9 | 0.857 |
| wprowadzające w błąd | 0 | 3 | 6 | 0.000 |
| brak wystarczających dowodów | 18 | 15 | 0 | 0.706 |
| nie podlega weryfikacji | 9 | 0 | 0 | 1.000 |

### Według scenariusza (wszystkie przypadki)

| Scenariusz | Przypadki | Macro-F1 |
| --- | --- | --- |
| A | 13 | 0.641 |
| B | 5 | 0.500 |
| D | 9 | 1.000 |
| E | 5 | 0.444 |
| F | 3 | 0.333 |
| I | 3 | 0.200 |
| J | 4 | — |
| X | 6 | 0.222 |
