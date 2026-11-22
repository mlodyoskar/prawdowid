/**
 * Katalog źródeł z opisem, jak z każdego pobierać dane.
 * Typy sprawdzone ręcznie 2026-11-21 (fetch bez JS + podgląd ruchu sieciowego w przeglądarce).
 */

/** Jak często i po co pobieramy. */
export type SourceKind =
  | 'news' //      aktualności/ostrzeżenia: cykliczne pobieranie do korpusu
  | 'reference' // strony informacyjne: snapshot rzadko, ponownie tylko po zmianie treści
  | 'live'; //     dane bieżące: odpytywane w chwili pytania, nie trafiają do korpusu

/** Jak technicznie wyciągamy treść. */
export type FetchStrategy =
  | 'govpl-list' // gov.pl, lista wpisów: `.event .date` + `.title a`, paginacja `?page=N&size=10`
  | 'govpl-page' // gov.pl, pojedyncza strona: treść w `#main-content`
  | 'rss' //        kanał RSS/Atom (adresy w `feeds`)
  | 'json-api' //   publiczne API JSON (adresy w `endpoints`)
  | 'html' //       zwykły HTML renderowany po stronie serwera (Readability / JSON-LD)
  | 'spa' //        aplikacja JS bez znalezionego API: wymaga headless albo pomijamy
  | 'blocked'; //   ochrona antybotowa (Imperva/Incapsula): nie pobieramy automatycznie, nie obchodzimy

export type Source = {
  name: string;
  url: string;
  /** `zrodlo_id`, pod którym źródło występuje w snapshocie korpusu. Import odrzuca id spoza katalogu. */
  corpusId?: string;
  /** Warunki ponownego wykorzystania treści, tak jak podaje je serwis. Wymagane przy `corpusId`. */
  licence?: string;
  kind: SourceKind;
  strategy: FetchStrategy;
  feeds?: readonly string[];
  /** `{placeholder}` oznacza parametr do podstawienia. */
  endpoints?: readonly string[];
  notes?: string;
};

const RSO_API =
  'https://www.gov.pl/api/data/proxy/rso/komunikatyxml/{wojewodztwo}/{kategoria}/{strona}?_format=json';
const ODYSEUSZ_API = [
  'https://odyseusz.gov.pl/api/v1/informacje/profile-panstw/mini',
  'https://odyseusz.gov.pl/api/v1/informacje/profile-panstw/{kodISO}',
  'https://odyseusz.gov.pl/api/v1/informacje/strona-glowna/baner-sytuacje-kryzysowe',
] as const;
// Warunki wykorzystania sprawdzone 2026-11-21 na stronach serwisów (stopka, nota prawna, regulamin).
const LICENCE_GOVPL =
  'CC BY-SA 4.0 dla treści tekstowych (stopka gov.pl); zdjęcia i wideo: CC BY-NC-ND 4.0.';
const LICENCE_POLICJA =
  'Brak nazwanej licencji. Nota prawna policja.pl: wykorzystanie materiałów z podaniem źródła.';
const LICENCE_POLICJA_UNIT =
  'Nie sprawdzono osobno dla tego serwisu jednostki. Dla policja.pl: wykorzystanie z podaniem źródła.';
const LICENCE_CERT =
  '© NASK, wszystkie prawa zastrzeżone (stopka moje.cert.pl). Brak licencji na ponowne wykorzystanie.';
const LICENCE_RSO =
  'Brak licencji. Dane XML opisane jako dostępne publicznie (komunikaty.tvp.pl/Info/Integration).';
const IMPERVA_BLOCKED = 'Imperva/Incapsula zwraca stronę z wyzwaniem JS zamiast treści.';

