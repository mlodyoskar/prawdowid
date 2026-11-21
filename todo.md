# TODO

Odłożone decyzje dotyczące agenta weryfikującego. Wracamy do nich po pierwszych ewaluacjach.

- [x] **Spójność kanałów i powtórzeń (miernik: 100%).** Jeden wynik na znormalizowane zgłoszenie, temperatura 0, WhatsApp pokazuje publikacje-podstawy: [docs/agent.md](docs/agent.md#spójność-kanałów-i-powtórzeń). Otwarte: parafrazy i zrzuty ekranu między kanałami.
- [ ] **Sprawa analityka i deduplikacja podobnych zgłoszeń** (scenariusz H, makieta 5). Poza pierwszą wersją. Wymagania wspominają o powiadomieniu moderatora także poza funkcjami premiowanymi: patrz [docs/open-questions.md](docs/open-questions.md).
- [ ] **EUvsDisinfo jako kontekst lub ostrzeżenie** (scenariusz I). Poza pierwszą wersją.
- [ ] **Źródła obcojęzyczne z tłumaczeniem cytatu.** Poza pierwszą wersją.
- [ ] **Makiety do poprawy:** ekran „Dowody” cytuje nato.int, a agent nie pobiera stron spoza katalogu. W takich przypadkach linkujemy do źródła z katalogu (np. Odyseusz).
- [ ] **Embeddingi w wyszukiwaniu korpusu.** Zaczynamy od pełnotekstowego. Wyszukiwanie wektorowe dojdzie za tym samym interfejsem `corpus.search`, gdy ewaluacje pokażą, gdzie słowa kluczowe nie wystarczają.
- [ ] **Wykrywanie obrazów generowanych przez AI.** Poza zakresem: detektory są zawodne, a wyniku modelu nie wolno przedstawiać jako faktu. Jeśli wróci, to tylko jako sygnał z opisanym marginesem błędu.
- [ ] **Liczba twierdzeń na zgłoszenie** (`maxClaims`, teraz 3). Do dobrania na danych deweloperskich pod jakość, czas i koszt.
