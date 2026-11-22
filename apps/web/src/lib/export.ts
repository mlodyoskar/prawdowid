import type { CheckResponse, ClaimResult, Evidence, Stance } from '@prawdowid/contracts';

/**
 * Eksport wyniku sprawdzenia do pliku: CSV (arkusz), JSON (pełny wynik) i STIX 2.1
 * (import do OpenCTI). Tylko kanał WWW: plik powstaje w przeglądarce z wyniku, który strona
 * już pobrała, więc eksport nie widzi niczego poza tym, co użytkownik ma na ekranie.
 */

export type OkResult = Extract<CheckResponse, { status: 'ok' }>;

export type ExportFormat = 'csv' | 'json' | 'stix';

export type ExportFile = { filename: string; mimeType: string; content: string };

export type ExportOptions = {
  /** Adres wyniku na stronie (`/w/<id>`), dopisywany jako odnośnik do źródła eksportu. */
  resultUrl?: string;
  now?: Date;
  /** Generator UUID dla identyfikatorów STIX (w testach deterministyczny). */
  uuid?: () => string;
};

const STANCE_LABEL: Record<Stance, string> = {
  supports: 'potwierdza',
  refutes: 'obala',
  context: 'kontekst',
};

/** Dowody twierdzenia w kolejności `evidenceIds`, z rolą i cytatem, jeśli je znamy. */
function claimEvidence(claim: ClaimResult, byId: Map<string, Evidence>) {
  return claim.evidenceIds.flatMap((id) => {
    const evidence = byId.get(id);
    if (!evidence) return [];
    const use = claim.evidenceUse?.find((u) => u.id === id);
    return [{ evidence, stance: use?.stance, quote: use?.quote ?? evidence.excerpt }];
  });
}

// ---------------------------------------------------------------- CSV

const CSV_HEADER = [
  'nr_sprawdzenia',
  'data_sprawdzenia',
  'nr_twierdzenia',
  'twierdzenie',
  'werdykt',
  'pewnosc',
  'wyjasnienie',
  'ograniczenia',
  'rozbieznosc_zrodel',
  'rola_dowodu',
  'cytat',
  'tytul_zrodla',
  'wydawca',
  'data_publikacji',
  'adres',
  'rodzaj_zrodla',
  'ocena_factcheckera',
] as const;

/**
 * Pole CSV wg RFC 4180. Treść pochodzi z zapytań i pobranych stron, więc wartości zaczynające się
 * od `=`, `+`, `-`, `@` (formuły w arkuszu) poprzedzamy apostrofem.
 */
export function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** Jeden wiersz na parę twierdzenie–dowód; twierdzenie bez dowodów ma jeden wiersz z pustymi polami. */
export function toCsv(result: OkResult): string {
  const byId = new Map(result.evidence.map((e) => [e.id, e]));
  const rows: string[][] = [[...CSV_HEADER]];
  result.claims.forEach((claim, i) => {
    const base = [
      result.checkId,
      result.createdAt,
      String(i + 1),
      claim.claim,
      claim.verdict,
      claim.confidence,
      claim.explanation,
      [claim.limitations, ...(claim.unknowns ?? [])].filter(Boolean).join(' '),
      claim.discrepancy ? 'tak' : 'nie',
    ];
    const items = claimEvidence(claim, byId);
    if (items.length === 0) {
      rows.push([...base, ...Array.from({ length: 8 }, () => '')]);
      return;
    }
    for (const { evidence, stance, quote } of items) {
      rows.push([
        ...base,
        stance ? STANCE_LABEL[stance] : '',
        quote,
        evidence.title,
        evidence.publisher,
        evidence.publishedAt ?? '',
        evidence.url,
        evidence.kind === 'factcheck' ? 'fact-check' : 'korpus',
        evidence.rating ?? '',
      ]);
    }
  });
  // BOM: Excel rozpoznaje wtedy UTF-8 (polskie znaki).
  return `﻿${rows.map((r) => r.map(csvField).join(',')).join('\r\n')}\r\n`;
}

// ---------------------------------------------------------------- JSON

