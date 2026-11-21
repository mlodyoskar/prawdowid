import type { Evidence, SourceType } from '@prawdowid/contracts';

import { formatDate, hostname, isWebUrl } from '@/lib/format.ts';
import { FactcheckSourceIcon, OfficialSourceIcon, SourceCard } from '@/ui';

const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  primary: 'Źródło pierwotne',
  secondary: 'Źródło wtórne',
};

function typeLabel(e: Evidence): string {
  if (e.kind === 'factcheck') return 'Fact-check';
  return e.sourceType ? SOURCE_TYPE_LABEL[e.sourceType] : 'Źródło';
}

/** Maps an `Evidence` record from the API onto the design system's SourceCard. */
export function EvidenceSource({ evidence: e }: { evidence: Evidence }) {
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
      quote={e.excerpt ? `„${e.excerpt}”` : undefined}
      caution={e.isMock ? 'Dane demonstracyjne – to nie jest prawdziwa publikacja.' : undefined}
      footer={
        e.rating ? (
          <span className="text-label">
            Ocena fact-checkera: <span className="font-bold">{e.rating}</span>
          </span>
        ) : undefined
      }
    />
  );
}
