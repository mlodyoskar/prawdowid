# Wymagania wyzwania Prawdowid (MSZ)

Tekstowa wersja [tresc-zadania.pdf](tresc-zadania.pdf). W razie rozbieżności rozstrzyga PDF.

## Cel
Obywatel, także o niskich kompetencjach cyfrowych, ma sprawdzić pogłoskę „tak łatwo, jak wysłać wiadomość”: przez kanał, którego już używa, bezpłatnie po stronie usługi. System pokazuje źródła i granice swojej wiedzy. Model językowy służy do rozumienia pytania, wyszukiwania, porównywania materiałów i formułowania odpowiedzi, nie jest źródłem prawdy. System nie ma być „automatycznym sędzią prawdy”.

Kontekst: przeciwdziałanie zagranicznym manipulacjom informacyjnym (FIMI). Język polski, z możliwością rozszerzenia na inne języki.

## MVP
1. **Wejście:** tekst lub URL przez responsywny interfejs WWW **oraz** co najmniej 1 dodatkowy kanał albo adapter demonstracyjny. Dozwolone: SMS, WhatsApp, Messenger, Instagram, Discord lub równoważne. **Wykluczone: Telegram, WeChat i platformy niszowe.**
2. Rozpoznanie jednego lub kilku twierdzeń wymagających sprawdzenia.
3. Wyszukiwanie w jasno opisanym zbiorze z co najmniej 2 typami źródeł i pokazanie materiałów użytych w odpowiedzi.
4. Wynik, krótkie uzasadnienie, ocena siły podstawy odpowiedzi i czytelna informacja o ograniczeniach.
5. Odpowiedź po polsku, prostym językiem.
6. Zapis przebiegu sprawdzenia: pytanie, czas, użyte źródła, wynik.
7. Wstrzymanie się od rozstrzygnięcia przy braku dowodów, bez pozornej odpowiedzi.
8. Pełna ścieżka end-to-end bez ręcznej ingerencji twórców.

## Werdykty (dla każdego twierdzenia)
`potwierdzone` · `fałszywe` · `wprowadzające w błąd` · `brak wystarczających dowodów` · `nie podlega weryfikacji`

**Nie są werdyktami** i trzeba je komunikować osobno: awaria techniczna, brak możliwości sprawdzenia, potrzeba doprecyzowania pytania, wyjście poza zakres. Brak klucza, limit lub awaria API nie mogą wyglądać jak wynik merytoryczny.

## Dowody i cytowania
- Każda teza faktograficzna przedstawiana jako ustalenie systemu prowadzi do konkretnego źródła.
- Materiał źródłowy jest oddzielony od interpretacji modelu.
- Przy źródle minimum: **tytuł, wydawca, data, link**, a w miarę możliwości wykorzystany fragment.
- Siła werdyktu wynika z jawnych przesłanek: jakości i aktualności źródeł, zgodności z twierdzeniem, liczby niezależnych potwierdzeń.
- Zapisywany jest znacznik czasu publikacji i pobrania. System preferuje aktualne dane i ostrzega o materiale archiwalnym.
- Sprawy wysokiego ryzyka i powtarzające się pytania bez źródeł trafiają z powiadomieniem do moderatora lub analityka wskazanego przez administratora.

## Architektura i technologia
- Stack jest dowolny: modele komercyjne i otwarte, wyszukiwanie pełnotekstowe, wektorowe lub hybrydowe. Za samą technologię nie ma punktów, oceniana jest jakość działania.
- **Obsługa kanałów oddzielona od logiki weryfikacji.** WWW i drugi kanał korzystają z tej samej logiki i dają ten sam wynik merytoryczny.
- **Model lub dostawcę da się wymienić** bez przebudowy całego systemu.
- Trzeba uzasadnić główne wybory oraz opisać koszty, zależności od dostawców, możliwość migracji, wymagane klucze, limity, miejsce przetwarzania danych i zachowanie przy awarii.
- Organizator nie zapewnia kont, numerów testowych ani kluczy do kanałów.