export function toJson(result: OkResult, options: ExportOptions = {}): string {
  const doc = {
    format: 'prawdowid-check',
    version: 1,
    exportedAt: (options.now ?? new Date()).toISOString(),
    ...(options.resultUrl ? { resultUrl: options.resultUrl } : {}),
    result,
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

// ---------------------------------------------------------------- STIX 2.1

type StixObject = Record<string, unknown> & { type: string; id: string };

function stixTimestamp(value: string): string {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? value : new Date(ms).toISOString();
}

function evidenceReference(item: ReturnType<typeof claimEvidence>[number]) {
  const { evidence, stance, quote } = item;
  const lines = [
    evidence.title,
    evidence.publishedAt ? `Data publikacji: ${evidence.publishedAt}` : 'Data publikacji: brak',
    stance ? `Rola: ${STANCE_LABEL[stance]}` : null,
    evidence.rating ? `Ocena fact-checkera: ${evidence.rating}` : null,
    quote ? `Cytat: „${quote}”` : null,
  ].filter((l): l is string => l !== null);
  return { source_name: evidence.publisher, url: evidence.url, description: lines.join('\n') };
}

/**
 * Paczka STIX 2.1 do importu w OpenCTI (Data → Import → plik STIX):
 * - `identity` Prawdowid jako autor (`created_by_ref`),
 * - `report` dla sprawdzenia: podsumowanie, ostrzeżenia, niesprawdzone twierdzenia,
 * - `note` dla każdego twierdzenia: werdykt i pewność w etykietach, dowody jako `external_references`.
 *
 * Bez technik DISARM: system ocenia pojedyncze twierdzenia, a przypisanie techniki kampanii
 * wymagałoby oceny, której nie opiera na dowodach. Analityk może je dodać w OpenCTI.
 */
export function toStix(result: OkResult, options: ExportOptions = {}): string {
  const uuid = options.uuid ?? (() => crypto.randomUUID());
  const now = (options.now ?? new Date()).toISOString();
  const created = stixTimestamp(result.createdAt);
  const byId = new Map(result.evidence.map((e) => [e.id, e]));
  const common = { spec_version: '2.1', created, modified: created };

  const identity: StixObject = {
    type: 'identity',
    id: `identity--${uuid()}`,
    ...common,
    name: 'Prawdowid',
    identity_class: 'system',
    description: 'Narzędzie do weryfikacji informacji: werdykt z cytatami ze źródeł.',
  };
  const reportId = `report--${uuid()}`;

  const notes: StixObject[] = result.claims.map((claim, i) => {
    const content = [
      `Werdykt: ${claim.verdict}`,
      `Pewność: ${claim.confidence}`,
      '',
      claim.explanation,
      ...(claim.confidenceReasons?.length
        ? ['', 'Przesłanki oceny pewności:', ...claim.confidenceReasons.map((r) => `- ${r}`)]
        : []),
      ...(claim.limitations ? ['', `Ograniczenia: ${claim.limitations}`] : []),
      ...(claim.unknowns?.length
        ? ['', 'Czego nie ustalono:', ...claim.unknowns.map((u) => `- ${u}`)]
        : []),
      ...(claim.discrepancy ? ['', 'Źródła podają rozbieżne informacje.'] : []),
    ].join('\n');
    const refs = claimEvidence(claim, byId).map(evidenceReference);
    return {
      type: 'note',
      id: `note--${uuid()}`,
      ...common,
      created_by_ref: identity.id,
      abstract: `Twierdzenie ${i + 1}: ${claim.claim}`,
      content,
      authors: ['Prawdowid'],
      labels: [`werdykt: ${claim.verdict}`, `pewność: ${claim.confidence}`],
      object_refs: [reportId],
      ...(refs.length > 0 ? { external_references: refs } : {}),
    };
  });

  const description = [
    result.summary,
    ...(result.warnings.length
      ? ['', 'Ostrzeżenia:', ...result.warnings.map((w) => `- ${w}`)]
      : []),
    ...(result.unchecked?.length
      ? [
          '',
          'Niesprawdzone z powodów technicznych (to nie jest werdykt):',
          ...result.unchecked.map((u) => `- ${u.claim} (${u.reason})`),
        ]
      : []),
    ...(result.searched?.length ? ['', `Przeszukane źródła: ${result.searched.join(', ')}`] : []),
  ].join('\n');

  const report: StixObject = {
    type: 'report',
    id: reportId,
    ...common,
    created_by_ref: identity.id,
    name: `Prawdowid: sprawdzenie ${result.checkId}`,
    description,
    report_types: ['fact-check'],
    published: created,
    labels: [...new Set(result.claims.map((c) => `werdykt: ${c.verdict}`))],
    // `object_refs` musi być niepuste: bez twierdzeń raport wskazuje autora.
    object_refs: notes.length > 0 ? notes.map((n) => n.id) : [identity.id],
    external_references: [
      {
        source_name: 'Prawdowid',
        external_id: result.checkId,
        ...(options.resultUrl ? { url: options.resultUrl } : {}),
        description: `Wyeksportowano ${now}`,
      },
    ],
  };

  const bundle = { type: 'bundle', id: `bundle--${uuid()}`, objects: [identity, report, ...notes] };
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

// ---------------------------------------------------------------- pliki

export function exportFile(
  format: ExportFormat,
  result: OkResult,
  options: ExportOptions = {},
): ExportFile {
  const base = `prawdowid-${result.checkId}`;
  switch (format) {
    case 'csv':
      return {
        filename: `${base}.csv`,
        mimeType: 'text/csv;charset=utf-8',
        content: toCsv(result),
      };
    case 'json':
      return {
        filename: `${base}.json`,
        mimeType: 'application/json',
        content: toJson(result, options),
      };
    case 'stix':
      return {
        filename: `${base}.stix.json`,
        mimeType: 'application/json',
        content: toStix(result, options),
      };
  }
}