export const SOURCES = [
  {
    name: 'Odyseusz',
    url: 'https://odyseusz.gov.pl/',
    kind: 'news',
    strategy: 'json-api',
    endpoints: ODYSEUSZ_API,
    notes:
      'SPA (Angular). Lista krajów z /mini, ostrzeżenia dla kraju w polu trescPowiadomieniaDluga.',
  },
  {
    name: 'Ostrzeżenia gov.pl',
    corpusId: 'rso',
    licence: LICENCE_RSO,
    url: 'https://www.gov.pl/web/gov/ostrzezenia',
    kind: 'news',
    strategy: 'json-api',
    endpoints: [RSO_API],
    notes:
      'SPA (Vue), dane z RSO. wojewodztwo: wszystkie|mazowieckie|…; kategoria: meteorologiczne|hydrologiczne|informacje-drogowe|ogolne|stany-wod; strona od 0, 20 na stronę.',
  },
  {
    name: 'Ostrzeżenia gov.pl – mazowieckie',
    url: 'https://www.gov.pl/web/gov/ostrzezenia#/_/mazowieckie/wszystkie',
    kind: 'news',
    strategy: 'json-api',
    endpoints: [RSO_API.replace('{wojewodztwo}', 'mazowieckie')],
    notes: 'To samo API co wyżej, z filtrem województwa.',
  },
  {
    name: 'MSWiA – Regionalny System Ostrzegania',
    url: 'https://www.gov.pl/web/mswia/regionalny-system-ostrzegania',
    kind: 'reference',
    strategy: 'govpl-page',
  },
  {
    name: 'RCB – raport dobowy',
    url: 'https://www.gov.pl/web/rcb/raport-dobowy3',
    kind: 'news',
    strategy: 'govpl-page',
    notes: 'Jedna strona nadpisywana codziennie: pobierać raz na dobę i zapisywać wersje.',
  },
  {
    name: 'KG PSP – aktualności',
    corpusId: 'govpl-kgpsp',
    licence: LICENCE_GOVPL,
    url: 'https://www.gov.pl/web/kgpsp/aktualnosci',
    kind: 'news',
    strategy: 'govpl-list',
  },
  {
    name: 'Policja – aktualności',
    corpusId: 'policja-kgp',
    licence: LICENCE_POLICJA,
    url: 'https://policja.pl/pol/aktualnosci',
    kind: 'news',
    strategy: 'rss',
    feeds: [
      'https://policja.pl/dokumenty/rss/1-rss-1.rss',
      'https://policja.pl/dokumenty/rss/1-rss-o-4.rss',
    ],
  },
  {
    name: 'KSP Mazowiecka – aktualności',
    corpusId: 'policja-mazowiecka',
    licence:
      'Brak nazwanej licencji. Strona „Prawa autorskie”: korzystanie nie wymaga zgody KGP, z podaniem źródła.',
    url: 'https://mazowiecka.policja.gov.pl/ra/aktualnosci/aktualnosci',
    kind: 'news',
    strategy: 'rss',
    feeds: [
      'https://mazowiecka.policja.gov.pl/dokumenty/rss/271-rss-o-1488.rss',
      'https://mazowiecka.policja.gov.pl/dokumenty/rss/271-rss-o-1487.rss',
    ],
  },
  {
    name: 'Policja – KWP Wrocław',
    corpusId: 'wroclaw-policja-gov-pl',
    licence: LICENCE_POLICJA_UNIT,
    url: 'https://wroclaw.policja.gov.pl/',
    kind: 'news',
    strategy: 'html',
    notes:
      'Dodane przy imporcie snapshotu v3: dokumenty z tego serwisu są w korpusie. Do potwierdzenia przez autora scrapera.',
  },
  {
    name: 'Policja – CBZC',
    corpusId: 'cbzc-policja-gov-pl',
    licence: LICENCE_POLICJA_UNIT,
    url: 'https://cbzc.policja.gov.pl/',
    kind: 'news',
    strategy: 'html',
    notes:
      'Dodane przy imporcie snapshotu v3: dokumenty z tego serwisu są w korpusie. Do potwierdzenia przez autora scrapera.',
  },
  {
    name: 'Policja – CBŚP',
    corpusId: 'cbsp-policja-pl',
    licence: LICENCE_POLICJA_UNIT,
    url: 'https://cbsp.policja.pl/',
    kind: 'news',
    strategy: 'html',
    notes:
      'Dodane przy imporcie snapshotu v3: dokumenty z tego serwisu są w korpusie. Do potwierdzenia przez autora scrapera.',
  },
  {
    name: 'Policja – KWP Kraków',
    corpusId: 'malopolska-policja-gov-pl',
    licence: LICENCE_POLICJA_UNIT,
    url: 'https://malopolska.policja.gov.pl/',
    kind: 'news',
    strategy: 'html',
    notes:
      'Dodane przy imporcie snapshotu v3: dokumenty z tego serwisu są w korpusie. Do potwierdzenia przez autora scrapera.',
  },
  {
    name: 'Policja – KWP Gorzów Wielkopolski',
    corpusId: 'lubuska-policja-gov-pl',
    licence: LICENCE_POLICJA_UNIT,
    url: 'https://lubuska.policja.gov.pl/',
    kind: 'news',
    strategy: 'html',
    notes:
      'Dodane przy imporcie snapshotu v3: dokumenty z tego serwisu są w korpusie. Do potwierdzenia przez autora scrapera.',
  },
  {
    name: 'Policja – KWP Bydgoszcz',
    corpusId: 'kujawsko-pomorska-policja-gov-pl',
    licence: LICENCE_POLICJA_UNIT,
    url: 'https://kujawsko-pomorska.policja.gov.pl/',
    kind: 'news',
    strategy: 'html',
    notes:
      'Dodane przy imporcie snapshotu v3: dokumenty z tego serwisu są w korpusie. Do potwierdzenia przez autora scrapera.',
  },
  {
    name: 'MON – aktualności',
    corpusId: 'govpl-obrona-narodowa',
    licence: LICENCE_GOVPL,
    url: 'https://www.gov.pl/web/obrona-narodowa/aktualnosci5',
    kind: 'news',
    strategy: 'govpl-list',
  },
  {
    name: 'GIS – ostrzeżenia',
    corpusId: 'govpl-gis',
    licence: LICENCE_GOVPL,
    url: 'https://www.gov.pl/web/gis/ostrzezenia',
    kind: 'news',
    strategy: 'govpl-list',
  },
  {
    name: 'Państwowa Agencja Atomistyki',
    corpusId: 'govpl-paa',
    licence: LICENCE_GOVPL,
    url: 'https://www.gov.pl/web/paa/panstwowa-agencja-atomistyki',
    kind: 'reference',
    strategy: 'govpl-page',
  },
  {
    name: 'PAA – monitoring radiacyjny',
    url: 'https://monitoring.paa.gov.pl/',
    kind: 'live',
    strategy: 'json-api',
    endpoints: [
      'https://monitoring.paa.gov.pl/_api/maps/RadiationMessage/pl-PL',
      'https://monitoring.paa.gov.pl/geoserver/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=paa:kcad_siec_pms_moc_dawki_mapa&outputFormat=application/json&viewparams=date_from:{od};date_to:{do}',
    ],
    notes:
      'SPA (Angular), przekierowuje na /maps-portal/. Komunikat + pomiary mocy dawki (GeoJSON z GeoServera).',
  },
  {
    name: 'GIOŚ – jakość powietrza',
    url: 'https://powietrze.gios.gov.pl/pjp/',
    kind: 'live',
    strategy: 'json-api',
    endpoints: ['https://api.gios.gov.pl/pjp-api/v1/rest/station/findAll'],
    notes: 'Strona jest w HTML, ale dane pomiarowe bierzemy z publicznego API GIOŚ.',
  },
  {
    name: 'CERT Polska – komunikaty',
    corpusId: 'cert-polska',
    licence: LICENCE_CERT,
    url: 'https://moje.cert.pl/komunikaty/',
    kind: 'news',
    strategy: 'rss',
    feeds: ['https://moje.cert.pl/advisories/feed/'],
  },
  {
    name: 'Ministerstwo Infrastruktury',
    url: 'https://www.gov.pl/web/infrastruktura',
    kind: 'reference',
    strategy: 'govpl-page',
  },
  {
    name: 'MI – aktualności',
    corpusId: 'govpl-infrastruktura',
    licence: LICENCE_GOVPL,
    url: 'https://www.gov.pl/web/infrastruktura/aktualnosci',
    kind: 'news',
    strategy: 'govpl-list',
  },
  {
    name: 'MI – prawa pasażerów',
    url: 'https://www.gov.pl/web/infrastruktura/prawa-pasazerow',
    kind: 'reference',
    strategy: 'govpl-page',
  },
  {
    name: 'MI – infolinia dla obywatela',
    url: 'https://www.gov.pl/web/infrastruktura/infolinia-dla-obywatela',
    kind: 'reference',
    strategy: 'govpl-page',
  },
  {
    name: 'MI – dane kontaktowe',
    url: 'https://www.gov.pl/web/infrastruktura/dane-kontaktowe',
    kind: 'reference',
    strategy: 'govpl-page',
  },
  {
    name: 'GDDKiA – informacje drogowe',
    url: 'https://drogi.gddkia.gov.pl/informacje-drogowe',
    kind: 'live',
    strategy: 'blocked',
    notes: `${IMPERVA_BLOCKED} Zastępczo: RSO, kategoria informacje-drogowe.`,
  },
  {
    name: 'GDDKiA – mapa informacji drogowej',
    url: 'https://drogi.gddkia.gov.pl/mapy/mapa-informacji-drogowej',
    kind: 'live',
    strategy: 'blocked',
    notes: IMPERVA_BLOCKED,
  },
  {
    name: 'GDDKiA – lista utrudnień',
    url: 'https://drogi.gddkia.gov.pl/informacje-drogowe/lista-utrudnien',
    kind: 'live',
    strategy: 'blocked',
    notes: IMPERVA_BLOCKED,
  },
  {
    name: 'GDDKiA – informacja drogowa 19 111',
    url: 'https://www.gov.pl/web/gddkia/informacja-drogowa---19-111',
    kind: 'reference',
    strategy: 'govpl-page',
  },
  {
    name: 'ULC',
    url: 'https://ulc.gov.pl/',
    kind: 'reference',
    strategy: 'blocked',
    notes: IMPERVA_BLOCKED,
  },
  {
    name: 'ULC – prawa pasażera',
    url: 'https://ulc.gov.pl/prawa-pasazera',
    kind: 'reference',
    strategy: 'blocked',
    notes: IMPERVA_BLOCKED,
  },
  {
    name: 'ULC – poradnik dla pasażerów',
    url: 'https://ulc.gov.pl/prawa-pasazera/poradnik-dla-pasazerow',
    kind: 'reference',
    strategy: 'blocked',
    notes: IMPERVA_BLOCKED,
  },
  {
    name: 'Portal Pasażera',
    url: 'https://portalpasazera.pl/',
    kind: 'live',
    strategy: 'html',
    notes:
      'HTML (ASP.NET). Wyszukiwarka połączeń za reCAPTCHA: nie automatyzujemy. Node fetch odrzuca certyfikat (niepełny łańcuch), curl działa: trzeba dodać certyfikat pośredni (NODE_EXTRA_CA_CERTS).',
  },
  {
    name: 'UTK – pasażerowie',
    url: 'https://utk.gov.pl/pl/pasazerowie',
    kind: 'news',
    strategy: 'rss',
    feeds: [
      'https://utk.gov.pl/dokumenty/rss/1-rss-51.rss',
      'https://utk.gov.pl/dokumenty/rss/1-rss-64.rss',
      'https://utk.gov.pl/dokumenty/rss/1-rss-1803.rss',
      'https://utk.gov.pl/dokumenty/rss/1-rss-1807.rss',
      'https://utk.gov.pl/dokumenty/rss/1-rss-1894.rss',
    ],
  },
  {
    name: 'KGSOK',
    url: 'https://kgsok.pl/',
    kind: 'news',
    strategy: 'rss',
    feeds: ['https://kgsok.pl/feed/'],
    notes: 'WordPress.',
  },
  {
    name: 'Morska Służba Poszukiwania i Ratownictwa',
    url: 'https://www.sar.gov.pl/',
    kind: 'news',
    strategy: 'blocked',
    notes: IMPERVA_BLOCKED,
  },
  {
    name: 'Urząd Morski w Gdyni',
    url: 'https://www.umgdy.gov.pl/',
    kind: 'news',
    strategy: 'rss',
    feeds: ['https://www.umgdy.gov.pl/feed/'],
    endpoints: ['https://www.umgdy.gov.pl/wp-json/wp/v2/posts'],
    notes: 'WordPress: RSS albo WP REST API.',
  },
  {
    name: 'Urząd Morski w Szczecinie – warunki żeglugi',
    url: 'https://www.ums.gov.pl/bezpieczenstwo-morskie/warunki-zeglugi',
    kind: 'news',
    strategy: 'html',
    notes: 'HTML z JSON-LD (Article): tytuł i daty z metadanych.',
  },
  {
    name: 'Wody Polskie – komunikaty nawigacyjne',
    url: 'https://www.gov.pl/web/wody-polskie/komunikaty-nawigacyjne',
    kind: 'news',
    strategy: 'govpl-page',
    notes: 'Strona-indeks: same komunikaty są na podstronach RZGW, trzeba zejść poziom niżej.',
  },
  {
    name: 'IMGW – meteo',
    url: 'https://meteo.imgw.pl/',
    kind: 'live',
    strategy: 'json-api',
    endpoints: [
      'https://danepubliczne.imgw.pl/api/data/warningsmeteo',
      'https://danepubliczne.imgw.pl/api/data/synop',
    ],
    notes: 'Strona to SPA (Angular); dane z publicznego API IMGW.',
  },
  {
    name: 'IMGW – hydro',
    url: 'https://hydro.imgw.pl/',
    kind: 'live',
    strategy: 'json-api',
    endpoints: [
      'https://danepubliczne.imgw.pl/api/data/warningshydro',
      'https://danepubliczne.imgw.pl/api/data/hydro',
    ],
    notes: 'Strona to SPA (Angular); dane z publicznego API IMGW.',
  },
  {
    name: 'IMGW – Bałtyk',
    url: 'https://baltyk.imgw.pl/',
    kind: 'live',
    strategy: 'spa',
    notes:
      'SPA (Angular), nie szukałem jeszcze jego API. Częściowo pokrywa je synop IMGW (stacje nadmorskie).',
  },
  {
    name: 'Rządowe Centrum Bezpieczeństwa',
    corpusId: 'govpl-rcb',
    licence: LICENCE_GOVPL,
    url: 'https://www.gov.pl/web/rcb/strona-glowna-rzadowego-centrum-bezpieczenstwa',
    kind: 'reference',
    strategy: 'govpl-page',
  },
  {
    name: 'MSWiA',
    corpusId: 'govpl-mswia',
    licence: LICENCE_GOVPL,
    url: 'https://www.gov.pl/web/mswia',
    kind: 'reference',
    strategy: 'govpl-page',
  },
  {
    name: 'MSZ – informacje dla podróżujących',
    url: 'https://www.gov.pl/web/dyplomacja/informacje-dla-podrozujacych',
    kind: 'news',
    strategy: 'json-api',
    endpoints: ODYSEUSZ_API,
    notes: 'Przekierowuje na odyseusz.gov.pl: duplikat źródła Odyseusz.',
  },
  {
    name: 'Kancelaria Premiera',
    corpusId: 'govpl-premier',
    licence: LICENCE_GOVPL,
    url: 'https://www.gov.pl/web/premier',
    kind: 'reference',
    strategy: 'govpl-page',
  },
] as const satisfies readonly Source[];

