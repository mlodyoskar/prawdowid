# Prawdowid

Narzędzie do weryfikacji informacji dla obywatela: przyjmuje tekst lub URL przez stronę WWW i drugi kanał komunikacji, wyszukuje dowody w jawnym katalogu źródeł i zwraca werdykt z cytatami. Gdy dowodów brakuje, uczciwie wstrzymuje się od rozstrzygnięcia.

Wyzwanie MSZ na HackNation 2026.

## Mapa repo

### Kod

| Ścieżka                                  | Zawartość                                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [apps/web](apps/web)                     | Frontend WWW (Vite, React, Tailwind, shadcn/ui) i design system w `src/ui`                          |
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
| [docs/agent.md](docs/agent.md)                                       | Projekt agenta: decyzje, tryby `agent` i `plan`, reguły werdyktu, stan prac    |
| [todo.md](todo.md)                                                   | Odłożone decyzje                                                               |
| [data/sources.ts](data/sources.ts)                                   | Lista URL-i źródeł: jedyne źródło prawdy (z licencją źródeł korpusu)           |
| [data/corpus/snapshot.jsonl](data/corpus/snapshot.jsonl)             | Snapshot korpusu ze scrapera: dokumenty pocięte na fragmenty                   |
| [.env.example](.env.example)                                         | Wymagane zmienne środowiskowe (bez wartości)                                   |

## Uruchomienie

Wymagania: Node 26 (uruchamia pliki `.ts` bez kompilacji) i pnpm 10 (`corepack enable` włącza wersję z `package.json`).

```bash
pnpm install
cp .env.example .env   # i uzupełnij klucze
```

Uzupełnij w `.env` co najmniej `OPENROUTER_API_KEY` i `LLM_MODEL` oraz `GOOGLE_FACTCHECK_API_KEY`. Domyślnie model działa przez OpenRouter; inny dostawca zgodny z API OpenAI to zmiana `LLM_BASE_URL`. Potem:

```bash
pnpm --filter @prawdowid/sources seed   # korpus ze snapshotu data/corpus/snapshot.jsonl → data/corpus.db
pnpm --filter @prawdowid/api dev        # API na http://localhost:3000
pnpm --filter @prawdowid/web dev        # strona na http://localhost:5173
```

### API

Sprawdzenie działa jako zadanie asynchroniczne: `POST` od razu zwraca `202` z `checkId`, a wynik odbiera się przez odpytywanie.

| Metoda i ścieżka              | Co robi                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `POST /api/checks`            | Body `{ "text"?: string, "image"?: { "mediaType": "image/png", "data": "<base64>" } }` → `202` z `checkId` |
| `GET /api/checks/:checkId`    | Stan zadania `queued` / `running` / `done`; po `done` pole `result` (`CheckResponse`)                      |
| `DELETE /api/checks/:checkId` | Usuwa zapis sprawdzenia                                                                                    |
| `GET /health`                 | Konfiguracja LLM, dostępność źródeł, stan kolejki, włączone kanały                                         |
| `GET/POST /webhooks/whatsapp` | Webhook kanału WhatsApp (weryfikacja subskrypcji i wiadomości od Meta), patrz niżej                        |

```bash
curl -s localhost:3000/api/checks -H 'content-type: application/json' -d '{"text":"Od grudnia wraca obowiązkowy pobór do wojska"}'
curl -s localhost:3000/api/checks/<checkId>
```

Krok wyszukiwania ma dwa tryby wybierane zmienną `RESEARCH_MODE`: `agent` (domyślny, pętla modelu z narzędziami) i `plan` (plan zapytań wykonywany przez kod oraz sędzia bez narzędzi). Opis i porównanie: [docs/agent.md](docs/agent.md).

`result.status` to `ok` (werdykty z dowodami), `needs_clarification`, `out_of_scope` albo `error` (awaria techniczna, nigdy werdykt). Typy są w [packages/contracts](packages/contracts/src/index.ts).

Zabezpieczenia: URL-e z tekstu (maksymalnie 2) są pobierane z ochroną SSRF i traktowane jako materiał do oceny, nie dowód. Dane osobowe (e-mail, telefon, PESEL, konto, karta, dowód) są maskowane przed zapisem i przed modelem. `POST` jest limitowany per IP (`RATE_LIMIT_PER_MINUTE`). Wykryte próby prompt injection trafiają do ostrzeżeń i logu `prompt_injection_suspected`.

### Korpus

Korpus to plik SQLite (`data/corpus.db`) budowany od zera ze snapshotu [data/corpus/snapshot.jsonl](data/corpus/snapshot.jsonl): jeden dokument w wierszu, z tytułem, wydawcą, datą publikacji i pobrania, adresem oraz treścią pociętą na fragmenty do 600 znaków.

