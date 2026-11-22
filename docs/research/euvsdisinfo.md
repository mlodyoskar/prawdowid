# EUvsDisinfo: jak podłączyć bazę incydentów

Rozpoznanie z 2026-11-22, bez implementacji. Uzupełnia [docs/data-sources.md § 3](../data-sources.md#3-baza-incydentów-euvsdisinfo).

> **Stan wdrożenia (2026-11-22):** wdrożono wariant C (na żywo, narzędzie `search`) w wersji odchudzonej: bez lokalnej kopii, bez dopasowania po URL-u i domenie, bez eksportu CSV/STIX i bez sprawy moderatora. Do serwera idą tylko wydzielone twierdzenia. W trybie `plan` dopasowanie biegnie równolegle z sędzią. Poniżej pierwotne rozpoznanie i pełny projekt.

**Rekomendacja w skrócie.** Pobieramy przypadki (`cases`) z serwera MCP EUvsDisinfo do osobnej, lokalnej bazy incydentów (SQLite FTS5), a nie do korpusu dowodów. Dopasowanie liczy osobny krok bez narzędzi, równolegle do sędziego. Sędzia go nie widzi. Wynik trafia do nowego pola `incidents` w `CheckResponse`, które nigdy nie zmienia werdyktu, dowodów ani siły podstawy. Najpierw trzeba ustalić licencję i zdobyć token (sekcja 6).

## 1. Dostęp

Stan z dokumentacji. Sprawdzone 2026-11-22: `GET https://mcp.euvsd.info/health` odpowiada `{"status":"ok","authRequired":true,"supabaseLogging":true}`, a wywołanie narzędzia bez klucza zwraca 401. Z tokenem nic nie testowaliśmy, bo w `.env` nie ma klucza.

| Kanał                                                                                                                                                                                       | Co daje                                                                                                                                                                                                                  | Uwagi                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Serwer MCP** `https://mcp.euvsd.info/mcp` ([dokumentacja Fibery](https://veedoo.fibery.io/Documentation/Guides/EUvsDisinfo-MCP.-API.-%2807.2025%29-262), wersja z 2026-05-04)             | Narzędzia `cases`, `articles` (stronicowanie `limit` 1–100, `offset`, od najnowszych), `search` (pełnotekstowe po artykułach i przypadkach, `query` ≥ 3 znaki, `date_from`/`date_to`), `narratives` (narracje w okresie) | Streamable HTTP, JSON-RPC 2.0. Wymagany nagłówek `Accept: application/json, text/event-stream`. Klucz przez `Authorization: Bearer`, `X-API-Key` albo `?key=`. Tryb bezstanowy działa bez `initialize`. Błędy: 401/-32001 (klucz), 406 (Accept), 500/-32603 (Elasticsearch, WordPress). |
| **Stary adres** `https://euvsdisinfo-mcp-server.vercel.app/mcp` ([PDF „How to grab all…”](https://euvsdisinfo.eu/public-docs/How_to_grab_all_Articles_and_Cases_from_disinfo.pdf), 2025-07) | Tylko `cases` i `articles`                                                                                                                                                                                               | To jest „masowe pobranie” z data-sources.md: nie ma osobnego zrzutu ani pliku CSV/JSON, jest stronicowanie MCP. Używamy nowego adresu.                                                                                                                                                  |
| **Strona** `euvsdisinfo.eu/report/…`                                                                                                                                                        | Strona HTML przypadku                                                                                                                                                                                                    | Nie scrapujemy, skoro jest API z tokenem.                                                                                                                                                                                                                                               |

Nie używamy `?key=`: klucz idzie w nagłówku `Authorization: Bearer`, żeby nie trafił do logów proxy. `supabaseLogging: true` wskazuje, że serwer zapisuje zapytania. Każde zapytanie wysłane na żywo wychodzi więc do zewnętrznego dostawcy (Vercel/Supabase, miejsce przetwarzania nieznane).

### Schemat przypadku (`cases`)

Z odpowiedzi w PDF (pola w `structuredContent.cases[]`):

| Pole                      | Typ                                                                 | Znaczenie                                                        | Bierzemy                                                                  |
| ------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `id`                      | UUID                                                                | Identyfikator przypadku                                          | tak                                                                       |
| `title`                   | tekst                                                               | Tytuł przypadku (zwykle parafraza dezinformacji)                 | tak                                                                       |
| `claim`                   | tekst                                                               | **Streszczenie dezinformacji** (czyli treść fałszywego przekazu) | tak, jako dane niezaufane                                                 |
| `fact`                    | tekst                                                               | **Odpowiedź / obalenie** (disproof) redakcji EUvsDisinfo         | tak, jako dane niezaufane                                                 |
| `date`                    | Unix (s)                                                            | Data przypadku                                                   | tak                                                                       |
| `keywords[]`              | `{_id, title}`                                                      | Tagi, np. „coronavirus”, „Conspiracy theory”                     | tak                                                                       |
| `countries[]`             | `{_id, title}`                                                      | Kraje, których dotyczy                                           | tak                                                                       |
| `linksToDisinformation[]` | `{url, archiveUrl, snapShotURL, headLine, language{id,name}, type}` | Publikacje, w których pojawił się przekaz                        | tylko `url` (znormalizowany), host i `language`; bez nagłówków i archiwów |
| `url`                     | URL                                                                 | Strona przypadku w euvsdisinfo.eu                                | tak, to link „źródła” dopasowania                                         |

Artykuły (`articles`: `id, title, content, dateGmt, keywords, categories, articleLanguage, thumbnailURL, url`) to analizy redakcji. Na start ich nie bierzemy: są długie, wielojęzyczne i nie opisują pojedynczych twierdzeń.

**Rozmiar.** 19 248 przypadków i 6 691 artykułów (07.2025); strona bazy podaje 19 873 przypadki (2026-11-22). Kopia na Hugging Face (19 202 wiersze) ma 44 MB w Parquet, więc odchudzony JSONL to rząd 40–60 MB. Import to około 200 wywołań po 100 rekordów. Częstotliwość aktualizacji nie jest podana; przypadki przybywają na bieżąco i są zbierane w cotygodniowym „Disinfo Review” (wniosek, nie potwierdzenie). Przypadki są po angielsku; monitoring obejmuje 15 języków, a język publikacji źródłowej jest w `linksToDisinformation[].language`.

**Charakter tekstu.** `claim` (na stronie „Summary”) powtarza fałszywy przekaz jako stwierdzenie, często w cudzysłowie, a `fact` („Response”/„Disproof”) go obala. Oba pola są więc danymi niezaufanymi: `claim` to przykład przekazu, nigdy dowód.

## 2. Licencja i przechowywanie

**Co wiadomo (2026-11-22):**

- euvsdisinfo.eu **nie ma strony z licencją ani warunkami** dla bazy (`/disclaimer/` daje 404; `/about/`, `/data-protection/`, `/disinformation-cases/` milczą o ponownym wykorzystaniu). Brak licencji CC.
- EUvsDisinfo to projekt ESDZ (East StratCom Task Force). [Nota prawna ESDZ](https://www.eeas.europa.eu/eeas/legal-notice_en): „Reuse is authorised, provided the source is acknowledged” (decyzja Komisji z 12.12.2011 o ponownym wykorzystaniu dokumentów, prawdopodobnie 2011/833/UE). Zastrzeżenia: możliwe osobne warunki w notach przy materiałach; nie dotyczy materiałów stron trzecich. **Nie wiadomo, czy nota obejmuje euvsdisinfo.eu**: strona do niej nie linkuje.
- Dostęp do MCP jest „na wniosek” (mailem, z opisem celu). Warunków korzystania z MCP nie opublikowano. To, co obowiązuje nasz token, może być węższe niż nota ESDZ.
- Zastrzeżenie bazy ([about](https://euvsdisinfo.eu/about/)): publikacje EUvsDisinfo „do not represent an official EU position”, a obecność medium w przypadku nie oznacza, że jest ono powiązane z Kremlem. Zgadza się to z naszą zasadą, że wydawca nie przesądza o prawdziwości. Zdanie trzeba pokazać przy dopasowaniu.
- Kopie stron trzecich: [Mendeley](https://data.mendeley.com/datasets/yhdtkszvgp/3) (CC BY 4.0, 14 497 przypadków do 11.2022), [Zenodo](https://zenodo.org/records/10514307) (CC BY 4.0, same metadane i linki), [Hugging Face](https://huggingface.co/datasets/NLP-UniBW/eu_vs_disinfo) (19 202 wiersze, bez licencji). Licencja zbioru nie rozstrzyga praw do treści ESDZ. Te zbiory traktujemy tylko jako zapas do ewaluacji offline, nie jako źródło produkcyjne.

**Co proponujemy:**

- Przechowujemy tylko pola potrzebne do dopasowania (`id, title, claim, fact, date, keywords, countries, url` oraz URL-e i hosty z `linksToDisinformation`). Nie przechowujemy archiwów, zrzutów (`snapShotURL`), nagłówków ani treści publikacji dezinformacyjnych (materiał stron trzecich; zakaz 6 z wymagań).
- **Osobna baza i snapshot** (`data/incidents/snapshot.jsonl` → `data/incidents.db`), nie wiersze w `data/corpus/snapshot.jsonl`. Korpus to dowody; przypadek EUvsDisinfo nie może trafić do `search_corpus` i stać się „dowodem”.
- Snapshot **nie trafia do repo**, dopóki EUvsDisinfo/MSZ nie potwierdzą zgody na kopię. Do tego czasu import robi każdy z własnym tokenem (`pnpm --filter @prawdowid/sources import-incidents`), a `data/incidents*` jest w `.gitignore`.
- Retencja: snapshot zastępowany przy każdym imporcie (bez historii wersji); przypadek usunięty z bazy źródłowej znika przy następnym imporcie. Zapisy sprawdzeń trzymają tylko `id`, tytuł i link dopasowanego przypadku, w retencji `CHECKS_RETENTION_HOURS`.
- Przypisanie w każdym widoku dopasowania: „Źródło: EUvsDisinfo, East StratCom Task Force ESDZ. Baza nie wyraża oficjalnego stanowiska UE.” plus link do przypadku.

Wpis do [data/sources.ts](../../data/sources.ts) (nowa lista `INCIDENT_SOURCES`, obok `FACT_CHECK_SOURCES`):

```ts
const LICENCE_EUVSDISINFO =
  'Brak licencji na stronie euvsdisinfo.eu. Nota prawna ESDZ: ponowne wykorzystanie dozwolone z podaniem źródła ' +
  '(nie obejmuje materiałów stron trzecich). Dostęp do MCP na wniosek; warunki tokenu niepotwierdzone (sprawdzono 2026-11-22).';
```

## 3. Jak używać zgodnie z zasadami wyzwania

Zasady, z których to wynika ([wymagania.md](../challenge/wymagania.md), [CLAUDE.md](../../CLAUDE.md)): dopasowanie do katalogu incydentów to **kontekst lub ostrzeżenie, nigdy werdykt z samej domeny** (funkcje premiowane, scenariusz I). Domena, kanał ani status źródła nie przesądzają o prawdziwości (zakazy 3 i 4). Model nie jest źródłem.

### 3.1. Co pokazujemy, a czego nie

| Sytuacja                                                                     | Co widzi użytkownik                                                                                                                                | Wpływ na werdykt                        |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Twierdzenie pasuje do przypadku (ten sam przekaz)                            | „Podobny przekaz EUvsDisinfo opisało jako dezinformację [data]: „[cytat z `claim`]”. Link do przypadku.”                                           | brak                                    |
| Ten sam temat, inny przekaz                                                  | nic albo zwinięte „Podobne tematy w bazie EUvsDisinfo”                                                                                             | brak                                    |
| URL ze zgłoszenia jest dokładnie na liście `linksToDisinformation` przypadku | „Ten adres EUvsDisinfo wymieniło w przypadku [tytuł, data].”                                                                                       | brak                                    |
| Zgadza się tylko domena                                                      | jedno neutralne zdanie: „Materiały z tej domeny pojawiały się w bazie EUvsDisinfo (N przypadków). To nie przesądza o prawdziwości tej informacji.” | brak                                    |
| Baza niedostępna / brak klucza                                               | ostrzeżenie „Nie sprawdziliśmy bazy incydentów EUvsDisinfo: [powód]”, `searched` bez EUvsDisinfo                                                   | brak; to nie jest `sources_unavailable` |

Werdykt dalej opiera się tylko na korpusie i fact-checkach. Gdy ich brak, zostaje `brak wystarczających dowodów`, nawet jeśli przypadek EUvsDisinfo pasuje. Odpowiedź może wtedy powiedzieć: „Nie znaleźliśmy dowodów rozstrzygających. Podobny przekaz był już opisywany jako dezinformacja”. Status sankcji UE nie jest w danych EUvsDisinfo; byłby osobnym źródłem i osobnym neutralnym ostrzeżeniem (poza tym zakresem).

**Dlaczego nie jako dowód `refutes`:** pole `fact` to ocena redakcji EUvsDisinfo, często ogólna („no evidence”, „recurring narrative”). Dopasowanie jest przybliżone, a przypadek bywa sprzed lat. Gdyby przypadek był dowodem, werdykt `fałszywe` wynikałby z obecności w katalogu, a tego zabraniają wymagania. Ewentualne użycie `fact` jako dowodu wtórnego (jak fact-check) to osobna decyzja na później; wymagałaby relacji `direct` i niezależnego potwierdzenia.

### 3.2. Metoda dopasowania

| Wariant                                                                                                          | Plusy                                                                                                            | Minusy                                                                                                                                                                    | Decyzja                                                             |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **A. Lokalna FTS5 po `title`+`claim`+`keywords`** (tokenizer `porter unicode61`), zapytanie po angielsku z planu | Deterministyczne, szybkie (ms), offline, jury uruchomi bez klucza (snapshot), zapytanie nie wychodzi na zewnątrz | Polskie zgłoszenie vs angielskie przypadki: potrzebne angielskie zapytanie od modelu planującego                                                                          | **na start**                                                        |
| B. Embeddingi wielojęzyczne (np. `multilingual-e5`)                                                              | Lepsze dopasowanie parafraz PL↔EN                                                                                | Model embeddingów do hostowania lub dostawca; 19 tys. wektorów (~30 MB int8); więcej zależności                                                                           | za tym samym interfejsem, gdy ewaluacja pokaże, że A gubi parafrazy |
| C. Na żywo: narzędzie MCP `search`                                                                               | Zawsze aktualne, zero importu                                                                                    | Zapytanie wychodzi do zewnętrznego serwera z logowaniem; nieznany limit i opóźnienie; wynik zależy od cudzego Elasticsearch, więc trudniej o powtarzalność (scenariusz G) | tylko jako zapas, gdy nie wolno przechowywać danych                 |

Kroki w trybie `plan`:

1. **Plan.** Model planujący już formułuje zapytania dla twierdzenia. Dostaje trzecie narzędzie `search_incidents` z zapytaniem **po angielsku** (jak `languageCode: 'en'` przy fact-checkach). Kod wykonuje je razem z innymi, równolegle.
2. **Kandydaci.** Do 5 przypadków z FTS5. Do tego kod, bez modelu, porównuje znormalizowane URL-e ze zgłoszenia z `linksToDisinformation.url` (pełny URL, a osobno sam host).
3. **Dopasowanie.** Osobne wywołanie modelu bez narzędzi, **równolegle do sędziego** (bez dodatkowego czasu w typowym przypadku). Dostaje tylko twierdzenie i kandydatów, bez dowodów z korpusu. Zwraca dla każdego kandydata relację `same_claim` / `same_topic` / `unrelated` i dosłowny cytat z `claim`. Kod sprawdza cytat tą samą funkcją co dla dowodów ([plan/quote.ts](../../packages/agent/src/plan/quote.ts)) i pokazuje tylko `same_claim` z poprawnym cytatem.
4. **Izolacja.** Przypadki mają osobną przestrzeń id (`inc_…`), nie trafiają do `EvidenceRegistry`, `evidenceIds` ani `evidenceUse`. Guardrails odrzucają odwołanie sędziego do `inc_…` (sędzia ich i tak nie widzi). Test: ten sam werdykt i dowody z włączoną i wyłączoną bazą incydentów.

W trybie `agent` na start bez zmian: dopasowanie uruchamia kod po pętli modelu, na wydzielonych twierdzeniach. Jedno miejsce logiki (`matchIncidents()` w `packages/agent`) wołane z obu trybów, więc WWW i WhatsApp dają to samo.

### 3.3. Kontrakt

W [packages/contracts](../../packages/contracts/src/index.ts):

```ts
export const IncidentMatch = z.object({
  id: z.string(),              // inc_<uuid>
  claimIndex: z.number(),      // którego twierdzenia dotyczy
  basis: z.enum(['claim', 'url', 'domain']),
  title: z.string(),
  publisher: z.literal('EUvsDisinfo (EEAS East StratCom Task Force)'),
  url: z.string(),             // strona przypadku
  date: z.string(),            // data przypadku
  quote: z.string().optional(),// zweryfikowany fragment `claim`
  fetchedAt: z.string(),       // data snapshotu
});
// w wariancie 'ok' CheckResponse:
incidents: z.array(IncidentMatch).optional(),
```

Pole jest opcjonalne, więc stare wyniki, eksport i ewaluacje działają bez zmian. Nie dodajemy `kind: 'incident'` do `EvidenceKind`: dowód i kontekst muszą być rozdzielone typem, a nie konwencją.

### 3.4. Pokazanie w kanałach

- **WWW** ([check-result.tsx](../../apps/web/src/app/check-result.tsx)): osobna sekcja pod dowodami, „Znane przekazy dezinformacyjne (kontekst, nie dowód)”, neutralny kolor (nie kolor werdyktu). Każda pozycja: tytuł, data, cytat, link do euvsdisinfo.eu i stała adnotacja „Dopasowanie nie zmienia oceny”. Linków do samych publikacji dezinformacyjnych nie pokazujemy (nie kierujemy ruchu do nich).
- **WhatsApp** ([whatsapp/format.ts](../../apps/api/src/whatsapp/format.ts)): jedna linia po werdykcie i dowodach, przed „Zwróć uwagę”: „Podobny przekaz opisało EUvsDisinfo (2023-04-12): [link]”. Najwyżej 1 pozycja.
- **Eksport** ([export.ts](../../apps/web/src/lib/export.ts)): JSON z polem `incidents`; CSV osobne wiersze typu `incydent`; STIX: `note` albo `external_reference` z `source_name: "EUvsDisinfo"` i `external_id` przypadku przy obiekcie twierdzenia (bez technik DISARM, jak dotąd).
- **Sprawy moderatora** ([cases.ts](../../apps/api/src/cases.ts)): dopasowanie `same_claim` przy werdykcie nierozstrzygającym może być dodatkowym powodem `review_recommended` (nowy `EscalationReason` `known_incident`). Tylko oznaczenie, bez komunikatu o przekazaniu.

### 3.5. Awaria i prompt injection

- **Awaria.** Lokalna baza: brak pliku albo pusta tabela → ostrzeżenie „Baza incydentów EUvsDisinfo nie jest wczytana”, reszta bez zmian. Na żywo (wariant C): `missing_key` / `rate_limited` / `unavailable` jak w [types.ts](../../packages/sources/src/types.ts) (`SourceResult`). Awaria incydentów **nigdy** nie daje `sources_unavailable` ani nie zmienia werdyktu; trafia do `warnings` i do metryk (`toolCalls`, `sourceFailures`).
- **Prompt injection.** `claim` i `fact` streszczają wrogie przekazy, więc mogą zawierać dowolny tekst. Przy imporcie i przy każdym użyciu przechodzą przez `detectInjection()` ([injection.ts](../../packages/agent/src/injection.ts)); trafienie wyklucza kandydata i loguje `prompt_injection_suspected` ze źródłem `incident:<id>`. Model dopasowujący nie ma narzędzi, ma schemat wyjścia i flagę „materiał zawiera polecenia” jak sędzia. Treść przypadków nie trafia do promptu planującego.
- **Prywatność.** Lokalnie do EUvsDisinfo nic nie wysyłamy. Na żywo wysyłamy tylko zapytanie wygenerowane przez model z zamaskowanego tekstu (jak dziś do Google), nigdy surowe zgłoszenie.

## 4. Ewaluacja (scenariusz I)

Dziś I1–I3 w [evals/cases.jsonl](../../evals/cases.jsonl) sprawdzają tylko dopasowanie URL-a do dokumentu korpusu. Dodajemy pole `incident` w oczekiwaniu (`{ id?, basis?, expect: 'match' | 'none' }`) i liczenie w [score.mjs](../../evals/score.mjs): trafność dopasowania, odsetek fałszywych dopasowań, **niezmienność werdyktu** (ten sam werdykt z bazą i bez).

Propozycja przypadków (~8, połowa `heldOut`):

| Id  | Wejście                                                                                           | Oczekiwane                                                                 |
| --- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| I4  | Polska parafraza przekazu z przypadku EUvsDisinfo, którego nie ma w korpusie                      | `incident: match`, werdykt `brak wystarczających dowodów` (nie `fałszywe`) |
| I5  | Jak I4, ale korpus/fact-check obala twierdzenie                                                   | werdykt `fałszywe` z dowodu korpusu, `incident: match` obok                |
| I6  | Ten sam temat (np. „biolaboratoria”), inne twierdzenie                                            | `incident: none` (tylko `same_topic`)                                      |
| I7  | URL dokładnie z `linksToDisinformation` przypadku                                                 | `basis: url`                                                               |
| I8  | URL z tej samej domeny, inna, prawdziwa treść                                                     | tylko neutralna informacja o domenie, werdykt z korpusu, bez `match`       |
| I9  | Prawdziwy komunikat MON/MSZ, który brzmi jak narracja                                             | `incident: none`, werdykt `potwierdzone`                                   |
| J+  | I4 z wymuszonym brakiem bazy                                                                      | ostrzeżenie o niesprawdzonej bazie incydentów, werdykt bez zmian           |
| E+  | Przypadek z wstrzykniętym poleceniem w `claim` (tylko w teście jednostkowym, dane w samym teście) | kandydat odrzucony, zdarzenie zalogowane                                   |

**Bez wycieku testów:**

- Przypadki EUvsDisinfo do testów wybieramy po `id` z prawdziwego snapshotu, a tekst zgłoszenia piszemy jako własną polską parafrazę. Nie kopiujemy `claim` do zgłoszenia.
- Nie dopisujemy synonimów, reguł ani przykładów do promptu i tokenizera pod te przypadki. Teksty z `cases.jsonl` i `zadania.md` nie trafiają do promptów (zasada z CLAUDE.md).
- Odłożone przypadki (`heldOut`) bierzemy z innych tematów niż rozwojowe (np. rozwojowe: COVID, odłożone: Ukraina/energia), żeby strojenie zapytań na jednych nie poprawiało drugich.
- Snapshot ma datę; ewaluacje przypinamy do wersji snapshotu, jak korpus. Wariant na żywo nagrywamy jak fact-checki ([evals/fixtures](../../evals/fixtures/)).
- Fałszywe dane przypadków (np. z injection) żyją tylko w testach jednostkowych, nie w pliku danych.

## 5. Pliki do zmiany

| Plik                                                                                                                                                                                                                                                       | Zmiana                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/sources/src/euvsdisinfo.ts` (nowy)                                                                                                                                                                                                               | Klient MCP (bezstanowy `tools/call`, nagłówki, parsowanie SSE/JSON, mapowanie błędów na `SourceFailureReason`), pobieranie stron `cases`  |
| `packages/sources/src/incidents.ts` (nowy)                                                                                                                                                                                                                 | Schemat SQLite (`incidents`, `incident_links`, `incidents_fts`), `searchIncidents()`, `matchUrl()`                                        |
| `packages/sources/scripts/import-incidents.ts` (nowy) + skrypt w `package.json`                                                                                                                                                                            | Pobranie → `data/incidents/snapshot.jsonl` → baza; walidacja zod całego pliku jak w [snapshot.ts](../../packages/sources/src/snapshot.ts) |
| [packages/sources/src/index.ts](../../packages/sources/src/index.ts)                                                                                                                                                                                       | Eksporty                                                                                                                                  |
| [packages/contracts/src/index.ts](../../packages/contracts/src/index.ts)                                                                                                                                                                                   | `IncidentMatch`, `incidents` w `CheckResponse`, ewentualnie `EscalationReason.known_incident`                                             |
| [packages/agent/src/tools.ts](../../packages/agent/src/tools.ts)                                                                                                                                                                                           | `AgentSources.incidents?`, `ToolName` += `search_incidents`                                                                               |
| `packages/agent/src/incidents.ts` (nowy)                                                                                                                                                                                                                   | `matchIncidents()`: kandydaci, model dopasowujący, weryfikacja cytatu, injection                                                          |
| [packages/agent/src/plan/prompts.ts](../../packages/agent/src/plan/prompts.ts), [plan/schemas.ts](../../packages/agent/src/plan/schemas.ts)                                                                                                                | Angielskie zapytanie do bazy incydentów w planie; prompt i schemat modelu dopasowującego                                                  |
| [packages/agent/src/verify-planned.ts](../../packages/agent/src/verify-planned.ts), [verify.ts](../../packages/agent/src/verify.ts)                                                                                                                        | Wywołanie równolegle do sędziego, `incidents` w wyniku, ostrzeżenia, `searched`                                                           |
| [apps/api/src/env.ts](../../apps/api/src/env.ts), [index.ts](../../apps/api/src/index.ts)                                                                                                                                                                  | `INCIDENTS_DB_PATH`, `EUVSDISINFO_MCP_URL`, `INCIDENTS_MODE=local                                                                         | live | off`; `/health` pokazuje stan bazy |
| [apps/api/src/cases.ts](../../apps/api/src/cases.ts)                                                                                                                                                                                                       | Opcjonalnie powód `known_incident`                                                                                                        |
| [apps/api/src/whatsapp/format.ts](../../apps/api/src/whatsapp/format.ts), [apps/web/src/app/check-result.tsx](../../apps/web/src/app/check-result.tsx), nowy komponent w `apps/web/src/ui`, [apps/web/src/lib/export.ts](../../apps/web/src/lib/export.ts) | Wyświetlanie i eksport                                                                                                                    |
| [data/sources.ts](../../data/sources.ts)                                                                                                                                                                                                                   | `INCIDENT_SOURCES` z `licence`, `strategy: 'json-api'`, endpointem MCP i notatką (tylko jedno miejsce listy źródeł)                       |
| [.env.example](../../.env.example)                                                                                                                                                                                                                         | Nowe zmienne                                                                                                                              |
| [evals/cases.jsonl](../../evals/cases.jsonl), [evals/score.mjs](../../evals/score.mjs), [evals/run.mjs](../../evals/run.mjs)                                                                                                                               | Przypadki I4–I9, metryki dopasowania i niezmienności                                                                                      |
| [docs/data-sources.md](../data-sources.md), [docs/agent.md](../agent.md), [README.md](../../README.md), [docs/open-questions.md](../open-questions.md)                                                                                                     | Opis źródła, licencji, kroku dopasowania; usunięcie prywatnych `sharing-key` z linków przed oddaniem                                      |
| Testy: `*.test.ts` obok każdego nowego modułu                                                                                                                                                                                                              | Awaria MCP → ostrzeżenie, nie werdykt; injection w przypadku; niezmienność werdyktu; brak `inc_` w dowodach                               |

## 6. Nakład i otwarte pytania

**Nakład** (jedna osoba z Claude Code, po uzyskaniu tokenu): klient MCP + import + baza FTS ~0,5 dnia; kontrakt, `matchIncidents()` w obu trybach i testy ~1 dzień; WWW, WhatsApp, eksport ~0,5 dnia; ewaluacje i dokumentacja ~0,5 dnia. Razem około 2,5 dnia. Embeddingi (wariant B) to dodatkowe ~1 dzień, tylko jeśli ewaluacja tego wymaga.

**Otwarte pytania:**

1. **Licencja danych z API i zgoda na lokalną kopię** (sekcja 2). Pytanie do EUvsDisinfo / mentorów MSZ: czy wolno przechowywać przypadki (`title`, `claim`, `fact`, linki) w lokalnej bazie i dołączyć snapshot do repo oddawanego MSZ, w jakiej retencji i z jakim przypisaniem.
2. **Token.** Czy mamy już klucz od mentorów MSZ? Czy jury dostanie własny? Bez klucza działa tylko snapshot (jeśli wolno go dołączyć).
3. **Limity API** i dopuszczalna liczba zapytań na import (≈200) i na żywo; czy logowanie zapytań po stronie serwera (Supabase) jest akceptowalne dla zapytań obywateli.
4. **Aktualizacja.** Jak często baza przybywa i czy API pozwala pobrać tylko zmiany (dziś: od najnowszych, więc import przyrostowy do pierwszego znanego `id`).
5. **Polskie wersje przypadków.** Czy API ma tłumaczenia `claim`/`fact` (strona ma wersje językowe); jeśli tak, FTS po polsku bez tłumaczenia zapytania.
6. **Pozycja MSZ:** czy wolno pokazywać obywatelowi link do przypadku EUvsDisinfo z adnotacją, że baza nie wyraża oficjalnego stanowiska UE.
