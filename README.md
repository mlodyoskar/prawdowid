# Prawdowid

Narzędzie do weryfikacji informacji dla obywatela: przyjmuje tekst lub URL przez stronę WWW i drugi kanał komunikacji, wyszukuje dowody w jawnym katalogu źródeł i zwraca werdykt z cytatami. Gdy dowodów brakuje, uczciwie wstrzymuje się od rozstrzygnięcia.

Wyzwanie MSZ na HackNation 2026.

## Mapa repo

### Kod

| Ścieżka                                  | Zawartość                                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [apps/web](apps/web)                     | Frontend WWW                                                                                        |
| [apps/api](apps/api)                     | HTTP API (Hono): zadania asynchroniczne, walidacja, zapis przebiegu, wybór modelu; woła `verify()`  |
| [packages/contracts](packages/contracts) | Wspólne schematy zod i typy: `Verdict`, `ClaimResult`, `Evidence`, `CheckRequest`/`CheckResponse`   |
| [packages/agent](packages/agent)         | Logika weryfikacji: `verify()` i narzędzia AI SDK; model dowolnego dostawcy wstrzykiwany z zewnątrz |
| [packages/sources](packages/sources)     | Warstwa danych: korpus (SQLite FTS) i scraper, klient Google Fact Check, pobieranie URL-i           |

Zależności: `api → agent → sources → contracts`. Frontend zna tylko `contracts`.

### Dokumenty i dane

| Ścieżka                                                              | Zawartość                                                                      |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [docs/challenge/wymagania.md](docs/challenge/wymagania.md)           | Wymagania wyzwania w wersji tekstowej: MVP, werdykty, metryki, ocena, co oddać |
| [docs/challenge/zadania.md](docs/challenge/zadania.md)               | Przykładowe pytania jury z oczekiwanymi odpowiedziami                          |
| [docs/challenge/tresc-zadania.pdf](docs/challenge/tresc-zadania.pdf) | Oryginalna treść zadania                                                       |
| [docs/challenge/regulamin.pdf](docs/challenge/regulamin.pdf)         | Oryginalny regulamin (nagroda, prawa autorskie)                                |
| [docs/data-sources.md](docs/data-sources.md)                         | Dane: katalog źródeł, fact-checki, EUvsDisinfo, czego brakuje                  |
| [docs/open-questions.md](docs/open-questions.md)                     | Otwarte pytania do mentorów                                                    |
| [data/sources.ts](data/sources.ts)                                   | Lista URL-i źródeł: jedyne źródło prawdy                                       |
| [.env.example](.env.example)                                         | Wymagane zmienne środowiskowe (bez wartości)                                   |

## Uruchomienie

Wymagania: Node 26 (uruchamia pliki `.ts` bez kompilacji) i pnpm 10 (`corepack enable` włącza wersję z `package.json`).

```bash
pnpm install
cp .env.example .env   # i uzupełnij klucze
```

Uzupełnij w `.env` co najmniej `LLM_BASE_URL`, `LLM_API_KEY` i `LLM_MODEL` (dowolne API zgodne z OpenAI) oraz `GOOGLE_FACTCHECK_API_KEY`. Potem:

```bash
pnpm --filter @prawdowid/sources seed   # korpus z danymi mockowymi → data/corpus.db
pnpm --filter @prawdowid/api dev        # API na http://localhost:3000
```

### API

Sprawdzenie działa jako zadanie asynchroniczne: `POST` od razu zwraca `202` z `checkId`, a wynik odbiera się przez odpytywanie.

| Metoda i ścieżka              | Co robi                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `POST /api/checks`            | Body `{ "text"?: string, "image"?: { "mediaType": "image/png", "data": "<base64>" } }` → `202` z `checkId` |
| `GET /api/checks/:checkId`    | Stan zadania `queued` / `running` / `done`; po `done` pole `result` (`CheckResponse`)                      |
| `DELETE /api/checks/:checkId` | Usuwa zapis sprawdzenia                                                                                    |
| `GET /health`                 | Konfiguracja LLM, dostępność źródeł, stan kolejki                                                          |

```bash
curl -s localhost:3000/api/checks -H 'content-type: application/json' -d '{"text":"Od grudnia wraca obowiązkowy pobór do wojska"}'
curl -s localhost:3000/api/checks/<checkId>
```

`result.status` to `ok` (werdykty z dowodami), `needs_clarification`, `out_of_scope` albo `error` (awaria techniczna, nigdy werdykt). Typy są w [packages/contracts](packages/contracts/src/index.ts).

Zabezpieczenia: URL-e z tekstu (maksymalnie 2) są pobierane z ochroną SSRF i traktowane jako materiał do oceny, nie dowód. Dane osobowe (e-mail, telefon, PESEL, konto, karta, dowód) są maskowane przed zapisem i przed modelem. `POST` jest limitowany per IP (`RATE_LIMIT_PER_MINUTE`). Wykryte próby prompt injection trafiają do ostrzeżeń i logu `prompt_injection_suspected`.

> ⚠️ Korpus zawiera na razie wyłącznie dane mockowe (URL-e `mock://…`, flaga `isMock`). Przed demem trzeba je zastąpić prawdziwymi dokumentami.

## Praca z repo

| Polecenie                           | Co robi                                         |
| ----------------------------------- | ----------------------------------------------- |
| `pnpm check`                        | Wszystko poniżej po kolei; uruchom przed pushem |
| `pnpm format` / `pnpm format:check` | Formatowanie (oxfmt)                            |
| `pnpm lint` / `pnpm lint:fix`       | Lint (oxlint z regułami korzystającymi z typów) |
| `pnpm typecheck`                    | TypeScript w każdym projekcie                   |
| `pnpm test`                         | Testy (`node --test`, pliki `*.test.ts`)        |

Konfiguracja:

- `tsconfig.base.json` to wspólny, ścisły config. Każdy projekt ma własny `tsconfig.json` z `extends` i dopisuje swoje opcje (np. `apps/web` dodaje DOM i rozwiązywanie modułów dla bundlera). Nie ma kroku budowania: TypeScript tylko sprawdza typy (`noEmit`), a Node uruchamia `.ts` bezpośrednio. Dlatego obowiązuje `erasableSyntaxOnly`: bez `enum` i `namespace`.
- `oxlint.config.ts` to bazowa konfiguracja lintera. Projekt może mieć własny `oxlint.config.ts`, który importuje bazę i ją rozszerza (przykład: `apps/web`).
- `oxfmt.config.ts` formatuje TS, JSON i Markdown.
- Pakiety wewnętrzne eksportują `./src/index.ts` i są importowane prosto ze źródeł, np. `import { ... } from '@prawdowid/contracts'`.
