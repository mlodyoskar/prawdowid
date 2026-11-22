import { z } from 'zod';

/** Werdykt dla pojedynczego twierdzenia. Awaria, brak klucza itp. NIE są werdyktami (patrz CheckResponse.status). */
export const Verdict = z.enum([
  'potwierdzone',
  'fałszywe',
  'wprowadzające w błąd',
  'brak wystarczających dowodów',
  'nie podlega weryfikacji',
]);
export type Verdict = z.infer<typeof Verdict>;

/** Werdykty rozstrzygające: wymagają co najmniej jednego dowodu. */
export const DECISIVE_VERDICTS: readonly Verdict[] = [
  'potwierdzone',
  'fałszywe',
  'wprowadzające w błąd',
];

export const Confidence = z.enum(['niska', 'średnia', 'wysoka']);
export type Confidence = z.infer<typeof Confidence>;

export const MAX_TEXT_LENGTH = 4000;
/** ~5 MB obrazu po zakodowaniu base64 (base64 to ~4/3 rozmiaru). */
export const MAX_IMAGE_BASE64_LENGTH = 7_000_000;

export const ImageInput = z.object({
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  /** Surowy base64, bez prefiksu `data:`. */
  data: z
    .string()
    .min(1)
    .max(MAX_IMAGE_BASE64_LENGTH)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Nieprawidłowy base64'),
});
export type ImageInput = z.infer<typeof ImageInput>;

export const CheckRequest = z
  .object({
    text: z.string().trim().min(1).max(MAX_TEXT_LENGTH).optional(),
    image: ImageInput.optional(),
  })
  .refine((v) => v.text !== undefined || v.image !== undefined, {
    message: 'Podaj tekst lub zdjęcie.',
  });
export type CheckRequest = z.infer<typeof CheckRequest>;

export const EvidenceKind = z.enum(['factcheck', 'corpus']);
export type EvidenceKind = z.infer<typeof EvidenceKind>;

export const SourceType = z.enum(['primary', 'secondary']);
export type SourceType = z.infer<typeof SourceType>;

export const Evidence = z.object({
  id: z.string(),
  kind: EvidenceKind,
  title: z.string(),
  publisher: z.string(),
  url: z.string(),
  publishedAt: z.string().nullable(),
  fetchedAt: z.string().nullable(),
  excerpt: z.string(),
  /** Fragment dokumentu z korpusu, z którego pochodzi `excerpt` (jeden dokument może dać kilka). */
  fragmentId: z.string().optional(),
  /** Ocena fact-checkera (textualRating), tylko dla kind = factcheck. */
  rating: z.string().optional(),
  sourceType: SourceType.optional(),
});
export type Evidence = z.infer<typeof Evidence>;

/** Tryb kroku wyszukiwania: pętla modelu z narzędziami albo plan zapytań wykonywany przez kod. */
export const ResearchMode = z.enum(['agent', 'plan']);
export type ResearchMode = z.infer<typeof ResearchMode>;

/** Rola dowodu wobec twierdzenia. */
export const Stance = z.enum(['supports', 'refutes', 'context']);
export type Stance = z.infer<typeof Stance>;

export const EvidenceUse = z.object({
  id: z.string(),
  stance: Stance,
  /** Dosłowny fragment materiału (albo ocena fact-checkera), którego obecność w źródle sprawdził kod. */
  quote: z.string(),
});
export type EvidenceUse = z.infer<typeof EvidenceUse>;

/**
 * Pola, które zwraca model w trybie `agent`. Wszystkie wymagane: część dostawców
 * nie wspiera pól opcjonalnych w structured output.
 */
export const ClaimResultCore = z.object({
  claim: z.string(),
  verdict: Verdict,
  confidence: Confidence,
  explanation: z.string(),
  evidenceIds: z.array(z.string()),
  limitations: z.string(),
});
export type ClaimResultCore = z.infer<typeof ClaimResultCore>;