/** Źródła, z których wolno importować dokumenty do korpusu: `corpusId` → warunki wykorzystania. */
export function corpusSources(): Map<string, { name: string; licence: string }> {
  const byId = new Map<string, { name: string; licence: string }>();
  for (const source of SOURCES as readonly Source[]) {
    if (source.corpusId === undefined) continue;
    if (!source.licence) throw new Error(`Źródło „${source.name}” ma corpusId bez pola licence`);
    if (byId.has(source.corpusId)) throw new Error(`Powtórzone corpusId: ${source.corpusId}`);
    byId.set(source.corpusId, { name: source.name, licence: source.licence });
  }
  return byId;
}

/** Baza weryfikatorów */
export const FACT_CHECK_SOURCES = [
  {
    name: 'Google Fact Check Explorer',
    url: 'https://toolbox.google.com/factcheck/explorer/search/list:recent;hl=pl',
    kind: 'live',
    strategy: 'spa',
    notes: 'Interfejs dla ludzi. Te same dane daje Fact Check Tools API.',
  },
  {
    name: 'Google Fact Check Tools API',
    url: 'https://developers.google.com/fact-check/tools/api/reference/rest?hl=pl',
    kind: 'live',
    strategy: 'json-api',
    endpoints: [
      'https://factchecktools.googleapis.com/v1alpha1/claims:search?query={zapytanie}&languageCode=pl&key={klucz}',
    ],
    notes: 'Wymaga klucza Google Cloud API.',
  },
] as const satisfies readonly Source[];

