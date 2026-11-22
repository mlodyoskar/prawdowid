# Ewaluacja Prawdowidu

Ten dokument opisuje metodę: co mierzymy, jak odtworzyć wynik i jak czytać liczby. **Samych liczb tu nie ma.** Generuje je skrypt z surowych przebiegów do [evals/results/latest.md](../evals/results/latest.md), razem z commitem, modelem, wersją korpusu i listą plików, z których powstały. Ręcznie przepisane tabele szybko się starzały, dlatego ich nie trzymamy.

## Zestaw przypadków

Przypadki z etykietami są w [evals/cases.jsonl](../evals/cases.jsonl): część rozwojowa i odłożona (`heldOut`). Liczbę przypadków w każdym scenariuszu podaje wygenerowany raport. Autor ewaluacji dobrał przypadki i etykiety; nie było niezależnej recenzji etykiet przez człowieka. Zestawy dzielą część tematów i źródeł.

- **A** fakt prosty i zmieniony szczegół, **B** kontekst czasowy i geograficzny, **D** brak danych, opinie i prognoza, **E** instrukcja w wiadomości, na stronie lub w dokumencie, **F** obrazy PNG z tekstem (w tym błędna data), **G** rzeczywisty, podpisany webhook WhatsApp z lokalnym transportem Graph, **I** identyfikacja dokumentu po adresie, **J** brak klucza Google, limit, awaria korpusu, awaria modelu, **X** wyjście poza zakres, pytanie niejasne, dwie tezy, dane kontaktowe.
- **C** jest bez punktacji: w korpusie v3 nie ma pary dokumentów, które bezpośrednio sobie przeczą w tej samej sprawie.
- **H** jest nieobsługiwany do czasu wdrożenia obiegu moderatorskiego.

Przykłady z [docs/challenge/zadania.md](challenge/zadania.md) nie trafiają do promptu ani korpusu.

**Strojenie na przypadkach odłożonych.** Poprawka promptu z 22.11 (zasady o skrócie, o przedstawianiu starego zdarzenia jako bieżącego i o porównywaniu liczb, które liczą to samo) powstała po analizie błędów w przypadkach B7 i D5 z części odłożonej oraz E4 i A14. Zasady są ogólne i nie zawierają treści tych przypadków, ale B7 i D5 nie są już niezależną próbą: wynik części odłożonej po tej zmianie jest zawyżony o ich wpływ.

## Odtworzenie

Node 26 i pnpm 10. Ustaw `OPENROUTER_API_KEY` w lokalnym `.env` oraz stawki modelu w USD za milion tokenów (z katalogu OpenRouter), żeby raport policzył koszt. Klucz Google jest zbędny: wyszukiwania Fact Check są odtwarzane z nagrania.

```sh
pnpm install --frozen-lockfile
export LLM_PRICE_INPUT_PER_MTOK=0.10 LLM_PRICE_OUTPUT_PER_MTOK=0.50
pnpm eval --mode plan --model anthropic/claude-haiku-5.5 --workers 5 --repeat 3
pnpm eval --mode plan --model anthropic/claude-haiku-5.5 --workers 5 --repeat 3 --held-out
pnpm eval:results <plik-rozwojowy.jsonl> <plik-odłożony.jsonl>
```

- Każdy przebieg zapisuje plik JSONL w [evals/runs](../evals/runs/) i wypisuje jego nazwę. Wiersz zawiera odpowiedź, czas, tokeny, stawki, sygnały injection i commit kodu (`-dirty` przy niezacommitowanych zmianach).
- `pnpm eval:results` bez argumentów bierze wszystkie pliki z najnowszym znacznikiem czasu. Raport trafia do `evals/results/latest.md` (inna ścieżka: `--out`). Skrypt nie woła modelu, więc zapisane przebiegi można przeliczać dowolnie.
- `--only A,E` wybiera scenariusze (E dołącza czyste przypadki kontrolne). `--mode agent` mierzy pętlę narzędziową. `--no-reuse` wyłącza ponowne użycie wyniku, `--temperature none` wyłącza temperaturę 0.
- Ponowne wywołanie modelu może dać inne wyniki niż zapisany przebieg.

