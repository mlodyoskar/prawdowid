# Dane i źródła

## 1. Katalog źródeł urzędowych

Lista URL-i jest w [`data/sources.ts`](../data/sources.ts) (`SOURCES`): 40 przykładowych źródeł aktualności i ostrzeżeń od organizatora. Tutaj ich nie kopiujemy.

- To przykłady: nie trzeba wdrażać wszystkich.
- Licencji dla listy nie podano. Licencję i warunki korzystania sprawdzamy per domena.
- Tematy: podróże i ostrzeżenia (Odyseusz, MSZ, RCB, RSO), służby i bezpieczeństwo (Policja, PSP, MON, CERT), zdrowie i środowisko (GIS, PAA, GIOŚ), transport (MI, GDDKiA, ULC, UTK, Portal Pasażera), żegluga i pogoda (urzędy morskie, Wody Polskie, IMGW).
- Nasza interpretacja: pytania będą raczej o aktualności, ostrzeżenia, kryzysy, podróże i transport, a nie tylko o geopolitykę.

### Snapshot korpusu v8

[`data/corpus/snapshot.jsonl`](../data/corpus/snapshot.jsonl) w wersji `snapshot-2026-11-22-v8` to połączenie dwóch pobrań, bez żadnej ręcznej zmiany treści:

- wszystkie 232 dokumenty z `snapshot-2026-11-21-v3`, w treści z tamtego pobrania (z linią daty w tekście stron gov.pl);
- 395 dokumentów z `snapshot-2026-11-22-v7`, których adresów nie było w v3 (14 nowych źródeł: Odyseusz, Straż Graniczna, PZH, IMGW, MSZ, ABW, Prokuratura Krajowa i inne).

Dokumenty v3, które scraper v7 pobrał ponownie, zostały w wersji v3, a dokumenty, których v7 już nie znalazł, nie wypadły. Kluczem jest adres URL, identyfikatory `doc-…` są nadane od nowa. Razem 627 dokumentów z 19 serwisów.

## 2. Bazy zweryfikowanych informacji (fact-checki)

W [`data/sources.ts`](../data/sources.ts) (`FACT_CHECK_SOURCES`): Google Fact Check Explorer i Google Fact Check Tools API (REST).

## 3. Baza incydentów: EUvsDisinfo

Bazą incydentów jest EUvsDisinfo, a nie plik JSON/CSV. Integracja jest **opcjonalna**. Służy do sprawdzania, czy podobne twierdzenie pojawiało się we wrogich operacjach informacyjnych. Według wymagań dopasowanie do incydentu to kontekst lub ostrzeżenie, a nie podstawa werdyktu.

**Dostęp:**

- Wymagany token, przechowywany w zmiennej `EUVSDISINFO_API_KEY` (patrz [`.env.example`](../.env.example)), nigdy w repo.
- Token można dostać przez [formularz EUvsDisinfo](https://euvsdisinfo.eu/about/#aaad5def9c9014028bbdba28e341feb7) albo od mentorów MSZ.
- Sposoby pobierania: serwer MCP / API albo masowe pobranie artykułów i przypadków.

**Dokumentacja:**

- [Instrukcja masowego pobrania artykułów i przypadków (PDF)](https://euvsdisinfo.eu/public-docs/How_to_grab_all_Articles_and_Cases_from_disinfo.pdf)
- Dokumentacja MCP / API i instrukcja podłączenia narzędzi AI do serwera MCP: udostępniana przez EUvsDisinfo razem z tokenem (link prywatny, nie trzymamy go w repo).

Licencja, schemat i rozmiar danych EUvsDisinfo nie są znane. Trzeba je opisać w dokumentacji źródeł do oddania.

## 4. Czego organizator nie udostępnił

- Jawnego zestawu testowego (przykładowe twierdzenia z oczekiwanymi werdyktami).
- Gotowego pliku z bazą incydentów (JSON/CSV) i informacji o licencji danych.

## 5. Wymagania wobec korpusu (z treści zadania)

- Co najmniej **100 dokumentów lub rekordów**, **10 domen** i **2 typy źródeł**: pierwotne lub urzędowe oraz wiarygodne wtórne.
- Lista źródeł dostępna do audytu, z licencją, sposobem kwalifikacji i aktualizacji.
- Przy każdym dokumencie: tytuł, wydawca, data publikacji, data pobrania, URL.
- Zakaz obchodzenia zabezpieczeń serwisów i płatnych baz.
