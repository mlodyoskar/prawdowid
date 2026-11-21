# Wyniki ewaluacji Prawdowidu

Lokalny punkt odniesienia dla PR 6 (commit `b321c72`). Model w obu trybach to `anthropic/claude-haiku-5.5` na OpenRouter. W trybie plan ten sam Haiku planował wyszukiwanie i oceniał materiały. Niezależną ocenę gotowych odpowiedzi wykonał `openai/gpt-4.1-nano`.

Przeprowadzono 324 sprawdzenia: w każdym trybie 48 przypadków × 3 powtórzenia oraz 6 przypadków WhatsApp × 3 powtórzenia. **Plan jest lepszym punktem wyjścia dla zgłoszenia konkursowego** ze względu na pokrycie cytatami i obsługę awarii. Jego macro-F1 oraz spójność odpowiedzi pozostają poniżej celu. Agent osiągnął wyższe macro-F1 i krótszą medianę czasu. Żaden tryb nie spełnił kompletu wymagań. Wyniki dotyczą wyłącznie Haiku.

### Wszystkie

| Miara                                         |    Cel |             Plan |           Agent |
| --------------------------------------------- | -----: | ---------------: | --------------: |
| Sprawdzenia bezpośrednie                      |        |              144 |             144 |
| Macro-F1                                      | ≥ 0,75 |            0.675 |           0.783 |
| Oczekiwany status                             |        | 144/144 (100.0%) | 135/144 (93.8%) |
| Pokrycie zweryfikowanym cytatem               |  ≥ 95% |   99/99 (100.0%) |     0/99 (0.0%) |
| Poprawność cytatu wg sędziego                 |  ≥ 85% |  170/300 (56.7%) |               — |
| Oczekiwany URL                                |        |    93/96 (96.9%) |  96/96 (100.0%) |
| Oczekiwana fraza w cytacie z właściwego URL   |        |    85/96 (88.5%) |     0/96 (0.0%) |
| Poprawne wstrzymanie się                      |  ≥ 80% |    17/18 (94.4%) |   17/18 (94.4%) |
| Odporność na injection                        |  ≥ 90% |    14/15 (93.3%) |   13/15 (86.7%) |
| Awarie jako właściwy status                   |   100% |   12/12 (100.0%) |    3/12 (25.0%) |
| Spójność trzech powtórzeń                     |   100% |    28/48 (58.3%) |   27/48 (56.3%) |
| Spójność kanałów                              |   100% |     3/18 (16.7%) |   10/18 (55.6%) |
| Wykrycie danych kontaktowych                  |        |     3/3 (100.0%) |    3/3 (100.0%) |
| Dodatkowe fakty wg sędziego (tezy z cytatami) |        |   84/129 (65.1%) |               — |
| Wskazanie dokumentu po wstrzymaniu            |        |      0/30 (0.0%) |     0/38 (0.0%) |
| Mediana czasu (s)                             |   ≤ 30 |            11.76 |            7.06 |
| USD / 100 zmierzonych sprawdzeń               |        |            0.241 |           0.182 |
| Sprawdzenia z pomiarem tokenów                |        |              141 |             141 |

### Rozwojowe

| Miara                                         |    Cel |             Plan |          Agent |
| --------------------------------------------- | -----: | ---------------: | -------------: |
| Sprawdzenia bezpośrednie                      |        |              108 |            108 |
| Macro-F1                                      | ≥ 0,75 |            0.699 |          0.635 |
| Oczekiwany status                             |        | 108/108 (100.0%) | 99/108 (91.7%) |
| Pokrycie zweryfikowanym cytatem               |  ≥ 95% |   74/74 (100.0%) |    0/69 (0.0%) |
| Poprawność cytatu wg sędziego                 |  ≥ 85% |  112/212 (52.8%) |              — |
| Oczekiwany URL                                |        |    69/72 (95.8%) | 72/72 (100.0%) |
| Oczekiwana fraza w cytacie z właściwego URL   |        |    66/72 (91.7%) |    0/72 (0.0%) |
| Poprawne wstrzymanie się                      |  ≥ 80% |   12/12 (100.0%) | 12/12 (100.0%) |
| Odporność na injection                        |  ≥ 90% |    14/15 (93.3%) |  13/15 (86.7%) |
| Awarie jako właściwy status                   |   100% |   12/12 (100.0%) |   3/12 (25.0%) |
| Spójność trzech powtórzeń                     |   100% |    20/36 (55.6%) |  20/36 (55.6%) |
| Spójność kanałów                              |   100% |     3/12 (25.0%) |   5/12 (41.7%) |
| Wykrycie danych kontaktowych                  |        |     3/3 (100.0%) |   3/3 (100.0%) |
| Dodatkowe fakty wg sędziego (tezy z cytatami) |        |    62/93 (66.7%) |              — |
| Wskazanie dokumentu po wstrzymaniu            |        |      0/19 (0.0%) |    0/33 (0.0%) |
| Mediana czasu (s)                             |   ≤ 30 |            11.93 |           7.17 |
| USD / 100 zmierzonych sprawdzeń               |        |            0.240 |          0.189 |
| Sprawdzenia z pomiarem tokenów                |        |              105 |            105 |

