import {
  sourceQuotes,
  type Evidence,
  type SourceGroup,
  type SourceType,
  type Stance,
} from '@prawdowid/contracts';
import { useState } from 'react';

import { count, formatDate, hostname, isWebUrl } from '@/lib/format.ts';
import { Button, FactcheckSourceIcon, OfficialSourceIcon, SourceCard } from '@/ui';

const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  primary: 'Źródło pierwotne',
  secondary: 'Źródło wtórne',
};

const STANCE_LABEL: Record<Stance, string> = {
  supports: 'Potwierdza twierdzenie',
  refutes: 'Przeczy twierdzeniu',
  context: 'Uzupełnia kontekst',
};

const FRAGMENT_FORMS = ['fragment', 'fragmenty', 'fragmentów'] as const;

/** Quotes shown before "Pokaż jeszcze…". */
const VISIBLE_QUOTES = 2;

/** Search engines mark hits with «»; they are not part of the source text. */
const stripMarkers = (text: string) => text.replace(/[«»]/g, '');

function typeLabel(e: Evidence): string {
  if (e.kind === 'factcheck') return 'Fact-check';
  return e.sourceType ? SOURCE_TYPE_LABEL[e.sourceType] : 'Źródło';
}

/**
 * One publication behind a claim, as a SourceCard. Fragments of the same page (the search
 * returns them separately) become quotes in one card instead of repeated cards.
 */
export function EvidenceSource({ group }: { group: SourceGroup }) {
  const [expanded, setExpanded] = useState(false);
  const e = group.evidence;
  const quotes = sourceQuotes(group, (f) => stripMarkers(f.evidence.excerpt));
  const visible = expanded ? quotes : quotes.slice(0, VISIBLE_QUOTES);
  const hidden = quotes.length - visible.length;
  // One label for the card, unless fragments of this page play different roles.
  const mixed = group.stances.length > 1;
  const rating = group.fragments.find((f) => f.evidence.rating)?.evidence.rating;

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

  const stance = !mixed && group.stances[0] ? STANCE_LABEL[group.stances[0]] : null;
  const fragments =
    quotes.length > 1 ? count(quotes.length, FRAGMENT_FORMS) + ' z tej strony' : null;

  return (
    <SourceCard
      typeLabel={typeLabel(e)}
      icon={e.kind === 'factcheck' ? FactcheckSourceIcon : OfficialSourceIcon}
      title={e.title}
      href={web ? e.url : undefined}
      meta={meta}
      quote={
        visible.length > 0 ? (
          <span className="flex flex-col gap-3">
            {visible.map((q, i) => (
              <span key={`${i}-${q.fragment.evidence.id}`} className="flex flex-col gap-1">
                <span>„{q.text}”</span>
                {mixed && q.fragment.use ? (
                  <span className="text-label font-bold">
                    {STANCE_LABEL[q.fragment.use.stance]}
                  </span>
                ) : null}
              </span>
            ))}
          </span>
        ) : undefined
      }
      footer={
        rating || stance || fragments || hidden > 0 ? (
          <span className="flex flex-col items-start gap-1 text-label">
            {rating ? (
              <span>
                Ocena fact-checkera: <span className="font-bold">{rating}</span>
              </span>
            ) : null}
            {stance || fragments ? (
              <span className="font-bold">{[stance, fragments].filter(Boolean).join(' · ')}</span>
            ) : null}
            {hidden > 0 ? (
              <Button variant="text" size="sm" className="px-0" onClick={() => setExpanded(true)}>
                Pokaż jeszcze {count(hidden, FRAGMENT_FORMS)}
              </Button>
            ) : null}
          </span>
        ) : undefined
      }
    />
  );
}