/** Wynik dla twierdzenia. Pola opcjonalne wypełnia tryb `plan` (patrz docs/agent.md). */
export const ClaimResult = ClaimResultCore.extend({
  /** Rola i cytat dla każdego dowodu z `evidenceIds`. */
  evidenceUse: z.array(EvidenceUse).optional(),
  /**
   * Inne materiały na ten sam temat, ale o innej sprawie (dowody z `evidence`). Nie są cytatami
   * ani podstawą werdyktu: interfejs pokazuje je osobno, bez fragmentu i bez roli.
   */
  relatedIds: z.array(z.string()).optional(),
  /** Jawne przesłanki, z których kod wyliczył `confidence`. */
  confidenceReasons: z.array(z.string()).optional(),
  /** Czego nie udało się ustalić. */
  unknowns: z.array(z.string()).optional(),
  /** Źródła dotyczące twierdzenia wprost podają rozbieżne informacje. */
  discrepancy: z.boolean().optional(),
});
export type ClaimResult = z.infer<typeof ClaimResult>;

/** Twierdzenie, którego nie udało się sprawdzić z powodów technicznych. To nie jest werdykt. */
export const UncheckedClaim = z.object({ claim: z.string(), reason: z.string() });
export type UncheckedClaim = z.infer<typeof UncheckedClaim>;