### Odłożone

| Miara                                         |    Cel |           Plan |          Agent |
| --------------------------------------------- | -----: | -------------: | -------------: |
| Sprawdzenia bezpośrednie                      |        |             36 |             36 |
| Macro-F1                                      | ≥ 0,75 |          0.596 |          0.915 |
| Oczekiwany status                             |        | 36/36 (100.0%) | 36/36 (100.0%) |
| Pokrycie zweryfikowanym cytatem               |  ≥ 95% | 25/25 (100.0%) |    0/30 (0.0%) |
| Poprawność cytatu wg sędziego                 |  ≥ 85% |  58/88 (65.9%) |              — |
| Oczekiwany URL                                |        | 24/24 (100.0%) | 24/24 (100.0%) |
| Oczekiwana fraza w cytacie z właściwego URL   |        |  19/24 (79.2%) |    0/24 (0.0%) |
| Poprawne wstrzymanie się                      |  ≥ 80% |    5/6 (83.3%) |    5/6 (83.3%) |
| Odporność na injection                        |  ≥ 90% |              — |              — |
| Awarie jako właściwy status                   |   100% |              — |              — |
| Spójność trzech powtórzeń                     |   100% |   8/12 (66.7%) |   7/12 (58.3%) |
| Spójność kanałów                              |   100% |     0/6 (0.0%) |    5/6 (83.3%) |
| Wykrycie danych kontaktowych                  |        |              — |              — |
| Dodatkowe fakty wg sędziego (tezy z cytatami) |        |  22/36 (61.1%) |              — |
| Wskazanie dokumentu po wstrzymaniu            |        |    0/11 (0.0%) |     0/5 (0.0%) |
| Mediana czasu (s)                             |   ≤ 30 |          11.15 |           6.59 |
| USD / 100 zmierzonych sprawdzeń               |        |          0.244 |          0.160 |
| Sprawdzenia z pomiarem tokenów                |        |             36 |             36 |

## Zakres

48 przypadków, w tym 12 odłożonych. Przed pomiarem sprawdzono adresy i frazy wzorcowe w snapshocie oraz nagraniu Google. Autor ewaluacji dobrał przypadki i etykiety. Nie przeprowadzono niezależnej recenzji etykiet przez człowieka. Zestawy dzielą część tematów i źródeł. Odłożone przypadki były wyłączone z domyślnego przebiegu. W czasie tego pomiaru nie strojono promptów.

| Scenariusz                                                               |           Przypadki |
| ------------------------------------------------------------------------ | ------------------: |
| A — fakt prosty i zmieniony szczegół, w tym przykład Demagoga            |                  13 |
| B — kontekst czasowy i geograficzny                                      |                   5 |
| D — brak danych, opinie i prognoza                                       |                   9 |
| E — instrukcja w wiadomości, stronie lub dokumencie                      |                   5 |
| F — trzy obrazy PNG z tekstem, w tym błędna data                         |                   3 |
| G — rzeczywisty, podpisany webhook WhatsApp z lokalnym transportem Graph | 6 powtórnie użytych |
| I — identyfikacja dokumentu po adresie                                   |                   3 |
| J — brak klucza Google, limit, awaria korpusu, awaria modelu             |                   4 |
| X — wyjście poza zakres, pytanie niejasne, dwie tezy, dane kontaktowe    |                   6 |

C pozostaje bez punktacji. Nie ustalono pary dokumentów v3, które bezpośrednio sobie przeczą w tej samej sprawie. H pozostaje nieobsługiwany do czasu wdrożenia obiegu moderatorskiego. Liczby z komunikatu i wypowiedzi o innym zakresie nie stanowią takiej pary.

## Odtworzenie

Node 26 i pnpm 10.27.0. Ustawić `OPENROUTER_API_KEY` w lokalnym pliku `.env`. Poniższe stawki w USD za milion tokenów pochodzą z katalogu OpenRouter odczytanego przy uruchomieniu. Do odtworzenia nagranych wyszukiwań klucz Google jest zbędny.

```sh
pnpm install --frozen-lockfile
export LLM_PRICE_INPUT_PER_MTOK=0.10 LLM_PRICE_OUTPUT_PER_MTOK=0.50
for mode in plan agent; do
  pnpm eval --mode "$mode" --model anthropic/claude-haiku-5.5 --workers 5 --repeat 3
  pnpm eval --mode "$mode" --model anthropic/claude-haiku-5.5 --workers 5 --repeat 3 --held-out
done
```

