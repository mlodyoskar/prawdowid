# Koszt kanału WhatsApp: 1000 zapytań

Stan na 22.11.2026. Bez kosztów modelu, OCR i Google Fact Check, które są takie same jak dla WWW.

## Wynik

| Wariant                                                 | Płatne wiadomości | Koszt                   |
| ------------------------------------------------------- | ----------------- | ----------------------- |
| 1000 zapytań w miesiącu, jedyny ruch na numerze         | 0 (darmowa pula)  | **0 €**                 |
| Kolejne 1000 zapytań po wyczerpaniu darmowej puli       | 1000              | **10,10 €** (12,20 USD) |
| Kolejne 1000 zapytań, +10% wiadomości pomocniczych      | 1100              | 11,11 € (13,42 USD)     |
| Dla porównania: stara wersja z wiadomością „Sprawdzam…” | 2000              | 20,20 € (24,40 USD)     |

Przy kursie około 4,25 zł/EUR kolejne 1000 zapytań kosztuje około 43 zł. Meta nie rozlicza w PLN; kurs jest tu tylko orientacyjny.

## Stawka

Cennik Meta „Cost per message … effective October 1, 2026”, wiersz **Poland**:

| Kategoria      | USD    | EUR    |
| -------------- | ------ | ------ |
| Service        | 0.0122 | 0.0101 |
| Utility        | 0.0122 | 0.0101 |
| Authentication | 0.0122 | 0.0101 |
| Marketing      | 0.0366 | 0.0303 |

Źródło: pliki „USD list rates” i „EUR list rates” podlinkowane w sekcji rate cards na stronie [Pricing on the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing). Pliki mają rozszerzenie `.csv`, ale to arkusze xlsx. Linki do nich są tymczasowe (CDN Meta), więc odsyłamy do strony, nie do plików.

Kanał wysyła tylko wiadomości **service**: zwykłe wiadomości tekstowe w oknie 24 h po wiadomości użytkownika. Szablonów (utility, marketing) nie wysyła.

## Zasady naliczania (strona Meta, wyżej)

- „Each business phone number has one free tier of 1,000 delivered service messages per month. Meta charges as of the 1,001st service message per month.” Pula jest **na numer**, odnawia się co miesiąc o północy w strefie czasowej konta.
- Opłata tylko za wiadomość **dostarczoną**. Wiadomości od użytkownika są darmowe.
- Bez metody płatności Meta dostarcza wiadomości z darmowej puli, a **kolejnych nie dostarcza**. Przed produkcją trzeba podpiąć płatność, inaczej po 1000 odpowiedziach bot milknie.
- Dla wiadomości service nie ma rabatów za wolumen (progi dotyczą tylko utility i authentication).
- Stawka zależy od kraju numeru **odbiorcy**. Tabela dotyczy numerów +48; zapytanie z numeru zagranicznego kosztuje według stawki jego rynku.
- Wyjątek: kwalifikujące się instytucje rządowe i organizacje non-profit mają wiadomości service zwolnione z opłat do 31.12.2027 (`paid_exempt`). Jeśli kanał prowadzi instytucja publiczna, koszt może wynosić 0. Kwalifikację potwierdza Meta, nie sprawdzaliśmy jej.

## Ile wiadomości na zapytanie

Według kodu w [apps/api/src/whatsapp](../apps/api/src/whatsapp):

- **1 wiadomość:** odpowiedź z werdyktem. Jest przycinana do 4096 znaków, więc to zawsze jedna wiadomość.
- **0 wiadomości:** „przeczytano” z „pisze…” (`markReadTyping`), także ponawiane co 20 s. Meta odpowiada `{ success: true }` i nie tworzy wiadomości, a płaci się za dostarczone wiadomości. Dokumentacja Meta nie mówi tego jednak wprost, więc to nasz wniosek. Warto sprawdzić na rachunku po pierwszym miesiącu.
- **Poza zapytaniami:** `POMOC`, `USUŃ`, przekroczony limit, nieobsługiwany typ, za długi tekst, nieudane pobranie zdjęcia, pełna kolejka. Każda taka odpowiedź to jedna płatna wiadomość. Wariant „+10%” w tabeli zakłada jedną taką wiadomość na dziesięć zapytań.

## Koszty stałe (niezależne od liczby zapytań)

- Numer telefonu: osobna karta, rzędu kilku–kilkunastu zł miesięcznie. Trzeba ją utrzymać, bo numer bywa potrzebny do ponownej weryfikacji.
- Hosting: webhook działa w tym samym API co WWW, więc nie dodaje osobnej usługi.
- Weryfikacja firmy w Meta i nazwa wyświetlana: bez opłat.

## Jak przeliczyć dla innej liczby zapytań

```
wiadomości = zapytania × 1,1
koszt (EUR) = max(0, wiadomości − 1000) × 0,0101
```

Przy kilku numerach pula 1000 przysługuje każdemu z nich.
