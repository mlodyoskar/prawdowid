import type { Evidence, EvidenceUse, SourceType, Stance } from '@prawdowid/contracts';

import { formatDate, hostname, isWebUrl } from '@/lib/format.ts';
import { FactcheckSourceIcon, OfficialSourceIcon, SourceCard } from '@/ui';

const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  primary: 'Źródło pierwotne',
  secondary: 'Źródło wtórne',
};

const STANCE_LABEL: Record<Stance, string> = {
  supports: 'Potwierdza twierdzenie',
  refutes: 'Przeczy twierdzeniu',
  context: 'Uzupełnia kontekst',
};

/** Search engines mark hits with «»; they are not part of the source text. */
const stripMarkers = (text: string) => text.replace(/[«»]/g, '');

function typeLabel(e: Evidence): string {
  if (e.kind === 'factcheck') return 'Fact-check';
  return e.sourceType ? SOURCE_TYPE_LABEL[e.sourceType] : 'Źródło';
}

/**
 * Material on the same topic but about a different matter: title, publisher, date and link only.
 * No quote and no role, because it is not evidence for the claim.
 */
export function RelatedMaterial({ evidence: e }: { evidence: Evidence }) {
  const web = isWebUrl(e.url);
  const meta = [e.publisher, formatDate(e.publishedAt)].filter(Boolean).join(' · ');
  return (
    <li className="flex flex-col gap-0.5">
      {web ? (
        <a href={e.url} target="_blank" rel="noreferrer" className="text-body font-bold">
          {e.title}
        </a>
      ) : (
        <span className="text-body font-bold">{e.title}</span>
      )}
      {meta ? <span className="text-caption text-ink-muted">{meta}</span> : null}
    </li>
  );
}

/**
 * Maps an `Evidence` record from the API onto the design system's SourceCard.
 * `use` comes from plan mode: the source's role for this claim and the quote the code verified.
 */
export function EvidenceSource({ evidence: e, use }: { evidence: Evidence; use?: EvidenceUse }) {
  const quote = use?.quote || stripMarkers(e.excerpt);
  const web = isWebUrl(e.url);
  const published = formatDate(e.publishedAt);
  const fetched = formatDate(e.fetchedAt);
  const meta = [
    e.publisher,
    web ? hostname(e.url) : null,
    published ? `opubl. ${published}` : null,
    fetched ? `pobrano ${fetched}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <SourceCard
      typeLabel={typeLabel(e)}
      icon={e.kind === 'factcheck' ? FactcheckSourceIcon : OfficialSourceIcon}
      title={e.title}
      href={web ? e.url : undefined}
      meta={meta}
      quote={quote ? `„${quote}”` : undefined}
      footer={
        e.rating || use ? (
          <span className="flex flex-col gap-1 text-label">
            {e.rating ? (
              <span>
                Ocena fact-checkera: <span className="font-bold">{e.rating}</span>
              </span>
            ) : null}
            {use ? <span className="font-bold">{STANCE_LABEL[use.stance]}</span> : null}
          </span>
        ) : undefined
      }
    />
  );
}