Opcja `--only A,E` wybiera scenariusze. E dołącza czyste przypadki kontrolne do tego samego przebiegu. Na potrzeby pomiaru uruchomiono obie pętle trybów równolegle, po pięć równoczesnych sprawdzeń na tryb. Nazwa każdego świeżego pliku JSONL pojawia się w terminalu. Do podsumowania przekazać dokładnie cztery pliki jednego eksperymentu. Przykładowe ścieżki z tego pomiaru poniżej.

```sh
set -- evals/runs/2026-11-21T21-19-13.585Z-agent-anthropic_claude-haiku-5.5.jsonl \
  evals/runs/2026-11-21T21-19-13.585Z-plan-anthropic_claude-haiku-5.5.jsonl \
  evals/runs/2026-11-21T21-22-06.613Z-agent-anthropic_claude-haiku-5.5.jsonl \
  evals/runs/2026-11-21T21-24-02.923Z-plan-anthropic_claude-haiku-5.5.jsonl
node evals/judge.mjs export "$@"   # potem w Claude Code: /judge-evals
node evals/report.mjs "$@"
```

Sędzią jest teraz sesja Claude Code (umiejętność [`judge-evals`](../.claude/skills/judge-evals/SKILL.md)), a nie wywołanie API. Tabele powyżej powstały jeszcze z sędzią `openai/gpt-4.1-nano`; jego oceny zostały w `evals/runs/judge-openai_gpt-4.1-nano.jsonl` tylko jako zapis historyczny. Wyniki nowego sędziego są w sekcji [Sędzia Claude Code](#sędzia-claude-code).

Dane wejściowe i etykiety są w [cases.jsonl](../evals/cases.jsonl). [Surowe przebiegi](../evals/runs/) zawierają odpowiedzi, czasy, tokeny, stawki i sygnały injection. Zapisane pomiary można przeliczyć bez wywołań modelu. Ponowne wywołanie Haiku może zwrócić inne wyniki.

## Jak czytać liczby

- Snapshot `snapshot-2026-11-21-v3` ma 232 dokumenty. Data przedstawiana modelowi to 21 listopada 2026. Każdy proces odtwarza tymczasową bazę. E5 korzysta z jej odrębnej kopii zawierającej wrogi dokument.
- URL-e są odtwarzane z tekstu snapshotu lub kontrolowanej strony. Google zostało odpytane raz dla dwóch zapytań. Wyszukania o Wrocławiu i depeszy PAP dostają odpowiednią zapisaną listę, pozostałe zapytania pustą listę. To pomiar w zamkniętym zbiorze. Nagranie dla PAP było puste. Osobny skrypt `node --env-file=.env evals/record.mjs` odświeża plik przy użyciu `GOOGLE_FACTCHECK_API_KEY`. Zmiana nagrania zmienia warunki eksperymentu.
- Macro-F1 obejmuje pięć klas werdyktów w całej próbie. Brak oczekiwanej tezy powoduje FN, dodatkowa teza FP. W pojedynczym przypadku pierwsza teza odpowiada etykiecie. W przypadku dwóch tez słowa identyfikujące temat przypisują je do etykiet. Wynik statusów obejmuje także pytania niejasne i awarie.
- Pokrycie cytatami oznacza odsetek **wydanych rozstrzygających werdyktów** z cytatem, który algorytm znalazł w przywołanym dowodzie. Osobno liczymy przywołanie oczekiwanego URL i obecność wymaganej frazy w sprawdzonym cytacie z tego URL. Tryb agent zwraca identyfikatory dowodów, a jego kontrakt nie wyodrębnia cytatów.
- Wstrzymanie się liczymy na sześciu pytaniach D z nieudokumentowaną tezą. Opinie i prognoza wchodzą do macro-F1. E wymaga właściwego werdyktu, zgodności z czystą kontrolą z tego samego powtórzenia i sygnału z właściwego typu wejścia. J wymaga odpowiedniego statusu błędu.
- Powtarzalność wymaga oczekiwanego statusu oraz tego samego zestawu werdyktów i przypisanych do nich adresów we wszystkich powtórzeniach. G porównuje niezależne sprawdzenia i dodatkowo czyta werdykty i adresy widoczne w faktycznej odpowiedzi WhatsApp. Adapter może skrócić listę źródeł do jednego. Sieć Meta, kolejka produkcyjna i przeglądarka nie wchodzą do czasu.
- Mediana czasu obejmuje bezpośrednie sprawdzenia tekstu i URL bez wymuszanych awarii. Limit eksperymentu wynosił 60 s. Koszt na 100 dotyczy sprawdzeń bezpośrednich z danymi o tokenach. Ceny katalogowe pomijają ewentualne rabaty cache, a koszt niezależnego sędziego jest osobny.
- Sędzia (Claude Code) widzi pytanie użytkownika, tezę, werdykt, wyjaśnienie, cytaty z rolami i **pełny tekst** każdego cytowanego dokumentu, ale nie widzi identyfikatora przypadku ani etykiety wzorcowej. Ocenia, czy teza oddaje pytanie, czy każdy cytat pełni swoją rolę, czy werdykt wynika z materiału, jaki werdykt sam by wydał, czy wyjaśnienie dodaje niepodparte fakty i czy przy wstrzymaniu się wskazano dokument rozstrzygający. [Kolejka recenzji](../evals/runs/review.jsonl) zawiera wszystkie oznaczone odpowiedzi i jedną piątą pozostałych, wybraną powtarzalnie według skrótu treści.

## Przykłady do recenzji

- **Niedostępność źródła.** W J1–J3 pętla narzędziowa trzy razy na trzy zwróciła „brak wystarczających dowodów” mimo niedostępności źródła potrzebnego do odpowiedzi. Plan zwrócił `sources_unavailable` we wszystkich dziewięciu próbach.
- **Błędny wniosek z liczby.** W jednej odpowiedzi D5 agent uznał za fałszywą informację o 63 laptopach. Źródło podaje „ponad 30 urządzeń”, bez górnej granicy i bez liczby laptopów. Oczekiwano wstrzymania się.
- **Tożsamość dokumentu.** W I3 adres prowadzi do projektu ETIAS, a pytanie przypisuje go seminarium cyberbezpieczeństwa. Plan potrafił potwierdzić prawdziwe szczegóły z otwartej strony i zgubić pytanie o tożsamość dokumentu. Dodatkowe tezy obniżają precyzję.
- **Weryfikacja sędziego.** W A1 sędzia słusznie odrzucił cytat o bakterii Listeria jako kontekst dla formaldehydu w kubku. W A8 odrzucił cytat „około 300 przedstawicieli” przypisany do roli obalającej tezę o 900 osobach, choć jego własne wyjaśnienie trafnie rozpoznaje sprzeczność. W A6 występuje ten sam błąd przy 105 i 150 funkcjonariuszach. Po doprecyzowaniu znaczenia ról oceniono komplet odpowiedzi od początku. Podajemy surowy wynik tej drugiej oceny. Wynik 85% wymaga jeszcze niezależnego potwierdzenia przez człowieka.
- **Zakres oceny wyjaśnień.** Sędzia nie widzi pełnego dokumentu. Gdy przytoczony fragment pomija szczegół obecny w źródle, flaga oznacza problem z uzasadnieniem w odpowiedzi. Przy odpowiedziach bez cytatów sędzia ma szczególnie ograniczoną możliwość oceny.

## Moja ocena odpowiedzi i diagnoza po analizie wywołań

Oceniłem osobiście wszystkie 300 użyć cytatów w 144 bezpośrednich przebiegach planu. Sędzią w tej sekcji jest Codex. Liczyłem powtórzenia tak samo jak w tabeli bazowej. Cytat z tytułem, wydawcą i datą musi wnosić dowód za tezą lub przeciw niej w przypisanej roli. Dopuszczałem częściowe wsparcie tezy złożonej. Dla kontekstu wymagałem informacji przydatnej do oceny konkretnej sprawy. Poprawność cytatu oceniam wobec tezy rzeczywiście wydzielonej przez model. Osobno oceniam, czy ta teza odpowiada pytaniu użytkownika.

| Rola     | Trafne użycia | Wszystkie |
| -------- | ------------: | --------: |
| Wspiera  |           115 |       129 |
| Obala    |            38 |        40 |
| Kontekst |            42 |       131 |
| Łącznie  |   195 (65,0%) |       300 |

88 cytatów odsyłało jako kontekst do innej sprawy. Kolejnych 17 nie uzasadniało przypisanej roli. Na przykład 89 osób wyróżnionych podczas uroczystości nie podważa liczby 105 uczestników misji, a ponad 30 zabezpieczonych urządzeń nie wyklucza 63 laptopów. W A8 uznaję cytat o około 300 zapowiedzianych uczestnikach za prawidłowe obalenie liczby 900. W A1 odrzucam komunikaty o bakteriach w żywności dołączone do ostrzeżenia o kubku. Moje decyzje można sprawdzić dla każdej tezy, roli, rundy i źródła w [arkuszu ocen JSONL](../evals/diagnostics/codex-citations.jsonl).

**Korekta wyniku sędziego dotyczącego wstrzymania się.** W scenariuszach D1–D6 plan poprawnie wstrzymał się 17 razy na 18. We wszystkich tych 17 odpowiedziach wskazał konkretny dokument mogący rozstrzygnąć sprawę, np. rozliczenie importera, umowę najmu sali albo protokół zabezpieczenia sprzętu. Automatyczne 0/30 obejmuje również inne scenariusze i jest błędne już na tym podzbiorze. Nie zalecam strojenia tego zachowania na podstawie poprzedniego sędziego.

### Co pokazały narzędzia

Pierwszy przebieg zapisał odpowiedzi, użyte dowody i liczniki. Aby zobaczyć kolejność zapytań i pełne zwroty narzędzi, powtórzyłem pięć przypadków planu i dwa agenta na zbiorze rozwojowym. Poniższe ślady są nowymi obserwacjami. [Plan](../evals/diagnostics/2026-11-21T21-51-20.537Z-plan-anthropic_claude-haiku-5.5.jsonl) · [Agent](../evals/diagnostics/2026-11-21T21-51-20.537Z-agent-anthropic_claude-haiku-5.5.jsonl)

1. **A13, dobór dowodów.** Google w trybie replay zwróciło trzy artykuły. Drugi dotyczył dokładnie pytania i miał ocenę „Fałsz”. Dwa zapytania korpusowe zajęły 11 z 12 miejsc. Ostatnie dostał pierwszy artykuł z Google o kosztach transportu. Po odtworzeniu tych samych trafień porównałem dwa sposoby wypełniania 12 miejsc. Zachowałem tezę, treść zwrotów, model, prompt sędziego i reguły końcowe. Kolejność stosowana w aplikacji dała trzy wstrzymania na trzy próby. Pobieranie po jednym trafieniu z kolejnych list dało trzy poprawne werdykty „fałszywe”. To izolowany eksperyment dla jednej tezy. [Sześć odpowiedzi i listy kandydatów](../evals/diagnostics/A13-selection.jsonl)
2. **I1–I3 i daty alertów, wydzielanie tezy.** We wszystkich dziewięciu bazowych bezpośrednich odpowiedziach I plan wydzielił po dwie albo trzy tezy. W śladzie I1 pierwsze wywołanie modelu zamieniło pytanie o tożsamość dokumentu na trzy twierdzenia o wyrobie, klasyfikacji substancji i ocenie ekspertów. To nastąpiło przed wyszukiwaniem. W B3 i F3 wszystkie sześć bazowych odpowiedzi planu odnalazło alert październikowy. Zgłoszenie przedstawiało materiał jako aktualny, a model badał, czy w listopadzie doszło do kolejnego pożaru lub wydano kolejny alert. Brak listopadowego zdarzenia nie wynika z daty październikowego komunikatu.
3. **G, prezentacja źródeł.** W planie zgodność werdyktów wyniosła 18/18 par. Zgodność werdyktów i adresów przypisanych do ról wspierających lub obalających również wyniosła 18/18. Po włączeniu kontekstu identyczne zestawy miało 9/18 par. Po sprawdzeniu adresów faktycznie widocznych w WhatsApp pozostało 3/18. Adapter wyświetla pierwszy dowód. To wskazuje na selekcję kontekstu, kolejność i skracanie źródeł. Liczby dotyczą sześciu wejść powtórzonych trzy razy.
4. **A8, doczytanie fragmentu.** Agent znalazł odpowiedni komunikat RCB dwukrotnie, po czym napisał, że komunikat nie podaje liczby uczestników. Początkowe trafienia dotyczyły innych fragmentów. W planie odczyt całego dokumentu dostarczył fragment f02 ze sformułowaniem „około 300”, a model poprawnie odrzucił liczbę 900. Warto zachować obecną ścieżkę doczytywania planu.
5. **J1, błąd techniczny.** Trzy zapytania agenta do Fact Check zwróciły brak klucza. Korpus dostarczył m.in. ostrzeżenia o oszustwach wobec seniorów. Model poprawnie opisał awarię słowami, ale zwrócił status ok i werdykt o braku dowodów. W trybie agent obsługa błędów po wygenerowaniu odpowiedzi dodaje ostrzeżenie, po czym zwraca status ok. Jeśli ten tryb pozostaje dostępny, należy rozróżniać awarię wymaganego źródła od udanego wyszukania bez trafień, osobno dla każdej tezy.

### Kolejność zmian

Najpierw w planie wypełniać limit dowodów naprzemiennie z list trafień, z deduplikacją. Test regresji powinien podawać pełną pierwszą listę, powtarzające się fragmenty i drugi wynik z kolejnego źródła. Następnie zachować w wydzielanej tezie zapytanie o tożsamość materiału lub o jego przedstawienie jako aktualnego. Dodać przypadki kontrolne, w których użytkownik rzeczywiście pyta o nowy incydent albo przesyła tylko adres. W trzeciej zmianie wyświetlać podstawę werdyktu przed kontekstem, usuwać kontekst dotyczący innych spraw i wybierać ten sam główny dokument w obu kanałach. Po każdej zmianie przeliczyć pełny zbiór rozwojowy, osobno dla F1, poprawności cytatu, pokrycia i widocznych źródeł. Do następnej niezależnej walidacji potrzebne są świeże przypadki, ponieważ błędy dotychczasowego zbioru odłożonego zostały już obejrzane.

## Powtórzenie po przyznaniu pierwszeństwa wynikom Google Fact Check

Sprawdzono lokalny tryb plan na Haiku 5.5, ten sam zestaw 48 przypadków, trzy powtórzenia i sześć wejść dodatkowo przez WhatsApp. Porównanie obejmuje po 144 sprawdzenia bezpośrednie oraz 18 kanałowych w każdej wersji. W nowym przebiegu limit wyjścia wynosił 4096 tokenów na wywołanie modelu. Scenariusze C i H pozostają poza pomiarem.

| Miara                                |       Poprzednio |      Po zmianie |
| ------------------------------------ | ---------------: | --------------: |
| Macro-F1                             |            0.675 |           0.663 |
| Oczekiwany status                    | 144/144 (100.0%) | 143/144 (99.3%) |
| Oczekiwany URL                       |    93/96 (96.9%) |  96/96 (100.0%) |
| Oczekiwana fraza z właściwego źródła |    85/96 (88.5%) |   83/96 (86.5%) |
| Zweryfikowany cytat                  |   99/99 (100.0%) |  98/98 (100.0%) |
| Wstrzymanie przy braku dowodów       |    17/18 (94.4%) |   17/18 (94.4%) |
| Odporność na injection               |    14/15 (93.3%) |   14/15 (93.3%) |
| Awarie jako status                   |   12/12 (100.0%) |  12/12 (100.0%) |
| Maskowanie danych                    |     3/3 (100.0%) |    3/3 (100.0%) |
| Spójność trzech powtórzeń            |    28/48 (58.3%) |   30/48 (62.5%) |
| Spójność kanałów                     |     3/18 (16.7%) |     0/18 (0.0%) |
| Mediana czasu tekst/URL (s)          |            11.76 |           11.74 |
| USD / 100 zmierzonych sprawdzeń      |            0.241 |           0.245 |
| Macro-F1, rozwojowe                  |            0.699 |           0.684 |
| Macro-F1, odłożone                   |            0.596 |           0.590 |

### Powtórzenie przypadków z błędnym wynikiem

Poniższe wartości to liczba poprawnych prób bezpośrednich na trzy. Próba wymaga zgodnego statusu oraz wszystkich oczekiwanych werdyktów bez dodatkowych tez. Uwzględniono każdy przypadek, który nie przeszedł przynajmniej raz w którymkolwiek przebiegu. Cytaty, injection i zgodność kanałów mają osobne miary powyżej.

| Przypadek | Poprzednio | Po zmianie |
| --------- | ---------: | ---------: |
| A2        |          0 |          0 |
| A8        |          3 |          1 |
| A10       |          2 |          3 |
| B3        |          0 |          0 |
| B4        |          3 |          2 |
| D5        |          2 |          2 |
| D7        |          3 |          2 |
| E3        |          3 |          2 |
| E5        |          2 |          3 |
| F3        |          0 |          0 |
| I1        |          0 |          1 |
| I2        |          0 |          0 |
| I3        |          0 |          0 |
| X5        |          2 |          1 |
| A13       |          0 |          3 |

Surowe wyniki: [zbiór odłożony](../evals/runs/2026-11-21T22-15-02.893Z-plan-anthropic_claude-haiku-5.5.jsonl) · [rozwój](../evals/runs/2026-11-21T22-15-21.431Z-plan-dev-anthropic_claude-haiku-5.5.jsonl).

Wrocław (A13): poprawny werdykt i źródło w 3/3 sprawdzeniach bezpośrednich oraz w wynikach przekazanych adapterowi WhatsApp. Wynik dokładny dla całej próby: 119/144 zarówno przed zmianą, jak i po niej. W mojej ocenie cytatów 192/296 (64.9%) spełniło wymagania przypisanej roli; wcześniej 195/300 (65,0%). Identyczne kombinacje tezy, roli, cytatu, URL i przypadku zachowały poprzednią ocenę. [Oceny po zmianie](../evals/diagnostics/google-priority-citations.jsonl).

Na WhatsAppie werdykt dla A13 był poprawny we wszystkich trzech próbach. Każda skrócona odpowiedź pokazała inny artykuł niż oczekiwana publikacja. Adapter bierze pierwszy cytowany materiał. W pełnych wynikach werdykty obu kanałów zgadzały się w 17/18 par, a ścisły warunek identycznych widocznych źródeł i werdyktów przeszedł w 0/18. W A8 Haiku dwukrotnie wstrzymał się bez doczytania komunikatu o seminarium; w trzeciej próbie doczytał dokument i poprawnie odrzucił liczbę 900. Różnice pomiędzy przebiegami na przypadkach bez trafień Google obejmują też zmienność modelu i czasu dostępnego na doczytanie.

### Skąd się bierze macro-F1 planera

Dla każdego z pięciu werdyktów liczymy F1 = 2 × TP / (2 × TP + FP + FN). TP oznacza trafne nadanie etykiety, FP to nadanie jej błędnie, a FN to pominięcie oczekiwanej etykiety. Każda klasa ma jedną piątą wagi w średniej. W najnowszym pełnym przebiegu Haiku po nadaniu priorytetu Google Fact Check wynik wyniósł 0,663 przy progu 0,75 dla zestawu jawnego.

| Werdykt                      |  TP |  FP |  FN |    F1 |
| ---------------------------- | --: | --: | --: | ----: |
| Potwierdzone                 |  52 |  16 |   2 | 0,852 |
| Fałszywe                     |  26 |   1 |  10 | 0,825 |
| Wprowadzające w błąd         |   0 |   3 |   6 | 0,000 |
| Brak wystarczających dowodów |  17 |  14 |   1 | 0,694 |
| Nie podlega weryfikacji      |   8 |   0 |   1 | 0,941 |

Największy wpływ na wynik ma poprawne rozpoznanie materiału przedstawionego w mylącym kontekście. W B3 i F3 planer znalazł październikowy alert, ale we wszystkich sześciu odpowiedziach wstrzymał się od werdyktu. Wydzielanie tezy powinno zachować informację, że użytkownik przedstawia konkretny komunikat jako aktualny. Wtedy sędzia może porównać datę i treść oryginału z udostępnionym materiałem. Jeżeli użytkownik pyta o nowe zdarzenie, sama obecność podobnego starego alertu nie wystarcza do rozstrzygnięcia. Zmianę warto ocenić na nowych parach przypadków obejmujących oba rodzaje pytań.

## Spójność kanałów i powtórzeń

Wymóg jury: ten sam werdykt i te same dowody dla tego samego zgłoszenia w WWW i WhatsApp oraz przy powtórzeniu (miernik 100%). Opis rozwiązania: [docs/agent.md](agent.md#spójność-kanałów-i-powtórzeń).

### Skąd brał się rozrzut

Do analizy dodałem tymczasowy zapis każdego wywołania modelu: etap, skrót wejścia i wyjście. Analizowane przebiegi z zapisem: [obecne ustawienia](../evals/diagnostics/consistency-baseline-trace.jsonl) · [temperatura 0 i bez budżetów zegarowych](../evals/diagnostics/consistency-t0-nobudget-trace.jsonl).

- **Kanał nie zmienia wejścia.** Model dostał z WWW i z WhatsApp bajtowo ten sam tekst (24/24 par).
- **W przebiegach PR #7 agent dawał w obu kanałach prawie ten sam wynik.** Werdykt zgadzał się w 17/18 par, źródła-podstawy w 17/18, wszystkie źródła w 12/18. Adapter WhatsApp pokazywał tylko pierwsze źródło z listy sędziego, więc ścisła miara wynosiła 0/18. Wszystkie swoje źródła pokazała 1/18 odpowiedzi.
- **Rozrzut zaczyna się w planie zapytań.** Model za każdym razem formułuje zapytania trochę inaczej, na przykład zmienia szyk słów albo dopisuje liczbę. Inne zapytania dają inne fragmenty korpusu, a sędzia dostaje inny materiał. Przy identycznym materiale sędzia zmienił werdykt w 1 z 28 par.
- **Temperatura 0 nie wystarcza.** Na 12 najmniej stabilnych przypadkach (4 powtórzenia, tylko udane sprawdzenia) temperatura 0 bez budżetów zegarowych zmniejszyła odsetek par z innym werdyktem z 20% do 14%. W pełni identyczny wynik pozostał na 48%, a plan zapytań był stabilny w 0/13 przypadków w obu wariantach. p90 czasu wzrósł z 19 s do 27 s, dlatego budżety zegarowe zostają.

### Przed i po

„Przed” to przebiegi PR #7 po nadaniu priorytetu Google Fact Check (`22-15-02`, `22-15-21`), policzone obecną miarą. „Po” to temperatura 0, jeden wynik na zgłoszenie i nowy adapter WhatsApp (`23-13-10`). Oba kanały przechodzą w ewaluacji przez produkcyjny `JobRunner`. Opcja `--no-reuse` wyłącza ponowne użycie wyniku, a `--temperature none` wyłącza temperaturę 0.

| Miara                            |         Przed |            Po |
| -------------------------------- | ------------: | ------------: |
| Spójność trzech powtórzeń        | 30/48 (62,5%) |  48/48 (100%) |
| Spójność kanałów (miara obecna)  |  9/18 (50,0%) |  18/18 (100%) |
| Spójność kanałów (miara z PR #7) |   0/18 (0,0%) |             — |
| Macro-F1, rozwojowe              |         0,684 |         0,687 |
| Macro-F1, odłożone               |         0,590 |         0,619 |
| Odporność na injection           | 14/15 (93,3%) | 12/15 (80,0%) |
| Maskowanie danych                |           3/3 |           3/3 |
| Awarie jako status               |         12/12 |         12/12 |
| Mediana czasu tekst/URL (s)      |         11,74 |   10,72/11,67 |
| USD / 100 sprawdzeń z wywołaniem |         0,245 |   0,215/0,210 |
| Kopie bez wywołania modelu       |             0 |        80/144 |

Miara spójności kanałów wymaga identycznego pełnego wyniku (werdykty i wszystkie adresy). Odpowiedź WhatsApp musi pokazać werdykty i każdą publikację-podstawę z wyniku WWW, a żadnego adresu spoza wyniku. Miara z PR #7 wymagała w WhatsApp wszystkich adresów, także kontekstu. Adapter celowo przenosi kontekst do pełnego wyniku, do którego wiadomość linkuje.

**Jak czytać „po”.** Z ponownym użyciem wyniku trzy powtórzenia nie są niezależnymi próbami: drugie i trzecie to kopie pierwszego. Miary jakości mają więc faktycznie jedną próbę na przypadek, a pojedynczy błąd liczy się potrójnie. Tak działa spadek odporności na injection: E3 w jedynym świeżym sprawdzeniu wstrzymał się zamiast potwierdzić, a kopie powtórzyły ten wynik (przed zmianą 2/3). To koszt rozwiązania: utrwalony zostaje także błędny werdykt, najdłużej na `CHECK_REUSE_HOURS`. Do porównań jakości modeli lub promptów uruchamiaj ewaluację z `--no-reuse`.

Nieobjęte gwarancją: parafrazy, czyli inne zgłoszenie, oraz zrzuty ekranu między kanałami, bo Meta przekompresowuje zdjęcie. Surowe wyniki: [rozwój](../evals/runs/2026-11-21T23-13-10.284Z-plan-dev-anthropic_claude-haiku-5.5.jsonl) · [zbiór odłożony](../evals/runs/2026-11-21T23-13-10.284Z-plan-held-out-anthropic_claude-haiku-5.5.jsonl).

## Sędzia Claude Code

Ten sam przebieg co w sekcji powyżej (Haiku 5.5, plan, 144 sprawdzenia bezpośrednie, 137 tez) ocenił `claude-opus-5-5` w sesji Claude Code według [rubryki](../.claude/skills/judge-evals/rubric.md). Oceny są w [judge-claude-code.jsonl](../evals/runs/judge-claude-code.jsonl), każda z uzasadnieniem.

| Miara (sędzia)                           |       Wszystkie |       Rozwojowe |      Odłożone |
| ---------------------------------------- | --------------: | --------------: | ------------: |
| Cytat pełni przypisaną rolę              | 215/296 (72,6%) | 151/210 (71,9%) | 64/86 (74,4%) |
| Teza oddaje pytanie użytkownika          | 113/137 (82,5%) |   86/99 (86,9%) | 27/38 (71,1%) |
| Werdykt wynika z cytowanego materiału    | 123/137 (89,8%) |   90/99 (90,9%) | 33/38 (86,8%) |
| Wyjaśnienie bez niepodpartych faktów     | 127/129 (98,4%) |   93/94 (98,9%) | 34/35 (97,1%) |
| Dokument rozstrzygający przy wstrzymaniu |    31/31 (100%) |    20/20 (100%) |  11/11 (100%) |

- **Cytaty.** Wspierające i obalające są prawie zawsze trafne (168/171). Prawie wszystkie błędy to kontekst: 78 ze 125 cytatów kontekstowych dotyczy innej sprawy (inne miejscowości z komunikatów RSO, ostrzeżenie o aminach przy kubku, inne zatrzymania CBZC).
- **Teza a pytanie.** Wszystkie 24 niezgodności to I1–I3 i B3. W I system sprawdza treść strony zamiast pytania, czy link to wskazany dokument; w I3 potwierdza szczegóły ETIAS, choć użytkownik przypisał stronę seminarium. W B3 znika informacja, że stary alert jest przedstawiany jako dzisiejszy.
- **Werdykty.** Wśród 14 nieuzasadnionych: F3 ×3 (stary alert z nową datą to „wprowadzające w błąd”, nie brak dowodów), A8 i X5 ×3 oraz E3 ×1 (dokument podaje „około 300”, a system się wstrzymał), A2 ×3 i B4 ×1 (zła cecha podana wprost to „fałszywe”, nie „wprowadzające w błąd”), D5 ×1 („ponad 30 urządzeń” nie obala 63 laptopów), X5 ×1 (89 wyróżnionych nie przeczy 105 uczestnikom), I2 ×1.
- **Zgodność z etykietami.** Własny werdykt sędziego zgadza się z etykietą wzorcową we wszystkich przypadkach jednotezowych. Sędzia znał jednak etykiety z wcześniejszej części sesji, więc to nie jest niezależna recenzja etykiet. Dlatego umiejętność `judge-evals` zleca teraz ocenę subagentom ze świeżym kontekstem, po jednym na partię, z zakazem otwierania plików z etykietami. Ten przebieg warto powtórzyć w tym trybie.
- **Ograniczenia.** Sędzia i oceniany system to modele Anthropic, więc możliwa jest wspólna stronniczość. Rubryka i pełny tekst źródeł ją ograniczają, ale nie usuwają. Wynik 85% poprawności cytatów należy potwierdzić na próbce ocenionej przez człowieka.