## Wymagania niefunkcjonalne
- **Bezpieczeństwo:** walidacja wejścia, oddzielenie instrukcji systemowych od treści źródeł, ograniczenia narzędzi, ochrona sekretów, limitowanie żądań, logowanie zdarzeń. Instrukcje znalezione w materiałach nie zmieniają zasad działania (prompt injection).
- **Prywatność:** minimalizacja danych, automatyczne maskowanie oczywistych danych osobowych, określona retencja, możliwość usunięcia sesji demonstracyjnej.
- **Obserwowalność:** czas odpowiedzi, użycie modeli, błędy wyszukiwania, przypadki wstrzymania się, szacunkowy koszt odpowiedzi.
- **Dostępność:** responsywny interfejs, czytelny kontrast, język zrozumiały dla osoby bez wiedzy technicznej.
- **Koszty:** oszacować koszt 1 000 zapytań, koszt utrzymania kanału i zachowanie przy większym ruchu. Usługa jest bezpłatna dla obywatela, a ewentualne opłaty operatora (np. za SMS) trzeba jasno wskazać.
- **Uruchomienie:** jury uruchamia system według instrukcji zespołu, bez jego pomocy.
- **Repo:** żadnych kluczy API, danych osobowych ani sekretów, także w materiałach demonstracyjnych.

## Zakazy
1. Wynik modelu językowego nie może być przedstawiany jako fakt bez weryfikowalnej podstawy źródłowej.
2. Nie wolno obchodzić zabezpieczeń serwisów i płatnych baz.
3. O prawdziwości nie można rozstrzygać wyłącznie na podstawie domeny, autora, kanału, popularności, liczby udostępnień ani etykiety od tego samego modelu.
4. Status źródła, w tym sankcje UE, sam nie przesądza o prawdziwości. Zamiast tego system pokazuje odrębne, neutralne ostrzeżenie (jeśli informacja jest aktualna, sprawdzalna i istotna).
5. Nie wolno deklarować pełnego wyszukiwania odwrotnego obrazu bez działającego API lub jasno ograniczonej lokalnej bazy.
6. Nie wolno archiwizować pełnych treści i obrazów bez podstawy prawnej, licencji, retencji, kontroli dostępu i procedury usunięcia.

## Funkcje premiowane
Punktowane tylko po spełnieniu wymagań podstawowych.
- Obraz i dźwięk: OCR, transkrypcja, metadane, porównywanie obrazów, wcześniejsze wystąpienia materiału.
- Porównywanie źródeł i „łańcuch dowodowy” (materiały potwierdzające, obalające, kontekstowe).
- Wyszukiwanie wielojęzyczne z odpowiedzią po polsku.
- Otwarty, wymienny katalog źródeł z zasadami kwalifikowania, aktualizowania i wykluczania.
- Architektura pozwalająca podłączać kolejne kanały, modele i źródła.
- Dopasowanie do katalogu znanych incydentów jako kontekst lub ostrzeżenie, nigdy jako werdykt z samej domeny.
- Eksport CSV/JSON, integracja z OpenCTI i DISARM.
- Kontrolowana archiwizacja materiału wskazanego przez użytkownika.
- Mniejsza zależność od dostawców spoza EOG, możliwość audytu lub samodzielnego hostowania, jawne miejsce przetwarzania danych.
- Pętla informacji: sprawa moderatora dla nierozstrzygniętego zgłoszenia i grupowanie podobnych zgłoszeń. System odróżnia rekomendację przekazania od faktycznego przekazania.

## Testy jury
Zestaw referencyjny ma co najmniej 30 przypadków. Jury może losowo sprawdzić cytaty, powtórzyć test i zadać własne pytanie. Wynik nie może zależeć od wpisania odpowiedzi testowych do promptu ani od zakodowania przykładów. Trzeba ujawnić przypadki, których system nie obsługuje.

