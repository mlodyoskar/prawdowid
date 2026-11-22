import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { maskPii, type VerifyResult } from '@prawdowid/agent';
import type { CaseEscalation, EscalationReason, Verdict } from '@prawdowid/contracts';

/**
 * Sprawy moderatora (pętla informacji z treści zadania). Podobne twierdzenia z wielu zgłoszeń
 * trafiają do jednej sprawy, a deterministyczne reguły oznaczają ją do weryfikacji przez
 * człowieka. Dziś to tylko rekomendacja: system nikogo nie powiadamia, więc stan
 * `review_recommended` nigdy nie oznacza „przekazano”. Wysyłkę można dołożyć na tym stanie.
 *
 * Minimalizacja danych: sprawa trzyma zamaskowane twierdzenie (sformułowanie modelu, nie treść
 * zgłoszenia), werdykt, powód i czasy. Powiązanie ze zgłoszeniem to sam `check_id` i czas.
 * Retencja i usuwanie sesji działają tak samo jak dla tabeli `checks`.
 */

export type CaseRules = {
  /** Tyle zgłoszeń bez dowodów w oknie czasu robi z pytania „powtarzające się”. */
  repeatThreshold: number;
  windowMs: number;
};

export const DEFAULT_CASE_RULES: CaseRules = {
  repeatThreshold: 3,
  windowMs: 24 * 3600_000,
};

/** Minimalne podobieństwo zbiorów rdzeni, od którego twierdzenie trafia do istniejącej sprawy. */
export const SIMILARITY_THRESHOLD = 0.5;

/** Długość rdzenia słowa: prymitywny, ale przewidywalny zamiennik stemmera dla polskiej fleksji. */
const STEM_LENGTH = 5;

const STOPWORDS = new Set(
  `a aby albo ale bo by być będzie będą był była było były co czy dla do gdy go i ich im jak jako
  jakie jego jej jest już ma mają może można na nad nie niż o od oraz po pod przez przy się sie
  są ta tak tam te tego tej ten też to tu tym u w we według wszystkie z za ze że żeby został
  została zostało zostały który która które których którzy`.split(/\s+/),
);

/**
 * Rdzenie tematów wysokiego ryzyka: ogólne kategorie (zdrowie publiczne, bezpieczeństwo,
 * wybory, klęski), a nie konkretne przykłady. Twierdzenie w takim temacie bez potwierdzenia
 * od razu trafia do weryfikacji. Sama obecność tematu nie mówi nic o prawdziwości.
 */
export const HIGH_RISK_STEMS = [
  // zdrowie publiczne
  'szcze', // szczepionka, szczepienia
  'wirus',
  'epide',
  'pande',
  'zatru',
  'skaże',
  // bezpieczeństwo
  'ewaku',
  'mobil', // mobilizacja
  'pobór',
  'wojn',
  'wojsk',
  'atak',
  'zamac',
  'bomb',
  'alarm',
  'schro', // schron
  'dron',
  // wybory
  'wybor',
  'głoso',
  'refer',
  // klęski i infrastruktura
  'powód',
  'black', // blackout
  'katas',
];

/** Zbiór rdzeni twierdzenia: NFC, małe litery, bez interpunkcji i słów funkcyjnych. Liczby zostają całe. */
export function claimTokens(claim: string): string[] {
  const words = claim
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const stems = new Set<string>();
  for (const w of words) {
    if (/^\p{N}+$/u.test(w)) {
      stems.add(w);
      continue;
    }
    if (w.length < 3 || STOPWORDS.has(w)) continue;
    stems.add(w.slice(0, STEM_LENGTH));
  }
  return [...stems].toSorted();
}

/** Podobieństwo Jaccarda dwóch zbiorów rdzeni. */
export function similarity(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const common = a.filter((t) => setB.has(t)).length;
  return common / (a.length + b.length - common);
}

export function isHighRisk(tokens: readonly string[]): boolean {
  return tokens.some((t) => HIGH_RISK_STEMS.some((s) => t.startsWith(s)));
}