- `pnpm --filter @prawdowid/sources seed [ścieżka]` sprawdza cały plik i dopiero potem podmienia bazę. Jeden błędny wiersz (brak pola, zła data, `zrodlo_id` spoza [data/sources.ts](data/sources.ts), powtórzony adres) przerywa import i zostawia poprzedni korpus bez zmian. Po imporcie wypisuje liczbę dokumentów i licencję każdego źródła.
- Wyszukiwanie działa na fragmentach (FTS5) i zwraca całe fragmenty, najwyżej dwa z jednego dokumentu. Na tej samej treści kod sprawdza potem cytaty.
- Wersja korpusu (`wersja_korpusu` ze snapshotu) jest widoczna w `GET /health` i zapisywana przy każdym sprawdzeniu, więc wyniki testów da się przypisać do konkretnego korpusu.
- Nowy snapshot: podmień plik i uruchom `seed`. Kluczem dokumentu jest adres URL, bo identyfikatory `doc-…` zmieniają się między snapshotami. Po zmianie schematu bazy stary plik `corpus.db` trzeba zbudować od nowa (API powie to przy starcie).
- `pnpm --filter @prawdowid/sources seed:mock` dopisuje dane demonstracyjne (URL-e `mock://…`, flaga `isMock`). Wdrożenie ich nie ładuje.

### Frontend

Jedna strona w stylu gov.pl: formularz (tekst, link albo zdjęcie), postęp i wynik pod formularzem, bez przechodzenia między widokami. Strona wysyła `POST /api/checks` i odpytuje `GET /api/checks/:checkId`; id sprawdzenia trafia do adresu (`?check=…`), więc wynik można odświeżyć i udostępnić. Adres API ustawia `VITE_API_URL` w głównym `.env` (domyślnie `http://localhost:3000`).

Design system jest w [apps/web/src/ui](apps/web/src/ui), a jego katalog pod adresem `/design` (z przełącznikiem motywu jasny/ciemny):

- `tokens.css`: tokeny z makiet (kolory w obu motywach przez `light-dark()`), a `styles.css` mapuje je na motyw Tailwind (`bg-surface`, `text-ink-muted`, `text-title-1`…) i na nazwy shadcn/ui.
- `base/`: komponenty shadcn/ui (Button, Textarea, Label, Badge, Alert, Separator, Accordion) przestylowane pod gov.pl. Nowe dodaje `pnpm dlx shadcn@latest add <nazwa>` w `apps/web`.
- Obok: komponenty Prawdowid, np. `VerdictBadge`, `ClaimCard`, `SourceCard`, `StrengthMeter`, `Notice`, `Steps`, `SummaryBanner`, `AppHeader`.

Zasady z makiet: werdykt zawsze ma ikonę i słowo; komunikat systemowy (awaria, limit) nigdy nie wygląda jak werdykt; czerwony akcent tylko w nagłówku.

### Kanał WhatsApp