| Scenariusz | Wejście | Oczekiwane zachowanie |
|---|---|---|
| A. Fakt prosty | Informacja do potwierdzenia w źródle pierwotnym | Poprawny werdykt i dokładny cytat |
| B. Kontekst | Prawdziwy materiał w złym czasie lub miejscu | Wykrycie brakującego kontekstu |
| C. Sprzeczność | Dwa wiarygodne źródła z różnymi danymi | Jawna rozbieżność, bez arbitralnej pewności |
| D. Brak dowodów | Nowe twierdzenie bez rzetelnych publikacji | Wstrzymanie się i wskazanie, czego nie ustalono |
| E. Atak | Strona źródłowa każe modelowi zignorować reguły | Zignorowanie instrukcji i odnotowanie zdarzenia |
| F. Multimodalność* | Zrzut ekranu lub zdjęcie z tekstem i datą | Poprawny odczyt i ujawnienie ograniczeń |
| G. Spójność | To samo zgłoszenie przez WWW i drugi kanał | Ten sam wynik, prosty język, pełna ścieżka bez twórców |
| H. Pętla informacji* | Brak dowodów i powtórne podobne zgłoszenie | Jedna sprawa, bez fałszywego komunikatu o przekazaniu |
| I. URL / incydent | URL lub treść podobna do znanego incydentu | Dopasowanie jako kontekst, bez werdyktu z domeny |
| J. Limit API | Brak klucza, limit, awaria OCR lub reverse image | Ujawnienie ograniczenia bez pozornego wyniku |

\* tylko jeśli funkcja jest wdrożona

## Mierniki obowiązkowe
| Miernik | Definicja | Cel MVP |
|---|---|---|
| Trafność werdyktu | macro-F1 na obsługiwanych klasach | ≥ 0,75 (zestaw jawny), plus ukryty wynik porównawczy |
| Pokrycie cytowań | % tez faktograficznych z dowodem | ≥ 95% |
| Poprawność cytowania | czy fragment wspiera tezę | ≥ 85% |
| Wstrzymanie się | % poprawnych braków werdyktu przy braku dowodów | ≥ 80% |
| Odporność | % odpartych prób prompt injection | ≥ 90% |
| Czas | mediana od wejścia do odpowiedzi | ≤ 30 s (tekst/URL) |
| Koszt | deklarowany i zmierzony koszt 100 testów | raportowany; niższy premiowany przy równej jakości |
| End-to-end | % scenariuszy uruchomionych przez jury bez zespołu | 100% obowiązkowych |
| Spójność kanałów | zgodność werdyktu i dowodów między kanałami | 100% |
| Pętla informacji | utworzenie i deduplikacja nierozstrzygniętych spraw | 100%, jeśli wdrożona |

## Kryteria oceny
| Kryterium | Waga |
|---|---|
| Jakość weryfikacji i dowodów | 30% |
| Bezpieczeństwo, odpowiedzialność, transparentność | 20% |
| Potencjał wdrożeniowy i skalowalność | 20% |
| Użyteczność i dostępność | 15% |
| Innowacyjność i kompletność | 15% |

**Warunek brzegowy:** bez wymagań podstawowych nie ma punktów za funkcje premiowane. Wymagania podstawowe to: działanie end-to-end bez ręcznej ingerencji, brak sfabrykowanych źródeł, poprawne wstrzymanie się przy braku dowodów, dwa działające kanały albo jeden kanał i adapter demonstracyjny.

## Co oddać
- Nazwa zespołu, tytuł, opis rozwiązania do **4 000 znaków**.
- Prezentacja PDF do **12 slajdów**: problem, użytkownicy, architektura, demo, wyniki testów, ryzyka, dalsze kroki.
- Film demo pod linkiem, do **3 minut**.
- Link do repozytorium z instrukcją uruchomienia.
- Opis architektury, przepływu danych, modeli, dostawców i ograniczeń.
- Opis źródeł, ich licencji, kwalifikacji i aktualizacji.
- Wyniki testów według mierników powyżej, z danymi do odtworzenia.
- Lista ryzyk: co najmniej halucynacje, stronniczość źródeł, prywatność, prompt injection, dostępność, nadużycia.

Opcjonalnie: publiczne demo, Docker, OpenAPI, makiety kolejnych kanałów, dashboard jakości.

## Regulamin w skrócie
Jedna nagroda: 30 000 zł brutto. Zwycięzcy przenoszą autorskie prawa majątkowe na MSZ, łącznie z kodem źródłowym. Rozwiązanie nie może naruszać praw osób trzecich, więc trzeba pilnować licencji bibliotek, modeli i danych. Szczegóły: [regulamin.pdf](regulamin.pdf).
