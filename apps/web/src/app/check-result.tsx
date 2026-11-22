import {
  ESCALATION_MESSAGE,
  resultUrl,
  type CaseEscalation,
  type CheckResponse,
  type ClaimResult,
  type ErrorCode,
  type Evidence,
} from '@prawdowid/contracts';
import { Check, Copy, Download, RotateCcw } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { exportFile, type ExportFormat } from '@/lib/export.ts';
import { count, formatDateTime, plural } from '@/lib/format.ts';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  ClaimCard,
  Eyebrow,
  ICON_STROKE,
  Notice,
  Separator,
  SummaryBanner,
} from '@/ui';

import { EvidenceSource } from './evidence-source.tsx';

const CLAIM_FORMS = ['twierdzenie', 'twierdzenia', 'twierdzeń'] as const;
const SOURCE_FORMS = ['źródło', 'źródła', 'źródeł'] as const;

type OkResult = Extract<CheckResponse, { status: 'ok' }>;

type CheckResultProps = {
  checkId: string;
  result: CheckResponse;
  escalation?: CaseEscalation | undefined;
  onNewCheck: () => void;
  onRetry?: () => void;
  onEdit: () => void;
  onRemove: () => Promise<boolean>;
};

function summaryTitle(n: number): string {
  if (n === 0) return 'Nie znaleźliśmy twierdzeń do sprawdzenia';
  return `W wiadomości ${plural(n, ['jest', 'są', 'jest'])} ${count(n, CLAIM_FORMS)}`;
}

const ERROR_TITLE: Record<ErrorCode, string> = {
  llm_unavailable: 'Usługa jest chwilowo niedostępna',
  missing_config: 'Usługa nie jest skonfigurowana',
  timeout: 'Sprawdzanie trwało zbyt długo',
  internal: 'Sprawdzanie przerwane',
  sources_unavailable: 'Źródła są chwilowo niedostępne',
};

function ClaimEvidence({ claim, evidence }: { claim: ClaimResult; evidence: Evidence[] }) {
  const [first, ...rest] = evidence;
  const insufficient = claim.verdict === 'brak wystarczających dowodów';
  const unknowns = claim.unknowns ?? [];
  const hasLimitations = claim.limitations.trim().length > 0 || unknowns.length > 0;
  const useOf = (e: Evidence) => claim.evidenceUse?.find((u) => u.id === e.id);

  return (
    <>
      {claim.discrepancy ? (
        <Notice variant="caution" title="Źródła podają rozbieżne informacje">
          <p>Porównaj je poniżej. Nie rozstrzygamy, które ma rację.</p>
        </Notice>
      ) : null}
      {first ? <EvidenceSource evidence={first} use={useOf(first)} /> : null}
      {rest.length > 0 || hasLimitations ? (
        <Accordion type="multiple" defaultValue={insufficient ? ['limitations'] : []}>
          {rest.length > 0 ? (
            <AccordionItem value="sources">
              <AccordionTrigger>Pokaż pozostałe źródła ({rest.length})</AccordionTrigger>
              <AccordionContent className="flex flex-col gap-4">
                {rest.map((e, i) => (
                  <EvidenceSource key={`${i}-${e.id}`} evidence={e} use={useOf(e)} />
                ))}
              </AccordionContent>
            </AccordionItem>
          ) : null}
          {hasLimitations ? (
            <AccordionItem value="limitations">
              <AccordionTrigger>Czego nie ustaliliśmy</AccordionTrigger>
              <AccordionContent className="flex flex-col gap-2">
                {unknowns.length > 0 ? (
                  <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-body">
                    {unknowns.map((u, i) => (
                      <li key={`${i}-${u}`}>{u}</li>
                    ))}
                  </ul>
                ) : null}
                {claim.limitations ? <p className="m-0 text-body">{claim.limitations}</p> : null}
              </AccordionContent>
            </AccordionItem>
          ) : null}
        </Accordion>
      ) : null}
      <p className="m-0 text-caption text-ink-muted">
        {evidence.length > 0
          ? `Na podstawie: ${count(evidence.length, SOURCE_FORMS)}`
          : 'Nie znaleźliśmy źródeł na ten temat.'}
        {insufficient ? ' Nie udostępniaj tej informacji dalej jako pewnej.' : null}
      </p>
    </>
  );
}

