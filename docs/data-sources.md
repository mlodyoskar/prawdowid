# Dane i źródła

## 1. Katalog źródeł urzędowych
Lista URL-i jest w [`data/sources.ts`](../data/sources.ts) (`SOURCES`): 40 przykładowych źródeł aktualności i ostrzeżeń od organizatora. Tutaj ich nie kopiujemy.

- To przykłady: nie trzeba wdrażać wszystkich.
- Licencji dla listy nie podano. Licencję i warunki korzystania sprawdzamy per domena.
- Tematy: podróże i ostrzeżenia (Odyseusz, MSZ, RCB, RSO), służby i bezpieczeństwo (Policja, PSP, MON, CERT), zdrowie i środowisko (GIS, PAA, GIOŚ), transport (MI, GDDKiA, ULC, UTK, Portal Pasażera), żegluga i pogoda (urzędy morskie, Wody Polskie, IMGW).
- Nasza interpretacja: pytania będą raczej o aktualności, ostrzeżenia, kryzysy, podróże i transport, a nie tylko o geopolitykę.

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
- [Dokumentacja MCP / API](https://veedoo.fibery.io/Documentation/Guides/EUvsDisinfo-MCP.-API.-%2807.2025%29-262?sharing-key=b10c22de-b630-4efc-824d-e117d530a4c8)
- [Podłączenie narzędzi AI (np. Claude Desktop) do serwera MCP](https://veedoo.fibery.io/Documentation/Guides/Connect-AI-tools-assistans-for-MCP-server-(5-05-2026)-268?sharing-key=91744a47-cc53-4904-a4f4-29ef0533d304)

> ⚠️ Dwa ostatnie linki zawierają prywatny `sharing-key`. Usunąć je przed upublicznieniem repo lub oddaniem projektu.

Licencja, schemat i rozmiar danych EUvsDisinfo nie są znane. Trzeba je opisać w dokumentacji źródeł do oddania.

## 4. Czego organizator nie udostępnił
- Jawnego zestawu testowego (przykładowe twierdzenia z oczekiwanymi werdyktami).
- Gotowego pliku z bazą incydentów (JSON/CSV) i informacji o licencji danych.

## 5. Wymagania wobec korpusu (z treści zadania)
- Co najmniej **100 dokumentów lub rekordów**, **10 domen** i **2 typy źródeł**: pierwotne lub urzędowe oraz wiarygodne wtórne.
- Lista źródeł dostępna do audytu, z licencją, sposobem kwalifikacji i aktualizacji.
- Przy każdym dokumencie: tytuł, wydawca, data publikacji, data pobrania, URL.
- Zakaz obchodzenia zabezpieczeń serwisów i płatnych baz.
