# Agent weryfikujący: projekt

Co agent robi po tym, jak API przyjmie zgłoszenie. Ustalenia z 2026-11-21. Odłożone tematy są w [todo.md](../todo.md).

## Decyzje

| Temat                      | Decyzja                                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Charakter usługi           | Jedno zgłoszenie, jeden wynik w JSON. To nie czat: agent nie dopytuje, a stany „doprecyzuj”, „poza zakresem” i „awaria” wracają jako `status`, osobno od werdyktu.         |
| Sposób działania           | Zadanie asynchroniczne: `POST` zwraca `checkId`, wynik odbiera się osobno.                                                                                                 |
| Krok wyszukiwania          | Dwa tryby za jednym przełącznikiem (`RESEARCH_MODE`): `plan` i `agent`. Który zostaje, rozstrzygają ewaluacje.                                                             |
| Gdzie agent szuka          | Korpus, źródła `live` z [data/sources.ts](../data/sources.ts), Google Fact Check API i strona z URL-a użytkownika. Bez wyszukiwarki i bez pobierania stron spoza katalogu. |
| URL w zgłoszeniu           | Treść strony wyciąga kod, bez modelu. Strona jest materiałem do oceny, nigdy dowodem dla samej siebie.                                                                     |
| Fact-checki a nasze źródła | Jeden zbiór dowodów i jeden sędzia. Fact-check to dowód typu wtórnego obok dokumentów urzędowych. Korzystamy z pól API (ocena, tytuł, link), artykułu nie pobieramy.       |
| Werdykt                    | Proponuje go model-sędzia bez narzędzi. Kod sprawdza cytaty i zgodność werdyktu z dowodami, w razie braku podstawy degraduje werdykt.                                      |
| Siła podstawy              | Liczy ją kod z policzalnych faktów o dowodach. Model jej nie ocenia.                                                                                                       |
| Awaria źródła              | Werdykt z tego, co zadziałało, plus informacja, czego nie sprawdzono. Brak dowodów przy awarii źródła to „nie udało się sprawdzić”, a nie „brak wystarczających dowodów”.  |
| Prompt injection           | Treść źródeł trafia tylko do modelu bez narzędzi. Wykrywanie: wzorce w kodzie oraz flaga od sędziego. Każde zdarzenie trafia do logu i do ostrzeżeń w wyniku.              |
| Obrazy                     | Model multimodalny odczytuje widoczny tekst i datę. Obraz sprawdzamy też w wyszukiwaniu obrazem Google Fact Check (`claims:imageSearch`). Bez wykrywania treści AI.        |
| Wyszukiwanie w korpusie    | Na start pełnotekstowe (SQLite FTS5). Embeddingi później, za tym samym interfejsem narzędzia.                                                                              |
| Modele                     | Vercel AI SDK, dostawca przez OpenRouter (API zgodne z OpenAI). Model wybieramy w konfiguracji, osobno da się ustawić model sędziego.                                      |
| Zapis i metryki            | Tabela `checks` jako źródło prawdy o przebiegu sprawdzenia. Śledzenie wywołań modelu w Langfuse.                                                                           |
| Liczba twierdzeń           | Parametr (`maxClaims`, domyślnie 3). Dobieramy go na danych deweloperskich pod jakość, czas i koszt.                                                                       |
| Zestaw testowy             | Co najmniej 30 przypadków w JSONL, pisanych na podstawie korpusu i prawdziwych fact-checków, dla scenariuszy A–J.                                                          |

## Dwa tryby

Oba tryby mają tę samą sygnaturę (`CheckRequest` → `CheckResponse`), te same źródła, to samo maskowanie danych osobowych i ten sam format wyniku.

### `agent` (istnieje: `verify()`)

Jedna pętla modelu z narzędziami `search_factchecks` i `search_corpus`, do 5 kroków. Ten sam model wydziela twierdzenia, szuka i ocenia. Kod po fakcie usuwa odwołania do nieistniejących dowodów i degraduje werdykt bez dowodu.