Drugi kanał działa przez oficjalne WhatsApp Cloud API od Meta. Kod jest w [apps/api/src/whatsapp](apps/api/src/whatsapp) i jest tylko adapterem: wiadomość trafia do tej samej kolejki co zgłoszenie z WWW (`JobRunner` → `runVerification()`). To samo zgłoszenie z obu kanałów dostaje jeden wynik (patrz [Spójność kanałów](docs/agent.md#spójność-kanałów-i-powtórzeń)), więc werdykt i dowody są te same. Odpowiedź zaczyna się od werdyktu, podaje z cytatem każdą publikację, na której opiera się werdykt (te same co WWW, kontekst zostaje w pełnym wyniku), i kończy linkiem `WEB_ORIGIN/?check=<id>`, który otwiera ten sam zapisany wynik na stronie.

- Obsługiwane: tekst, link, zdjęcie (z podpisem lub bez). `POMOC` pokazuje instrukcję, `USUŃ` kasuje sprawdzenia wysłane z tego numeru.
- Awaria (brak modelu, pełna kolejka, nieudane pobranie zdjęcia, błąd sprawdzenia) wraca jako komunikat „To nie jest werdykt”.
- Webhook weryfikuje podpis `X-Hub-Signature-256` (App Secret). Limit wiadomości jest per numer (`WHATSAPP_RATE_LIMIT_PER_MINUTE`), nie per IP, bo wszystko przychodzi z serwerów Meta.
- Numer telefonu jest tylko w pamięci procesu (do odesłania odpowiedzi). W bazie i logach go nie ma, logi mają skrót. Restart serwera gubi odpowiedzi na trwające sprawdzenia.

Konfiguracja:

1. developers.facebook.com → nowa aplikacja typu Business z produktem WhatsApp. Z _WhatsApp → API Setup_ weź **Phone Number ID** (wystarczy numer testowy) i dodaj numery odbiorców (numer testowy obsługuje do 5).
2. Stały token: _Business Settings → Users → System users_ → token z uprawnieniami `whatsapp_business_messaging` i `whatsapp_business_management`. Token z _API Setup_ wygasa po 24 h.
3. **App Secret** z _App Settings → Basic_. **Verify token** wymyślasz sam (losowy ciąg).
4. Ustaw zmienne `WHATSAPP_*` (patrz [.env.example](.env.example)) i uruchom API. W logu pojawi się `whatsapp_enabled`.
5. _WhatsApp → Configuration_: Callback URL `https://<adres-api>/webhooks/whatsapp`, Verify token jak w zmiennej, subskrypcja pola `messages`. Lokalnie potrzebny jest publiczny tunel, np. `cloudflared tunnel --url http://localhost:3000`.

Koszt kanału: odpowiedzi na wiadomość od użytkownika mieszczą się w 24-godzinnym oknie obsługi i według cennika Meta są bezpłatne (płatne są tylko szablony wysyłane z inicjatywy firmy, których nie używamy). Użytkownik płaci najwyżej za własną transmisję danych.

## Wdrożenie (Railway)

Dwie usługi z tego samego repo, obie budowane z katalogu głównego (pakiety workspace muszą być widoczne). Ustawienia budowania i startu są w plikach, w Railway każda usługa wskazuje swój plik w _Settings → Config-as-code_:

| Usługa           | Plik konfiguracji        | Co robi                                                                                 |
| ---------------- | ------------------------ | --------------------------------------------------------------------------------------- |
| `@prawdowid/api` | `/apps/api/railway.json` | Build buduje korpus ze snapshotu (`seed`), start `pnpm --filter @prawdowid/api start`   |
| `@prawdowid/web` | `/apps/web/railway.json` | Build Vite, serwowanie przez Caddy z nagłówkami bezpieczeństwa z [Caddyfile](Caddyfile) |

Zmienne ustawia się w Railway, nie w plikach:

- **API:** `OPENROUTER_API_KEY`, `LLM_MODEL`, `RESEARCH_MODE=plan`, `REQUIRE_LLM=true`, `GOOGLE_FACTCHECK_API_KEY`, `WHATSAPP_*` (kanał WhatsApp), `WEB_ORIGIN` (dokładny adres frontendu, z `https://`, bez `/` na końcu), `TRUST_PROXY=true`, `CHECKS_DB_PATH=/data/checks.db` (wolumen pod `/data`; korpus zostaje w obrazie), ceny `LLM_PRICE_*_PER_MTOK`.
- **Web:** `VITE_API_URL` (adres API z `https://`, wbudowywany przy buildzie), `RAILPACK_SPA_OUTPUT_DIR=apps/web/dist`.

API działa w jednej replice: SQLite, kolejka, limity żądań i łączenie identycznych zgłoszeń w toku są w pamięci procesu. Gotowe wyniki do ponownego użycia leżą w `checks.db` na wolumenie, więc przetrwają wdrożenie. Wdrożenie przerywa trwające sprawdzenia (kończą się błędem), więc w czasie testów nie wypychaj zmian na `main`.

## Praca z repo

| Polecenie                           | Co robi                                         |
| ----------------------------------- | ----------------------------------------------- |
| `pnpm check`                        | Wszystko poniżej po kolei; uruchom przed pushem |
| `pnpm format` / `pnpm format:check` | Formatowanie (oxfmt)                            |
| `pnpm lint` / `pnpm lint:fix`       | Lint (oxlint z regułami korzystającymi z typów) |
| `pnpm typecheck`                    | TypeScript w każdym projekcie                   |
| `pnpm test`                         | Testy (`node --test`, pliki `*.test.ts`)        |
| `pnpm build`                        | Build produkcyjny frontendu (`apps/web/dist`)   |

Konfiguracja:

- `tsconfig.base.json` to wspólny, ścisły config. Każdy projekt ma własny `tsconfig.json` z `extends` i dopisuje swoje opcje (np. `apps/web` dodaje DOM i rozwiązywanie modułów dla bundlera). Nie ma kroku budowania: TypeScript tylko sprawdza typy (`noEmit`), a Node uruchamia `.ts` bezpośrednio. Dlatego obowiązuje `erasableSyntaxOnly`: bez `enum` i `namespace`.
- `oxlint.config.ts` to bazowa konfiguracja lintera. Projekt może mieć własny `oxlint.config.ts`, który importuje bazę i ją rozszerza (przykład: `apps/web`).
- `oxfmt.config.ts` formatuje TS, JSON i Markdown.
- Pakiety wewnętrzne eksportują `./src/index.ts` i są importowane prosto ze źródeł, np. `import { ... } from '@prawdowid/contracts'`.
