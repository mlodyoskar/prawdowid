# Prawdowid: dodatkowe informacje (poza PDF-ami)

## Lista źródeł od organizatora
40 przykładowych źródeł aktualności i ostrzeżeń. To przykłady: nie trzeba wdrażać wszystkich. Wspólnej licencji dla listy nie podano.

- **Podróże, ostrzeżenia, administracja:** [Odyseusz](https://odyseusz.gov.pl/), [ostrzeżenia Gov.pl](https://www.gov.pl/web/gov/ostrzezenia), [ostrzeżenia – Mazowsze](https://www.gov.pl/web/gov/ostrzezenia#/_/mazowieckie/wszystkie), [Regionalny System Ostrzegania](https://www.gov.pl/web/mswia/regionalny-system-ostrzegania), [RCB – raport dobowy](https://www.gov.pl/web/rcb/raport-dobowy3), [RCB](https://www.gov.pl/web/rcb/strona-glowna-rzadowego-centrum-bezpieczenstwa), [MSWiA](https://www.gov.pl/web/mswia), [MSZ – informacje dla podróżujących](https://www.gov.pl/web/dyplomacja/informacje-dla-podrozujacych), [KPRM](https://www.gov.pl/web/premier)
- **Służby, zdrowie, środowisko, cyberbezpieczeństwo:** [KG PSP – aktualności](https://www.gov.pl/web/kgpsp/aktualnosci), [Policja – aktualności](https://policja.pl/pol/aktualnosci), [Policja mazowiecka – aktualności](https://mazowiecka.policja.gov.pl/ra/aktualnosci/aktualnosci), [MON – aktualności](https://www.gov.pl/web/obrona-narodowa/aktualnosci5), [GIS – ostrzeżenia](https://www.gov.pl/web/gis/ostrzezenia), [PAA](https://www.gov.pl/web/paa/panstwowa-agencja-atomistyki), [PAA – monitoring](https://monitoring.paa.gov.pl/), [GIOŚ – jakość powietrza](https://powietrze.gios.gov.pl/pjp/), [CERT Polska – komunikaty](https://moje.cert.pl/komunikaty/)
- **Infrastruktura i drogi:** [Ministerstwo Infrastruktury](https://www.gov.pl/web/infrastruktura), [aktualności](https://www.gov.pl/web/infrastruktura/aktualnosci), [prawa pasażerów](https://www.gov.pl/web/infrastruktura/prawa-pasazerow), [infolinia dla obywatela](https://www.gov.pl/web/infrastruktura/infolinia-dla-obywatela), [dane kontaktowe](https://www.gov.pl/web/infrastruktura/dane-kontaktowe), [GDDKiA – informacje drogowe](https://drogi.gddkia.gov.pl/informacje-drogowe), [GDDKiA – mapa](https://drogi.gddkia.gov.pl/mapy/mapa-informacji-drogowej), [GDDKiA – lista utrudnień](https://drogi.gddkia.gov.pl/informacje-drogowe/lista-utrudnien), [GDDKiA – informacja drogowa (Gov.pl)](https://www.gov.pl/web/gddkia/informacja-drogowa---19-111)
- **Lotnictwo i kolej:** [ULC](https://ulc.gov.pl/), [ULC – prawa pasażera](https://ulc.gov.pl/prawa-pasazera), [ULC – poradnik](https://ulc.gov.pl/prawa-pasazera/poradnik-dla-pasazerow), [Portal Pasażera](https://portalpasazera.pl/), [UTK – pasażerowie](https://utk.gov.pl/pl/pasazerowie), [Straż Ochrony Kolei](https://kgsok.pl/)
- **Żegluga, pogoda, hydrologia:** [Morska Służba Poszukiwania i Ratownictwa](https://www.sar.gov.pl/), [Urząd Morski w Gdyni](https://www.umgdy.gov.pl/), [Urząd Morski w Szczecinie – warunki żeglugi](https://www.ums.gov.pl/bezpieczenstwo-morskie/warunki-zeglugi), [Wody Polskie – komunikaty nawigacyjne](https://www.gov.pl/web/wody-polskie/komunikaty-nawigacyjne), [IMGW – meteorologia](https://meteo.imgw.pl/), [IMGW – hydrologia](https://hydro.imgw.pl/), [IMGW – Bałtyk](https://baltyk.imgw.pl/)

Wniosek (nasza interpretacja): lista wskazuje na pytania o aktualności, ostrzeżenia, kryzysy, podróże i transport, a nie tylko o geopolitykę.

## Bazy zweryfikowanych informacji (fact-checki)
- [Google Fact Check Explorer](https://toolbox.google.com/factcheck/explorer/search/list:recent;hl=pl)
- [Google Fact Check Tools API (REST)](https://developers.google.com/fact-check/tools/api/reference/rest?hl=pl)

## Baza incydentów = EUvsDisinfo
- Organizator nie dał gotowego pliku JSON/CSV. Bazą incydentów jest EUvsDisinfo.
- Zastosowanie: sprawdzanie, czy podobne twierdzenie pojawiało się we wrogich operacjach informacyjnych. Integracja jest **opcjonalna**.
- [Instrukcja pobrania wszystkich artykułów i przypadków](https://euvsdisinfo.eu/public-docs/How_to_grab_all_Articles_and_Cases_from_disinfo.pdf)
- Dostęp wymaga **tokenu**: przez [formularz EUvsDisinfo](https://euvsdisinfo.eu/about/#aaad5def9c9014028bbdba28e341feb7) albo od mentorów MSZ. EUvsDisinfo udostępnia też dostęp przez MCP.
- Licencja, schemat i rozmiar danych nie zostały podane.

## Czego organizator nie udostępnił
- Jawnego zestawu testowego (przykładowe twierdzenia z oczekiwanymi werdyktami).
- Gotowego pliku z bazą incydentów i informacji o licencji danych.

## Otwarte pytania (do ustalenia z mentorami)
- Czy adapter demonstracyjny wystarczy zamiast prawdziwego drugiego kanału i co uznają za „kanał równoważny”?
- Jak jury uruchomi rozwiązanie: publiczny URL czy Docker/lokalnie? Kto zapewnia klucze API podczas oceny?
- Czy wolno wyszukiwać w internecie na żywo, czy tylko w zamkniętym korpusie?
- Jak liczone jest macro-F1 (po twierdzeniu czy po zgłoszeniu)?
- Czy powiadomienie moderatora jest wymagane w MVP?