/** Powód oznaczenia sprawy do weryfikacji albo `null`. Kolejność: injection, ryzyko, powtórzenia. */
export function escalationReason(
  input: {
    verdict: Verdict;
    tokens: readonly string[];
    reportsInWindow: number;
    injection: boolean;
  },
  rules: CaseRules,
): EscalationReason | null {
  if (input.injection) return 'injection';
  if (input.verdict !== 'potwierdzone' && isHighRisk(input.tokens)) return 'high_risk';
  if (
    input.verdict === 'brak wystarczających dowodów' &&
    input.reportsInWindow >= rules.repeatThreshold
  ) {
    return 'repeat_no_evidence';
  }
  return null;
}

export type RecordOutcome = {
  /** Sprawa zgłoszenia oznaczona do weryfikacji (także wcześniej), albo `null`. */
  escalation: CaseEscalation | null;
  /** Sprawy, które właśnie przeszły do `review_recommended` (do logu, raz na sprawę). */
  recommended: Array<{
    caseId: string;
    reason: EscalationReason;
    reports: number;
  }>;
};

type CaseRow = {
  id: string;
  tokens: string;
  state: 'open' | 'review_recommended';
  reason: EscalationReason | null;
};

export class SqliteCaseStore {
  readonly #db: DatabaseSync;
  readonly #rules: CaseRules;