function OkView({ result, escalation }: { result: OkResult; escalation?: CaseEscalation }) {
  const byId = new Map(result.evidence.map((e) => [e.id, e]));
  const n = result.claims.length;

  return (
    <div className="flex flex-col gap-8">
      <SummaryBanner eyebrow="Wynik sprawdzenia" title={summaryTitle(n)}>
        <p>{result.summary}</p>
      </SummaryBanner>

      {escalation ? (
        <Notice title="Do sprawdzenia przez moderatora">
          <p>{ESCALATION_MESSAGE[escalation.reason]}</p>
        </Notice>
      ) : null}

      {result.warnings.length > 0 ? (
        <Notice variant="caution" title="Zwróć uwagę">
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
            {result.warnings.map((w, i) => (
              <li key={`${i}-${w}`}>{w}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {result.claims.map((claim, i) => (
        <div key={`${i}-${claim.claim}`} className="flex flex-col gap-8">
          {i > 0 ? <Separator /> : null}
          <ClaimCard
            eyebrow={`Twierdzenie ${i + 1} z ${n}`}
            claim={claim.claim}
            verdict={claim.verdict}
            explanation={claim.explanation}
            confidence={claim.verdict === 'nie podlega weryfikacji' ? undefined : claim.confidence}
            reasons={claim.confidenceReasons}
          >
            <ClaimEvidence
              claim={claim}
              evidence={claim.evidenceIds.flatMap((id) => byId.get(id) ?? [])}
            />
          </ClaimCard>
        </div>
      ))}

      {result.unchecked && result.unchecked.length > 0 ? (
        <Notice title="Tego nie udało się sprawdzić">
          <p>To nie jest ocena tych twierdzeń – źródła były niedostępne.</p>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
            {result.unchecked.map((u, i) => (
              <li key={`${i}-${u.claim}`}>
                „{u.claim}” – {u.reason}
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {result.searched && result.searched.length > 0 ? (
        <div className="flex flex-col gap-1">
          <Eyebrow>Gdzie sprawdziliśmy</Eyebrow>
          <p className="m-0 text-caption text-ink-muted">{result.searched.join(' · ')}</p>
        </div>
      ) : null}
    </div>
  );
}

const EXPORTS: ReadonlyArray<{ format: ExportFormat; label: string }> = [
  { format: 'csv', label: 'CSV' },
  { format: 'json', label: 'JSON' },
  { format: 'stix', label: 'STIX 2.1 (OpenCTI)' },
];

function download(format: ExportFormat, result: OkResult, checkId: string) {
  const file = exportFile(format, result, {
    resultUrl: resultUrl(window.location.origin, checkId),
  });
  const url = URL.createObjectURL(new Blob([file.content], { type: file.mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Web-only: the WhatsApp channel has no export. Files are built in the browser from the shown result. */
function ExportSection({ result, checkId }: { result: OkResult; checkId: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Eyebrow>Pobierz dane</Eyebrow>
      <p className="m-0 text-caption text-ink-muted">
        Twierdzenia, werdykty i źródła z tego sprawdzenia: CSV do arkusza, JSON do dalszej analizy,
        STIX 2.1 do importu w OpenCTI.
      </p>
      <div className="flex flex-wrap gap-2">
        {EXPORTS.map(({ format, label }) => (
          <Button
            key={format}
            variant="tool"
            size="sm"
            onClick={() => download(format, result, checkId)}
          >
            <Download strokeWidth={ICON_STROKE} aria-hidden="true" />
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** Result of a finished check. Only `ok` carries verdicts; every other status is a notice. */
export function CheckResult({
  checkId,
  result,
  escalation,
  onNewCheck,
  onRetry,
  onEdit,
  onRemove,
}: CheckResultProps) {
  const [copied, setCopied] = useState(false);
  const [removeFailed, setRemoveFailed] = useState(false);

  const copyLink = async () => {
    try {
      // Built from the id, not the address bar, which may carry an #anchor.
      await navigator.clipboard.writeText(resultUrl(window.location.origin, checkId));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const remove = async () => {
    setRemoveFailed(!(await onRemove()));
  };

  let body: ReactNode;
  switch (result.status) {
    case 'ok':
      body = <OkView result={result} {...(escalation ? { escalation } : {})} />;
      break;
    case 'needs_clarification':
      body = (
        <Notice title="Doprecyzuj, co chcesz sprawdzić">
          <p>{result.message}</p>
          <Button variant="secondary" className="justify-self-start" onClick={onEdit}>
            Popraw wiadomość
          </Button>
        </Notice>
      );
      break;
    case 'out_of_scope':
      body = (
        <Notice title="Tego nie sprawdzamy">
          <p>{result.message}</p>
        </Notice>
      );
      break;
    case 'error':
      body = (
        <Notice title={ERROR_TITLE[result.code]}>
          <p>{result.message}</p>
          <p>To nie jest ocena Twojej wiadomości – niczego nie rozstrzygnęliśmy.</p>
          {onRetry ? (
            <Button variant="secondary" className="justify-self-start" onClick={onRetry}>
              <RotateCcw strokeWidth={ICON_STROKE} aria-hidden="true" />
              Spróbuj ponownie
            </Button>
          ) : null}
        </Notice>
      );
      break;
  }

  return (
    <div className="flex flex-col gap-8">
      {body}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={onNewCheck}>Sprawdź inną wiadomość</Button>
        {result.status === 'ok' ? (
          <Button variant="secondary" onClick={() => void copyLink()}>
            {copied ? (
              <Check strokeWidth={ICON_STROKE} aria-hidden="true" />
            ) : (
              <Copy strokeWidth={ICON_STROKE} aria-hidden="true" />
            )}
            {copied ? 'Skopiowano link' : 'Kopiuj link do wyniku'}
          </Button>
        ) : null}
      </div>

      {result.status === 'ok' ? <ExportSection result={result} checkId={checkId} /> : null}

      <div className="flex flex-col gap-1">
        <Eyebrow>Zapis sprawdzenia</Eyebrow>
        <p className="m-0 text-caption text-ink-muted">
          Nr {checkId} · {formatDateTime(result.createdAt)}
          {result.status === 'ok' ? ` · ${count(result.evidence.length, SOURCE_FORMS)}` : null}.
          {result.status === 'ok' && result.reusedFrom
            ? ` To samo zgłoszenie sprawdziliśmy ${formatDateTime(result.reusedFrom.createdAt)}: pokazujemy tamten wynik, żeby odpowiedź była taka sama w każdym kanale.`
            : null}{' '}
          Przechowujemy go 72 godziny.{' '}
          <button
            type="button"
            className="pw-link cursor-pointer border-0 bg-transparent p-0 text-caption"
            onClick={() => void remove()}
          >
            Usuń to sprawdzenie
          </button>
        </p>
        {removeFailed ? (
          <p role="alert" className="m-0 text-caption text-verdict-false">
            Nie udało się usunąć zapisu. Spróbuj ponownie za chwilę.
          </p>
        ) : null}
      </div>
    </div>
  );
}
