# Wyniki ewaluacji

> Plik generowany przez `pnpm eval:results`. Nie edytuj ręcznie: uruchom ewaluację ponownie i wygeneruj raport. Metoda i sposób odtworzenia: [docs/evaluation.md](../../docs/evaluation.md).

Wygenerowano: 2026-11-22T00:06:39.051Z

Przebiegi:

- [2026-11-21T23-49-45.135Z-plan-dev-anthropic_claude-haiku-5.5.jsonl](../runs/2026-11-21T23-49-45.135Z-plan-dev-anthropic_claude-haiku-5.5.jsonl)
- [2026-11-21T23-49-45.135Z-plan-held-out-anthropic_claude-haiku-5.5.jsonl](../runs/2026-11-21T23-49-45.135Z-plan-held-out-anthropic_claude-haiku-5.5.jsonl)

## anthropic/claude-haiku-5.5 · plan

| Parametr | Wartość |
| --- | --- |
| Commit | nie zapisano (przebieg sprzed zapisu commita) |
| Korpus | snapshot-2026-11-21-v3 |
| Temperatura | 0 |
| Ponowne użycie wyniku | false |
| Powtórzenia | 2 |
| Przypadki | 52 |

### Mierniki

| Miara | Cel | Rozwojowe | Odłożone | Wszystkie |
| --- | --- | --- | --- | --- |
| Sprawdzenia bezpośrednie |  | 74 | 30 | 104 |
| Macro-F1 (trafność werdyktu) | ≥ 0,75 | 0.916 | 0.787 | 0.852 |
| Pokrycie cytowań (werdykt rozstrzygający ze sprawdzonym cytatem) | ≥ 95% | 53/53 (100.0%) | 28/28 (100.0%) | 81/81 (100.0%) |
| Oczekiwane źródło wśród dowodów |  | 50/50 (100.0%) | 22/22 (100.0%) | 72/72 (100.0%) |
| Oczekiwana fraza w cytacie z właściwego źródła |  | 47/50 (94.0%) | 20/22 (90.9%) | 67/72 (93.1%) |
| Poprawne wstrzymanie się (scenariusz D) | ≥ 80% | 8/8 (100.0%) | 3/4 (75.0%) | 11/12 (91.7%) |
| Odporność na prompt injection | ≥ 90% | 10/10 (100.0%) | — | 10/10 (100.0%) |
| Awaria jako status, nie werdykt (J) | 100% | 8/8 (100.0%) | — | 8/8 (100.0%) |
| Oczekiwany status odpowiedzi |  | 74/74 (100.0%) | 30/30 (100.0%) | 104/104 (100.0%) |
| Maskowanie danych osobowych |  | 2/2 (100.0%) | — | 2/2 (100.0%) |
| Spójność powtórzeń | 100% | 23/37 (62.2%) | 8/15 (53.3%) | 31/52 (59.6%) |
| Spójność kanałów WWW i WhatsApp (G) | 100% | 5/8 (62.5%) | 2/4 (50.0%) | 7/12 (58.3%) |
| Mediana czasu tekst/URL (s) | ≤ 30 | 11.32 | 10.89 | 11.14 |
| Koszt USD / 100 sprawdzeń z wywołaniem modelu | raportowany | 0.237 | 0.253 | 0.242 |
| Sprawdzenia z pomiarem tokenów |  | 72 | 30 | 102 |
| Kopie gotowego wyniku (bez wywołania modelu) |  | 0 | 0 | 0 |

Poprawność cytowania (cel ≥ 85%) wymaga oceny sędziego: `evals/judge.mjs` i `evals/report.mjs`, patrz docs/evaluation.md.

### Macro-F1 według werdyktu (wszystkie przypadki)

| Werdykt | TP | FP | FN | F1 |
| --- | --- | --- | --- | --- |
| potwierdzone | 37 | 6 | 1 | 0.914 |
| fałszywe | 21 | 4 | 3 | 0.857 |
| wprowadzające w błąd | 7 | 6 | 3 | 0.609 |
| brak wystarczających dowodów | 11 | 2 | 1 | 0.880 |
| nie podlega weryfikacji | 6 | 0 | 0 | 1.000 |

### Według scenariusza (wszystkie przypadki)

| Scenariusz | Przypadki | Macro-F1 |
| --- | --- | --- |
| A | 14 | 1.000 |
| B | 8 | 0.886 |
| D | 9 | 0.652 |
| E | 5 | 1.000 |
| F | 3 | 0.556 |
| I | 3 | 0.190 |
| J | 4 | — |
| X | 6 | 0.508 |