### `plan` (nowy: `verifyPlanned()`)

```
zgłoszenie
  → maskowanie danych osobowych, pobranie strony z URL-a        (kod)
  → twierdzenia + plan zapytań dla każdego                      (model, 1 wywołanie)
  → wszystkie zapytania naraz                                   (kod, równolegle)
  → sędzia dla każdego twierdzenia, bez narzędzi                (model, równolegle)
  → opcjonalnie doczytanie dokumentu, który dotyczy twierdzenia
    wprost, ale go nie rozstrzygnął, i ponowna ocena            (kod + model)
  → opcjonalnie 1 runda poprawy zapytań, gdy nic nie dotyczy
    twierdzenia wprost i jest zapas czasu                       (model + kod)
  → cytaty, zgodność werdyktu z dowodami, siła podstawy, status (kod)
  → wynik
```

Dwa wywołania modelu jedno po drugim w typowym przypadku, trzy przy doczytaniu, cztery przy rundzie poprawy.

**Wybór dowodów w trybie plan.** Kod zbiera do sześciu trafień z każdego zapytania. Przy wyborze 12 fragmentów na twierdzenie pierwszeństwo mają wyniki Google Fact Check. Pozostałe miejsca zajmują fragmenty korpusu. W rundzie poprawy nowy fact-check może wyprzeć fragment korpusu. Sędzia sprawdza, czy dana publikacja dotyczy tego samego twierdzenia.

**Doczytanie dokumentu.** Wyszukiwanie zwraca najwyżej dwa fragmenty z dokumentu, a o tym, które, decyduje dopasowanie słów, nie to, gdzie jest odpowiedź. Gdy sędzia uzna dokument za dotyczący twierdzenia wprost, ale nie znajdzie w nim rozstrzygnięcia, kod dociąga pozostałe fragmenty (do 12 z najwyżej 2 dokumentów) i sędzia ocenia jeszcze raz, już tylko na tych dokumentach. Jeśli druga ocena też nie rozstrzyga, zostaje pierwsza. Doczytanie startuje tylko przed upływem 16 s od początku sprawdzenia (`deepenBudgetMs`).

### Czym się różnią

|                                | `plan`                                               | `agent`                                          |
| ------------------------------ | ---------------------------------------------------- | ------------------------------------------------ |
| Czas                           | Stała liczba wywołań, wyszukiwania równolegle        | Rośnie z liczbą kroków                           |
| Powtarzalność                  | Ta sama ścieżka przy każdym uruchomieniu             | Ścieżka zależy od decyzji modelu                 |
| Treść źródeł a narzędzia       | Sędzia czyta źródła, ale nie ma narzędzi             | Model z narzędziami czyta źródła                 |
| Awaria źródła                  | Kod zna status każdego zapytania i sam ustawia wynik | Model musi ją wiernie zrelacjonować              |
| Nietrafione pierwsze zapytania | Jedna runda poprawy                                  | Przeformułowuje do skutku (w limicie kroków)     |
| Główne ryzyko                  | Błędne wstrzymanie się, gdy dowód istnieje           | Przekroczenie 30 s i inny wynik przy powtórzeniu |

### Jak wybierzemy

Ten sam zestaw testowy na obu trybach. Porównujemy: macro-F1 werdyktów, odsetek poprawnych wstrzymań, poprawność cytatów, medianę czasu, zgodność wyniku przy trzykrotnym powtórzeniu, koszt 100 sprawdzeń. Docelowo domyślnym trybem ma być `plan`, chyba że `agent` wyraźnie wygra na macro-F1 i zmieści się w czasie oraz w powtarzalności. Do czasu ewaluacji domyślny w kodzie jest `agent` (`RESEARCH_MODE` w `apps/api/src/env.ts`).

## Sędzia i reguły w kodzie (tryb `plan`)

Sędzia dostaje jedno twierdzenie i listę dowodów. Dla każdego dowodu zwraca:

- **relację** do twierdzenia: `direct` (dotyczy wprost tego twierdzenia; dla fact-checka: sprawdzał to samo twierdzenie), `related` (ten sam temat) albo `unrelated`,
- **rolę**: `supports`, `refutes` albo `context`,
- **cytat**: dosłowny fragment materiału,
- flagę, że materiał zawiera polecenia skierowane do systemu.

Do tego proponuje werdykt, krótkie uzasadnienie i listę tego, czego nie udało się ustalić.

Kod stosuje reguły w tej kolejności:

1. Odrzuca dowody o nieznanym id, oznaczone `unrelated`, zawierające polecenia dla systemu oraz te, których cytatu nie ma w materiale (porównanie po normalizacji białych znaków, wielkości liter i cudzysłowów; cytat ma co najmniej 12 znaków albo jest oceną fact-checkera).
2. `potwierdzone` wymaga co najmniej jednego dowodu `direct` + `supports`. `fałszywe` wymaga `direct` + `refutes`. `wprowadzające w błąd` wymaga dowodu `direct`. Gdy warunek nie jest spełniony, werdykt staje się `brak wystarczających dowodów`.
3. Gdy ocalałe dowody `direct` wskazują w obie strony, wynik dostaje znacznik rozbieżności, a siła podstawy spada do `niska`.
4. Gdy werdykt to `brak wystarczających dowodów`, a któreś źródło było niedostępne, twierdzenie trafia do listy `unchecked` z powodem. Jeśli nie zostało żadne ocenione twierdzenie, całe sprawdzenie kończy się statusem `error` z kodem `sources_unavailable`.
5. Twierdzenie, które model przy wydzielaniu uznał za opinię lub prognozę, dostaje `nie podlega weryfikacji` bez wyszukiwania.
6. Jeden dokument korpusu może dać kilka fragmentów. Do wyniku trafiają fragmenty, które potwierdzają lub przeczą, a z dokumentu bez takich fragmentów: jeden fragment kontekstu.

### Siła podstawy

Liczona z dowodów `direct`, które wspierają werdykt. Każda przesłanka trafia do wyniku jako zdanie (`confidenceReasons`). Wiek materiału liczymy od daty publikacji, a gdy jej nie ma (strony informacyjne), od daty pobrania.

| Poziom    | Warunek                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------- |
| `wysoka`  | Co najmniej 2 niezależnych wydawców, w tym źródło pierwotne, najnowszy materiał nie starszy niż rok |
| `średnia` | Źródło pierwotne albo co najmniej 2 niezależnych wydawców, najnowszy materiał nie starszy niż rok   |
| `niska`   | Pozostałe przypadki, każda rozbieżność między źródłami oraz werdykty nierozstrzygające              |

## Format wyniku

Typy są w [packages/contracts](../packages/contracts/src/index.ts). Pola dodane dla trybu `plan` są opcjonalne, więc wynik trybu `agent` pozostaje poprawny.

| Pole                         | Znaczenie                                                                           | Makieta                      |
| ---------------------------- | ----------------------------------------------------------------------------------- | ---------------------------- |
| `claims[].evidenceUse`       | Dla każdego dowodu: rola (`supports` / `refutes` / `context`) i zweryfikowany cytat | „Przeczy twierdzeniu”, cytat |
| `claims[].confidence`        | Siła podstawy                                                                       | „Siła podstawy odpowiedzi”   |
| `claims[].confidenceReasons` | Przesłanki siły podstawy                                                            | Punkty pod siłą podstawy     |
| `claims[].unknowns`          | Czego nie udało się ustalić                                                         | „Czego nie ustaliliśmy”      |
| `claims[].discrepancy`       | Źródła podają rozbieżne informacje                                                  | brak ekranu                  |
| `unchecked`                  | Twierdzenia niesprawdzone z powodów technicznych                                    | „Awaria – to nie werdykt”    |
| `searched`                   | Źródła, w których faktycznie szukano                                                | „Gdzie sprawdziliśmy”        |
| `mode`                       | Tryb, który wyprodukował wynik                                                      | brak (do ewaluacji)          |