// Sprawdzone 2026-11-22: euvsdisinfo.eu nie ma strony z licencją; nota prawna ESDZ pozwala na
// ponowne wykorzystanie z podaniem źródła. Szczegóły i otwarte pytania: docs/research/euvsdisinfo.md.
const LICENCE_EUVSDISINFO =
  'Brak licencji na euvsdisinfo.eu. Nota prawna ESDZ: ponowne wykorzystanie dozwolone z podaniem źródła ' +
  '(nie obejmuje materiałów stron trzecich). Dostęp do MCP na wniosek; warunki tokenu niepotwierdzone. ' +
  'Niczego nie przechowujemy w korpusie: zapytanie na żywo, do wyniku trafia tytuł, link i krótki cytat streszczenia.';

/**
 * Katalog znanych incydentów. To KONTEKST, nie źródło dowodów: dopasowanie nigdy nie zmienia
 * werdyktu (packages/agent/src/incidents.ts). Do serwera wysyłamy tylko wydzielone, zamaskowane twierdzenia.
 */
export const INCIDENT_SOURCES = [
  {
    name: 'EUvsDisinfo (East StratCom Task Force ESDZ) – serwer MCP',
    url: 'https://euvsdisinfo.eu/disinformation-cases/',
    licence: LICENCE_EUVSDISINFO,
    kind: 'live',
    strategy: 'json-api',
    endpoints: ['https://mcp.euvsd.info/mcp (tools/call: search)'],
    notes:
      'Wymaga EUVSDISINFO_API_KEY. Serwer zgłasza logowanie zapytań (Supabase), miejsce przetwarzania nieznane. ' +
      'Używamy tylko wyników typu claim_review z adresem euvsdisinfo.eu/report/.',
  },
] as const satisfies readonly Source[];
