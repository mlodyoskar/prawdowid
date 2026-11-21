export const SOURCES = [
  { name: 'Odyseusz', url: 'https://odyseusz.gov.pl/' },
  { name: 'Ostrzeżenia gov.pl', url: 'https://www.gov.pl/web/gov/ostrzezenia' },
  {
    name: 'Ostrzeżenia gov.pl – mazowieckie',
    url: 'https://www.gov.pl/web/gov/ostrzezenia#/_/mazowieckie/wszystkie',
  },
  {
    name: 'MSWiA – Regionalny System Ostrzegania',
    url: 'https://www.gov.pl/web/mswia/regionalny-system-ostrzegania',
  },
  { name: 'RCB – raport dobowy', url: 'https://www.gov.pl/web/rcb/raport-dobowy3' },
  { name: 'KG PSP – aktualności', url: 'https://www.gov.pl/web/kgpsp/aktualnosci' },
  { name: 'Policja – aktualności', url: 'https://policja.pl/pol/aktualnosci' },
  {
    name: 'KSP Mazowiecka – aktualności',
    url: 'https://mazowiecka.policja.gov.pl/ra/aktualnosci/aktualnosci',
  },
  { name: 'MON – aktualności', url: 'https://www.gov.pl/web/obrona-narodowa/aktualnosci5' },
  { name: 'GIS – ostrzeżenia', url: 'https://www.gov.pl/web/gis/ostrzezenia' },
  {
    name: 'Państwowa Agencja Atomistyki',
    url: 'https://www.gov.pl/web/paa/panstwowa-agencja-atomistyki',
  },
  { name: 'PAA – monitoring radiacyjny', url: 'https://monitoring.paa.gov.pl/' },
  { name: 'GIOŚ – jakość powietrza', url: 'https://powietrze.gios.gov.pl/pjp/' },
  { name: 'CERT Polska – komunikaty', url: 'https://moje.cert.pl/komunikaty/' },
  { name: 'Ministerstwo Infrastruktury', url: 'https://www.gov.pl/web/infrastruktura' },
  { name: 'MI – aktualności', url: 'https://www.gov.pl/web/infrastruktura/aktualnosci' },
  { name: 'MI – prawa pasażerów', url: 'https://www.gov.pl/web/infrastruktura/prawa-pasazerow' },
  {
    name: 'MI – infolinia dla obywatela',
    url: 'https://www.gov.pl/web/infrastruktura/infolinia-dla-obywatela',
  },
  { name: 'MI – dane kontaktowe', url: 'https://www.gov.pl/web/infrastruktura/dane-kontaktowe' },
  { name: 'GDDKiA – informacje drogowe', url: 'https://drogi.gddkia.gov.pl/informacje-drogowe' },
  {
    name: 'GDDKiA – mapa informacji drogowej',
    url: 'https://drogi.gddkia.gov.pl/mapy/mapa-informacji-drogowej',
  },
  {
    name: 'GDDKiA – lista utrudnień',
    url: 'https://drogi.gddkia.gov.pl/informacje-drogowe/lista-utrudnien',
  },
  {
    name: 'GDDKiA – informacja drogowa 19 111',
    url: 'https://www.gov.pl/web/gddkia/informacja-drogowa---19-111',
  },
  { name: 'ULC', url: 'https://ulc.gov.pl/' },
  { name: 'ULC – prawa pasażera', url: 'https://ulc.gov.pl/prawa-pasazera' },
  {
    name: 'ULC – poradnik dla pasażerów',
    url: 'https://ulc.gov.pl/prawa-pasazera/poradnik-dla-pasazerow',
  },
  { name: 'Portal Pasażera', url: 'https://portalpasazera.pl/' },
  { name: 'UTK – pasażerowie', url: 'https://utk.gov.pl/pl/pasazerowie' },
  { name: 'KGSOK', url: 'https://kgsok.pl/' },
  { name: 'Morska Służba Poszukiwania i Ratownictwa', url: 'https://www.sar.gov.pl/' },
  { name: 'Urząd Morski w Gdyni', url: 'https://www.umgdy.gov.pl/' },
  {
    name: 'Urząd Morski w Szczecinie – warunki żeglugi',
    url: 'https://www.ums.gov.pl/bezpieczenstwo-morskie/warunki-zeglugi',
  },
  {
    name: 'Wody Polskie – komunikaty nawigacyjne',
    url: 'https://www.gov.pl/web/wody-polskie/komunikaty-nawigacyjne',
  },
  { name: 'IMGW – meteo', url: 'https://meteo.imgw.pl/' },
  { name: 'IMGW – hydro', url: 'https://hydro.imgw.pl/' },
  { name: 'IMGW – Bałtyk', url: 'https://baltyk.imgw.pl/' },
  {
    name: 'Rządowe Centrum Bezpieczeństwa',
    url: 'https://www.gov.pl/web/rcb/strona-glowna-rzadowego-centrum-bezpieczenstwa',
  },
  { name: 'MSWiA', url: 'https://www.gov.pl/web/mswia' },
  {
    name: 'MSZ – informacje dla podróżujących',
    url: 'https://www.gov.pl/web/dyplomacja/informacje-dla-podrozujacych',
  },
  { name: 'Kancelaria Premiera', url: 'https://www.gov.pl/web/premier' },
] as const;

/** Baza weryfikatorów */
export const FACT_CHECK_SOURCES = [
  {
    name: 'Google Fact Check Explorer',
    url: 'https://toolbox.google.com/factcheck/explorer/search/list:recent;hl=pl',
  },
  {
    name: 'Google Fact Check Tools API',
    url: 'https://developers.google.com/fact-check/tools/api/reference/rest?hl=pl',
  },
] as const;