| `reusedFrom` | Wynik skopiowany z wcześniejszego sprawdzenia tego samego zgłoszenia (czas tamtego) | „Zapis sprawdzenia” |

## Spójność kanałów i powtórzeń

Wymóg: to samo zgłoszenie daje ten sam werdykt i te same dowody w WWW i WhatsApp oraz przy powtórzeniu. Pomiar (opis w [docs/evaluation.md](evaluation.md#spójność-kanałów-i-powtórzeń)) pokazał, że kanał nie zmienia wejścia: model dostaje z obu ten sam tekst. Rozrzut bierze się z planu zapytań, który model formułuje za każdym razem trochę inaczej, także przy temperaturze 0. Inne zapytania dają inne fragmenty korpusu, a sędzia inny materiał. Dlatego:

- **Jeden wynik na zgłoszenie** ([apps/api/src/reuse.ts](../apps/api/src/reuse.ts), `JobRunner`). Klucz to skrót zamaskowanego tekstu po normalizacji (NFC, małe litery, zwinięte białe znaki), skrót bajtów obrazu oraz konfiguracji: tryb, model, sędzia, temperatura, wersja korpusu. Przez `CHECK_REUSE_HOURS` (domyślnie 24 h) to samo zgłoszenie dostaje kopię wyniku z własnym numerem i polem `reusedFrom`. Zgłoszenie wysłane w trakcie trwającego sprawdzenia do niego dołącza. Kopiujemy tylko pełne wyniki `ok`: bez awarii źródeł, niesprawdzonych tez, nieodczytanych stron i przerwanego doczytania. Po błędzie każde czekające zgłoszenie jest sprawdzane samodzielnie. Kopia żyje w tabeli `checks`, więc znika z retencją albo po usunięciu sesji. Numeru pierwotnego sprawdzenia nie ujawniamy.
- **Temperatura 0** domyślnie (`LLM_TEMPERATURE`). Zmniejsza rozrzut przy pierwszym sprawdzeniu i parafrazach, ale go nie usuwa.
- **Kolejność dowodów:** najpierw materiały wspierające albo obalające, potem kontekst. WhatsApp pokazuje wszystkie publikacje-podstawy (do trzech na tezę), te same co WWW.

Granice: parafraza to inne zgłoszenie i może dostać inny wynik. Zdjęcie wysłane przez WhatsApp jest przekompresowane przez Meta, więc ma inne bajty niż ten sam plik wgrany na stronę: dla zrzutów ekranu spójność między kanałami nie jest gwarantowana. Utrwalony zostaje także błędny werdykt, najdłużej na czas ważności. Łączenie zgłoszeń w toku działa w jednym procesie, czyli przy jednej replice API.

## Pierwszy test na żywo (2026-11-21)

13 zapytań (część powtarzana trzykrotnie) na ówczesnym korpusie testowym (sprzed importu prawdziwego snapshotu, dziś usuniętym) i prawdziwym Google Fact Check, przez OpenRouter. To nie jest jeszcze ewaluacja: przypadków było za mało, a korpus był testowy.

| Konfiguracja                                | Mediana czasu | Najdłużej | Tokeny (17 sprawdzeń) |
| ------------------------------------------- | ------------- | --------- | --------------------- |
| `plan`, `anthropic/claude-haiku-5.5`        | 10,7 s        | 19,3 s    | 161 tys.              |
| `agent`, `anthropic/claude-haiku-5.5`       | 8,6 s         | 14,7 s    | 165 tys.              |
| `plan`, `openai/gpt-6-luna`                 | 12,7 s        | 23,2 s    | 91 tys.               |
| `plan`, `deepseek/deepseek-v4.1-flash-1017` | 13,1 s        | 35,8 s    | 112 tys.              |

Wiersze `agent`, luna i deepseek pochodzą z przebiegu sprzed poprawek trybu `plan` opisanych niżej.

Co pokazał test:

- **Awaria źródła (J):** bez klucza Fact Check zapytania bez dowodów kończą się `sources_unavailable`, a nie werdyktem. Zapytanie z dowodem w korpusie zachowuje werdykt z adnotacją.
- **Instrukcja w źródle (E):** w pierwszym przebiegu materiał z poleceniem dla modelu trafił do wyniku jako dowód „potwierdzający” i obniżył siłę podstawy, a w kolejnym skłonił sędziego do wstrzymania się. Teraz materiał złapany wzorcem w ogóle nie trafia do sędziego, a po fladze sędziego ocena jest powtarzana bez niego.
- **Rozbieżność (C):** tryb `plan` zwraca `brak wystarczających dowodów` ze znacznikiem rozbieżności i obiema wartościami. Tryb `agent` uznał twierdzenie za potwierdzone i dopisał wyjaśnienie różnicy, którego nie ma w materiałach.
- **Powtarzalność:** werdykt był identyczny we wszystkich powtórzeniach w obu trybach. Zestaw cytowanych materiałów kontekstowych różnił się między powtórzeniami (patrz [todo.md](../todo.md)).
- **Modele:** haiku prosi o doprecyzowanie najrzadziej i najlepiej opisuje, czego nie ustalono. Luna zużywa najmniej tokenów, ale raz poprosiła o doprecyzowanie bez potrzeby. Deepseek dzieli jedno pytanie na dwa twierdzenia i ma najdłuższy ogon czasu.
- **Znane słabości:** przy werdykcie opartym na fact-checku cytatem bywa sama ocena („Fałsz”), bo API nie zwraca treści artykułu. Werdykt `wprowadzające w błąd` kod przepuszcza przy dowolnym materiale dotyczącym twierdzenia wprost. Pytanie o różnicę 700 i 650 mln zł (scenariusz C z zadań) nie ma odpowiedzi, bo kwoty 650 mln nie ma w danych z API.

## Stan

Gotowe:

- API, kolejka zadań, zapis przebiegu, maskowanie danych osobowych, pobieranie URL-i, korpus FTS, klient Fact Check, tryb `agent`.
- Tryb `plan`: wydzielanie twierdzeń z planem zapytań, równoległe wyszukiwanie, sędzia bez narzędzi, reguły w kodzie, siła podstawy, runda poprawy. Sprawdzony na prawdziwych modelach (wyżej).
- Prawdziwy korpus: import snapshotu JSONL z walidacją, wyszukiwanie po fragmentach i całe fragmenty (do 600 znaków) jako materiał dla sędziego i podstawa cytatów. Jeden dokument może dać dwa materiały (różne fragmenty, ten sam adres). Opis: [README](../README.md#korpus).

Do zrobienia, w kolejności:

1. **Zestaw testowy i runner ewaluacji**: JSONL z przypadkami, uruchomienie obu trybów, tabela mierników.
2. **Drugi typ źródeł w korpusie**: artykuły fact-checkingowe z treścią (pola `twierdzenie`, `ocena_zrodla` w snapshocie są jeszcze puste). Import przyjmuje już `klasa_zrodla: wtorne` i ocenę.
3. **Źródła `live`** (IMGW, RSO, Odyseusz) jako kolejne narzędzia wyszukiwania.
4. **Obrazy w Fact Check** (`claims:imageSearch`). Wymaga publicznego, krótkotrwałego adresu obrazu.
5. **Etapy zadania dla ekranu „Sprawdzamy”.** Tryb `plan` zgłasza etapy przez `onStage`, ale API ich jeszcze nie zapisuje.
6. **Langfuse.**
7. **Wspólny kod wstępnego przetwarzania.** Tryb `plan` powiela z `verify()` maskowanie, pobieranie stron i ostrzeżenia, żeby nie przebudowywać cudzego kodu w trakcie prac. Do scalenia, gdy oba tryby się ustabilizują.