**Poprawność cytowania** (cel ≥ 85%) wymaga niezależnego sędziego, więc nie wchodzi do raportu automatycznego. Sędzią jest sesja Claude Code według [rubryki](../.claude/skills/judge-evals/rubric.md):

```sh
node evals/judge.mjs export <pliki przebiegu>   # potem w Claude Code: /judge-evals
node evals/report.mjs <pliki przebiegu>
```

- Umiejętność [`judge-evals`](../.claude/skills/judge-evals/SKILL.md) dzieli tezy na partie i zleca ich ocenę subagentom ze świeżym kontekstem, bez dostępu do etykiet. Oceny trafiają do [judge-claude-code.jsonl](../evals/runs/judge-claude-code.jsonl), każda z uzasadnieniem.
- Sędzia widzi pytanie użytkownika, tezę, werdykt, wyjaśnienie, cytaty z rolami i **pełny tekst** każdego cytowanego dokumentu. Ocenia, czy teza oddaje pytanie, czy każdy cytat pełni swoją rolę, czy werdykt wynika z materiału, jaki werdykt sam by wydał, czy wyjaśnienie dodaje niepodparte fakty i czy przy wstrzymaniu się wskazano dokument rozstrzygający.
- Sędzia i oceniany system to modele Anthropic, więc możliwa jest wspólna stronniczość. Wynik poprawności cytatów trzeba potwierdzić na próbce ocenionej przez człowieka. `report.mjs` zapisuje [kolejkę recenzji](../evals/runs/review.jsonl): wszystkie oznaczone odpowiedzi i jedną piątą pozostałych, wybraną powtarzalnie według skrótu treści.

## Jak czytać liczby

