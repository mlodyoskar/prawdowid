import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { emptyMetrics, type VerifyResult } from '@prawdowid/agent';
import type { CheckResponse, Verdict } from '@prawdowid/contracts';

import {
  SqliteCaseStore,
  claimTokens,
  escalationReason,
  similarity,
  DEFAULT_CASE_RULES,
} from './cases.ts';

const HOUR = 3600_000;
const T0 = new Date('2026-11-22T10:00:00Z');
const at = (hours: number) => new Date(T0.getTime() + hours * HOUR);

function result(
  claims: Array<{ claim: string; verdict: Verdict }>,
  over: { injection?: boolean; status?: CheckResponse['status'] } = {},
): VerifyResult {
  const meta = { checkId: 'x', createdAt: T0.toISOString(), durationMs: 1 };
  const response: CheckResponse =
    over.status === 'error'
      ? { ...meta, status: 'error', code: 'llm_unavailable', message: 'awaria' }
      : {
          ...meta,
          status: 'ok',
          summary: 's',
          evidence: [],
          warnings: [],
          claims: claims.map((c) => ({
            ...c,
            confidence: 'niska',
            explanation: 'e',
            evidenceIds: [],
            limitations: '',
          })),
        };
  const metrics = emptyMetrics();
  if (over.injection) metrics.injectionSignals.push({ source: 'url:x', pattern: 'ignore' });
  return { response, metrics };
}

const noEvidence = (claim: string) => result([{ claim, verdict: 'brak wystarczających dowodów' }]);

function store() {
  return new SqliteCaseStore(':memory:', DEFAULT_CASE_RULES);
}

test('parafraza ma podobne rdzenie, inny temat nie', () => {
  const a = claimTokens('Rząd wprowadza godzinę policyjną od poniedziałku');
  const b = claimTokens('Od poniedziałku będzie godzina policyjna, tak zdecydował rząd');
  const c = claimTokens('Ceny prądu wzrosną o 40 procent w styczniu');
  assert.ok(similarity(a, b) >= 0.5);
  assert.ok(similarity(a, c) < 0.5);
});

test('trzy parafrazy bez dowodów: jedna sprawa, oznaczona raz', () => {
  const cases = store();
  const first = cases.record(
    'c1',
    noEvidence('Rząd wprowadza godzinę policyjną od poniedziałku'),
    at(0),
  );
  const second = cases.record(
    'c2',
    noEvidence('Od poniedziałku będzie godzina policyjna, rząd tak zdecydował'),
    at(1),
  );
  assert.equal(first.escalation, null);
  assert.equal(second.escalation, null);

  const third = cases.record(
    'c3',
    noEvidence('Czy rząd wprowadza godzinę policyjną od poniedziałku?'),
    at(2),
  );
  assert.equal(third.escalation?.reason, 'repeat_no_evidence');
  assert.equal(third.recommended.length, 1);
  assert.equal(third.recommended[0]?.reports, 3);

  const fourth = cases.record('c4', noEvidence('Godzina policyjna od poniedziałku – rząd'), at(3));
  assert.equal(fourth.escalation?.caseId, third.escalation?.caseId);
  assert.equal(fourth.recommended.length, 0, 'drugi raz nie oznaczamy');

  // Wcześniejsze zgłoszenia tej sprawy też widzą oznaczenie przy odczycie.
  assert.equal(cases.escalationFor('c1')?.caseId, third.escalation?.caseId);
});

test('zgłoszenia spoza okna czasu nie składają się w powtórzenie', () => {
  const cases = store();
  const claim = 'Rząd wprowadza godzinę policyjną od poniedziałku';
  cases.record('c1', noEvidence(claim), at(0));
  cases.record('c2', noEvidence(claim), at(30));
  const third = cases.record('c3', noEvidence(claim), at(31));
  assert.equal(third.escalation, null);
});

test('inny temat tworzy osobną sprawę', () => {
  const cases = store();
  cases.record('c1', noEvidence('Rząd wprowadza godzinę policyjną od poniedziałku'), at(0));
  cases.record('c2', noEvidence('Rząd wprowadza godzinę policyjną od poniedziałku'), at(0));
  const other = cases.record('c3', noEvidence('Ceny prądu wzrosną o 40 procent w styczniu'), at(0));
  assert.equal(other.escalation, null);
});

test('temat wysokiego ryzyka bez potwierdzenia: od pierwszego zgłoszenia', () => {
  const cases = store();
  const out = cases.record(
    'c1',
    result([{ claim: 'Szczepionka powoduje bezpłodność', verdict: 'fałszywe' }]),
    at(0),
  );
  assert.equal(out.escalation?.reason, 'high_risk');

  const confirmed = store().record(
    'c2',
    result([{ claim: 'Szczepienia w aptekach są bezpłatne', verdict: 'potwierdzone' }]),
    at(0),
  );
  assert.equal(confirmed.escalation, null);
});

test('próba prompt injection: od pierwszego zgłoszenia', () => {
  const out = store().record(
    'c1',
    result([{ claim: 'Ceny prądu wzrosną o 40 procent', verdict: 'potwierdzone' }], {
      injection: true,
    }),
    at(0),
  );
  assert.equal(out.escalation?.reason, 'injection');
});

test('awaria i opinia nie tworzą sprawy', () => {
  const cases = store();
  for (const id of ['a', 'b', 'c']) {
    assert.equal(cases.record(id, result([], { status: 'error' }), at(0)).escalation, null);
  }
  const opinion = 'Ten rząd jest najgorszy w historii';
  for (const id of ['d', 'e', 'f']) {
    const out = cases.record(
      id,
      result([{ claim: opinion, verdict: 'nie podlega weryfikacji' }]),
      at(0),
    );
    assert.equal(out.escalation, null);
  }
});

test('usunięcie sesji i retencja usuwają powiązania i puste sprawy, bez danych osobowych', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cases-'));
  const path = join(dir, 'checks.db');
  try {
    const cases = new SqliteCaseStore(path);
    const claim =
      'Jan z adresem jan.kowalski@example.com twierdzi, że rząd wprowadza godzinę policyjną';
    cases.record('c1', noEvidence(claim), at(0));
    cases.record('c2', noEvidence(claim), at(1));

    const db = new DatabaseSync(path);
    const row = () =>
      db.prepare('SELECT claim, reports FROM cases').get() as
        | { claim: string; reports: number }
        | undefined;
    assert.equal(row()?.reports, 2);
    assert.ok(!row()?.claim.includes('jan.kowalski@example.com'), 'e-mail zamaskowany');

    cases.removeCheck('c1');
    assert.equal(row()?.reports, 1);

    assert.equal(cases.purgeOlderThan(at(2)), 1);
    assert.equal(row(), undefined);
    db.close();
    cases.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reguła: brak dowodów poniżej progu nie eskaluje', () => {
  const tokens = claimTokens('Ceny prądu wzrosną');
  const input = {
    verdict: 'brak wystarczających dowodów' as const,
    tokens,
    injection: false,
  };
  assert.equal(escalationReason({ ...input, reportsInWindow: 2 }, DEFAULT_CASE_RULES), null);
  assert.equal(
    escalationReason({ ...input, reportsInWindow: 3 }, DEFAULT_CASE_RULES),
    'repeat_no_evidence',
  );
});