export const ErrorCode = z.enum([
  'llm_unavailable',
  'missing_config',
  'timeout',
  'internal',
  /** Źródła danych były niedostępne i nie ma na czym oprzeć żadnej oceny. */
  'sources_unavailable',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

/**
 * Twierdzenie przypomina znany przekaz dezinformacyjny z bazy EUvsDisinfo. To KONTEKST, nie dowód:
 * nie wchodzi do `evidence`, nie zmienia werdyktu ani siły podstawy (docs/research/euvsdisinfo.md).
 */
export const IncidentMatch = z.object({
  /** Indeks twierdzenia w `claims`. */
  claimIndex: z.number().int().nonnegative(),
  title: z.string(),
  /** Strona przypadku w euvsdisinfo.eu. */
  url: z.string(),
  publisher: z.string(),
  /** Streszczenie przekazu (tak jak opisała go baza; to treść dezinformacji, nie fakt). */
  summary: z.string(),
  /** Dosłowny fragment streszczenia, na którym oparto dopasowanie; obecność sprawdził kod. */
  quote: z.string(),
});
export type IncidentMatch = z.infer<typeof IncidentMatch>;

export const INCIDENT_PUBLISHER = 'EUvsDisinfo (East StratCom Task Force ESDZ)';

export const IncidentCatalogState = z.object({
  /** `checked`: przejrzany; `unavailable`: awaria bazy lub modelu; `skipped`: brak czasu. */
  status: z.enum(['checked', 'unavailable', 'skipped']),
  /** Powód dla stanu innego niż `checked`, po polsku. */
  message: z.string().optional(),
});
export type IncidentCatalogState = z.infer<typeof IncidentCatalogState>;

const ResponseMeta = z.object({
  checkId: z.string(),
  createdAt: z.string(),
  durationMs: z.number(),
});

export const CheckResponse = z.discriminatedUnion('status', [
  ResponseMeta.extend({
    status: z.literal('ok'),
    summary: z.string(),
    claims: z.array(ClaimResult),
    evidence: z.array(Evidence),
    warnings: z.array(z.string()),
    /** Twierdzenia niesprawdzone z powodu awarii źródeł. */
    unchecked: z.array(UncheckedClaim).optional(),
    /** Źródła, w których faktycznie szukano. */
    searched: z.array(z.string()).optional(),
    mode: ResearchMode.optional(),
    /** Podobne znane przekazy dezinformacyjne: kontekst obok werdyktu, nigdy jego podstawa. */
    incidents: z.array(IncidentMatch).optional(),
    /**
     * Czy katalog znanych incydentów udało się przejrzeć. Osobno od `warnings` i `searched`:
     * katalog to kontekst, a nie źródło dowodów, a jego awaria nie dotyczy oceny.
     */
    incidentCatalog: IncidentCatalogState.optional(),
    /**
     * To samo zgłoszenie sprawdzono już wcześniej: wynik jest kopią tamtego sprawdzenia
     * (ten sam werdykt i te same dowody we wszystkich kanałach). `createdAt` to czas tamtego sprawdzenia.
     */
    reusedFrom: z.object({ createdAt: z.string() }).optional(),
  }),
  ResponseMeta.extend({ status: z.literal('needs_clarification'), message: z.string() }),
  ResponseMeta.extend({ status: z.literal('out_of_scope'), message: z.string() }),
  ResponseMeta.extend({ status: z.literal('error'), code: ErrorCode, message: z.string() }),
]);
export type CheckResponse = z.infer<typeof CheckResponse>;

/** Stan zadania asynchronicznego. `state` opisuje zadanie, a `result.status` wynik. */
export const JobState = z.enum(['queued', 'running', 'done']);
export type JobState = z.infer<typeof JobState>;

/**
 * Powód oznaczenia sprawy moderatora do weryfikacji przez człowieka:
 * powtarzające się pytanie bez źródeł, temat wysokiego ryzyka albo próba prompt injection.
 */
export const EscalationReason = z.enum(['repeat_no_evidence', 'high_risk', 'injection']);
export type EscalationReason = z.infer<typeof EscalationReason>;

/**
 * Sprawa, do której trafiło zgłoszenie, jest oznaczona do weryfikacji. To rekomendacja,
 * nie przekazanie: dziś system nikogo nie powiadamia, więc nie wolno komunikować „przekazano”.
 */
export const CaseEscalation = z.object({
  caseId: z.string(),
  reason: EscalationReason,
  state: z.literal('review_recommended'),
});
export type CaseEscalation = z.infer<typeof CaseEscalation>;

/** Komunikat dla obywatela, wspólny dla wszystkich kanałów. Nigdy nie mówi o przekazaniu. */
export const ESCALATION_MESSAGE: Record<EscalationReason, string> = {
  repeat_no_evidence:
    'O to pytanie pyta wiele osób, a nie mamy jeszcze źródeł. Oznaczyliśmy je do sprawdzenia przez moderatora.',
  high_risk:
    'To temat wysokiego ryzyka (np. zdrowie, bezpieczeństwo, wybory). Oznaczyliśmy go do sprawdzenia przez moderatora.',
  injection:
    'W sprawdzanym materiale były ukryte polecenia. Zignorowaliśmy je i oznaczyliśmy sprawę do sprawdzenia przez moderatora.',
};

export const CheckJob = z.object({
  checkId: z.string(),
  state: JobState,
  createdAt: z.string(),
  updatedAt: z.string(),
  result: CheckResponse.optional(),
  /** Tylko gdy sprawa tego zgłoszenia jest oznaczona do weryfikacji (patrz CaseEscalation). */
  escalation: CaseEscalation.optional(),
});
export type CheckJob = z.infer<typeof CheckJob>;

/**
 * Publiczny adres wyniku: `<origin>/w/<checkId>`. Ten sam w WWW (kopiuj link, eksport)
 * i w drugim kanale. `checkId` jest krótkim losowym kodem, więc link mieści się w SMS-ie.
 */
export const RESULT_PATH_PREFIX = '/w/';

export function resultUrl(origin: string, checkId: string): string {
  return `${origin.replace(/\/+$/, '')}${RESULT_PATH_PREFIX}${encodeURIComponent(checkId)}`;
}

/** Id sprawdzenia z adresu strony: `/w/<id>` albo starszy `?check=<id>`. */
export function checkIdFromLocation(pathname: string, search: string): string | null {
  if (pathname.startsWith(RESULT_PATH_PREFIX)) {
    const raw = pathname.slice(RESULT_PATH_PREFIX.length).replace(/\/+$/, '');
    if (raw && !raw.includes('/')) {
      try {
        return decodeURIComponent(raw);
      } catch {
        return null;
      }
    }
    return null;
  }
  return new URLSearchParams(search).get('check');
}

export {
  countSources,
  groupBySource,
  sourceQuotes,
  type SourceFragment,
  type SourceGroup,
} from './sources.ts';