- **Środowisko.** Każdy proces buduje tymczasową bazę z `data/corpus/snapshot.jsonl`. Data przedstawiana modelowi to 21 listopada 2026. Przypadek z wrogim dokumentem korzysta z osobnej kopii bazy. URL-e są odtwarzane z tekstu snapshotu lub kontrolowanej strony. Google jest odtwarzane z [nagrania](../evals/fixtures/factchecks.json); zapytania spoza nagrania dostają pustą listę. To pomiar w zamkniętym zbiorze. Nagranie odświeża `node --env-file=.env evals/record.mjs` (z `GOOGLE_FACTCHECK_API_KEY`), co zmienia warunki eksperymentu.
- **Macro-F1** obejmuje pięć klas werdyktów, każda z jedną piątą wagi: F1 = 2·TP / (2·TP + FP + FN). Brak oczekiwanej tezy to FN, dodatkowa teza to FP. Przy dwóch tezach słowa identyfikujące temat przypisują je do etykiet.
- **Pokrycie cytowań** to odsetek wydanych werdyktów rozstrzygających z cytatem, który algorytm odnalazł w przywołanym dowodzie. Osobno liczymy przywołanie oczekiwanego URL i obecność wzorcowej frazy w sprawdzonym cytacie z tego URL. Tryb agent nie wyodrębnia cytatów.
- **Wstrzymanie się** liczymy na pytaniach D z nieudokumentowaną tezą. **E** wymaga właściwego werdyktu, zgodności z czystą kontrolą z tego samego powtórzenia i sygnału injection z właściwego typu wejścia. **J** wymaga odpowiedniego statusu błędu.
- **Spójność powtórzeń** wymaga oczekiwanego statusu oraz tych samych werdyktów i adresów we wszystkich powtórzeniach. **Spójność kanałów** wymaga identycznego pełnego wyniku w WWW i WhatsApp; odpowiedź WhatsApp musi pokazać werdykty i każdą publikację-podstawę, bez adresów spoza wyniku. Kontekst zostaje w pełnym wyniku, do którego wiadomość linkuje.
- **Ponowne użycie wyniku** (domyślne, jak na produkcji): drugie i trzecie powtórzenie to kopie pierwszego. Spójność jest wtedy gwarantowana konstrukcyjnie, a miary jakości mają faktycznie jedną próbę na przypadek, w której pojedynczy błąd liczy się potrójnie. Do porównań modeli lub promptów uruchamiaj z `--no-reuse`. Mechanizm opisuje [docs/agent.md](agent.md#spójność-kanałów-i-powtórzeń).
- **Czas i koszt** liczymy tylko dla sprawdzeń, które wołały model: czas dla tekstu i URL bez wymuszonych awarii (limit eksperymentu 60 s), koszt z cen katalogowych bez rabatów cache. Koszt sędziego jest osobny. Sieć Meta, kolejka produkcyjna i przeglądarka nie wchodzą do czasu.

## Znane słabości

Wnioski z analizy wywołań w PR #7, #9 i #11. Ślady i oceny do sprawdzenia są w [evals/diagnostics](../evals/diagnostics/).

- **Granica „fałszywe” / „wprowadzające w błąd” (B, F).** Od PR #11 sędzia widzi całą wiadomość użytkownika i ma definicje werdyktów oparte na rdzeniu wiadomości, więc stary materiał podany jako dzisiejszy nie kończy się już wstrzymaniem. Przy takim materiale (B3, F3, B7) werdykt przeskakiwał między „fałszywe” a „wprowadzające w błąd”, bo ekstraktor zamieniał „dziś” na datę kalendarzową i sędzia widział zwykłą sprzeczność dat. Od 22.11 ekstraktor zostawia słowa „dziś”, „wczoraj” w twierdzeniu, a sędzia ma osobną zasadę dla zdarzenia przedstawionego jako bieżące.
- **Tożsamość dokumentu (I).** Pytanie „czy ten adres to ten sam materiał” bywa zamieniane na kilka tez o treści strony, co gubi pytanie i dokłada fałszywie dodatnie tezy. To najsłabszy scenariusz.
- **Liczby nieostre (D5).** „Ponad 30 urządzeń” bywało brane za obalenie „63 laptopów”, choć nie podaje górnej granicy. Od 22.11 sędzia porównuje liczby tylko wtedy, gdy liczą to samo, a przybliżenie zgodne z twierdzeniem prowadzi do wstrzymania się. Przypadek pozostaje graniczny.
- **Dobór dowodów.** Zapytania korpusowe potrafią zająć prawie cały limit dowodów i wypchnąć trafny fact-check. Izolowany eksperyment na jednej tezie ([A13](../evals/diagnostics/A13-selection.jsonl)) pokazał, że naprzemienne wypełnianie limitu z kolejnych list trafień naprawia werdykt.
- **Cytaty kontekstowe.** Duża część cytatów z rolą „kontekst” dotyczyła innych spraw; ręczna ocena wszystkich użyć cytatów jest w [codex-citations.jsonl](../evals/diagnostics/codex-citations.jsonl) i [google-priority-citations.jsonl](../evals/diagnostics/google-priority-citations.jsonl). W przebiegu `2026-11-21T23-49-45.135Z` sędzia uznał za trafne 140/152 (92,1%) cytatów potwierdzających i obalających, ale tylko 18/94 (19,1%) kontekstowych, razem 158/246 (64,2%). Dlatego materiały o innej sprawie nie są już cytatami przy twierdzeniu, tylko osobną listą bez fragmentu ([docs/agent.md](agent.md#sędzia-i-reguły-w-kodzie-tryb-plan), reguła 7). Każdy cytat, który system nadal pokazuje, wchodzi do miernika. `evals/report.mjs` podaje wynik osobno dla obu ról. Wynik po zmianie wymaga nowego przebiegu i oceny sędziego.
- **Niedeterminizm planu zapytań.** Model formułuje zapytania za każdym razem trochę inaczej, także przy temperaturze 0, więc sędzia dostaje inny materiał. Spójność zapewnia ponowne użycie wyniku, nie determinizm modelu; parafraza to nowe zgłoszenie i może dostać inny wynik ([ślady](../evals/diagnostics/consistency-baseline-trace.jsonl)).
- **Tryb agent** zwraca status `ok` z werdyktem o braku dowodów, gdy wymagane źródło jest niedostępne. Na produkcji działa tryb plan.