  constructor(path: string, rules: CaseRules = DEFAULT_CASE_RULES) {
    this.#rules = rules;
    this.#db = new DatabaseSync(path);
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS cases (
        id             TEXT PRIMARY KEY,
        claim          TEXT NOT NULL,
        tokens         TEXT NOT NULL,
        verdict        TEXT NOT NULL,
        -- 'forwarded' zarezerwowany na przyszłą wysyłkę powiadomień; dziś nieużywany.
        state          TEXT NOT NULL CHECK (state IN ('open', 'review_recommended', 'forwarded')),
        reason         TEXT,
        reports        INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL,
        recommended_at TEXT
      );
      CREATE INDEX IF NOT EXISTS cases_updated_at ON cases(updated_at);
      CREATE TABLE IF NOT EXISTS case_reports (
        check_id   TEXT NOT NULL,
        case_id    TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (check_id, case_id)
      );
      CREATE INDEX IF NOT EXISTS case_reports_case ON case_reports(case_id, created_at);
    `);
  }

  /**
   * Przypisuje twierdzenia wyniku do spraw i stosuje reguły. Tylko pełny wynik merytoryczny
   * (`status: 'ok'`) tworzy sprawy: awaria, prośba o doprecyzowanie i twierdzenia niesprawdzone
   * z powodów technicznych nie są brakiem źródeł.
   */
  record(checkId: string, { response, metrics }: VerifyResult, now: Date): RecordOutcome {
    const outcome: RecordOutcome = { escalation: null, recommended: [] };
    if (response.status !== 'ok') return outcome;

    const ts = now.toISOString();
    const windowStart = new Date(now.getTime() - this.#rules.windowMs).toISOString();
    const injection = metrics.injectionSignals.length > 0;

    this.#db.exec('BEGIN');
    try {
      for (const claim of response.claims) {
        // Opinie i oceny nie są sprawą do domknięcia źródłem.
        if (claim.verdict === 'nie podlega weryfikacji') continue;
        const text = maskPii(claim.claim, now).text;
        const tokens = claimTokens(text);
        if (tokens.length === 0) continue;

        const match = this.#findCase(tokens, windowStart);
        const caseId = match?.id ?? randomUUID();
        if (match) {
          this.#db
            .prepare('UPDATE cases SET verdict = ?, updated_at = ? WHERE id = ?')
            .run(claim.verdict, ts, caseId);
        } else {
          this.#db
            .prepare(
              `INSERT INTO cases (id, claim, tokens, verdict, state, created_at, updated_at)
               VALUES (?, ?, ?, ?, 'open', ?, ?)`,
            )
            .run(caseId, text, tokens.join(' '), claim.verdict, ts, ts);
        }
        this.#db
          .prepare(
            'INSERT OR IGNORE INTO case_reports (check_id, case_id, created_at) VALUES (?, ?, ?)',
          )
          .run(checkId, caseId, ts);
        const reports = this.#recount(caseId);

        let state = match?.state ?? 'open';
        let reason = match?.reason ?? null;
        if (state === 'open') {
          const next = escalationReason(
            {
              verdict: claim.verdict,
              tokens,
              reportsInWindow: this.#reportsSince(caseId, windowStart),
              injection,
            },
            this.#rules,
          );
          if (next) {
            this.#db
              .prepare(
                `UPDATE cases SET state = 'review_recommended', reason = ?, recommended_at = ?
                 WHERE id = ?`,
              )
              .run(next, ts, caseId);
            state = 'review_recommended';
            reason = next;
            outcome.recommended.push({ caseId, reason: next, reports });
          }
        }
        if (!outcome.escalation && state === 'review_recommended' && reason) {
          outcome.escalation = { caseId, reason, state: 'review_recommended' };
        }
      }
      this.#db.exec('COMMIT');
    } catch (err) {
      this.#db.exec('ROLLBACK');
      throw err;
    }
    return outcome;
  }

  /** Oznaczenie sprawy, do której należy zgłoszenie (dla odczytu wyniku w WWW). */
  escalationFor(checkId: string): CaseEscalation | undefined {
    const row = this.#db
      .prepare(
        `SELECT c.id, c.reason FROM case_reports r JOIN cases c ON c.id = r.case_id
         WHERE r.check_id = ? AND c.state = 'review_recommended' AND c.reason IS NOT NULL
         ORDER BY c.recommended_at ASC LIMIT 1`,
      )
      .get(checkId) as { id: string; reason: EscalationReason } | undefined;
    return row ? { caseId: row.id, reason: row.reason, state: 'review_recommended' } : undefined;
  }

  /** Usunięcie sesji: zgłoszenie znika ze spraw, pusta sprawa znika całkiem. */
  removeCheck(checkId: string): void {
    const caseIds = (
      this.#db
        .prepare('SELECT case_id FROM case_reports WHERE check_id = ?')
        .all(checkId) as Array<{
        case_id: string;
      }>
    ).map((r) => r.case_id);
    this.#db.prepare('DELETE FROM case_reports WHERE check_id = ?').run(checkId);
    for (const id of caseIds) this.#recount(id);
    this.#deleteEmpty();
  }

  /** Retencja: usuwa stare powiązania i puste sprawy. Zwraca liczbę usuniętych spraw. */
  purgeOlderThan(cutoff: Date): number {
    const touched = (
      this.#db
        .prepare('SELECT DISTINCT case_id FROM case_reports WHERE created_at < ?')
        .all(cutoff.toISOString()) as Array<{ case_id: string }>
    ).map((r) => r.case_id);
    this.#db.prepare('DELETE FROM case_reports WHERE created_at < ?').run(cutoff.toISOString());
    for (const id of touched) this.#recount(id);
    return this.#deleteEmpty();
  }

  close(): void {
    this.#db.close();
  }

  /** Najbardziej podobna sprawa aktywna w oknie czasu, jeśli przekracza próg. */
  #findCase(tokens: string[], windowStart: string): CaseRow | undefined {
    const rows = this.#db
      .prepare('SELECT id, tokens, state, reason FROM cases WHERE updated_at >= ?')
      .all(windowStart) as CaseRow[];
    let best: CaseRow | undefined;
    let bestScore = 0;
    for (const row of rows) {
      const score = similarity(tokens, row.tokens.split(' '));
      if (score >= SIMILARITY_THRESHOLD && score > bestScore) {
        best = row;
        bestScore = score;
      }
    }
    return best;
  }

  #reportsSince(caseId: string, since: string): number {
    const row = this.#db
      .prepare('SELECT COUNT(*) AS n FROM case_reports WHERE case_id = ? AND created_at >= ?')
      .get(caseId, since) as { n: number };
    return row.n;
  }

  #recount(caseId: string): number {
    const row = this.#db
      .prepare('SELECT COUNT(*) AS n FROM case_reports WHERE case_id = ?')
      .get(caseId) as { n: number };
    const { n } = row;
    this.#db.prepare('UPDATE cases SET reports = ? WHERE id = ?').run(n, caseId);
    return n;
  }

  #deleteEmpty(): number {
    return Number(
      this.#db
        .prepare('DELETE FROM cases WHERE id NOT IN (SELECT DISTINCT case_id FROM case_reports)')
        .run().changes,
    );
  }
}
