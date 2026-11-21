import { FileText, Newspaper, ShieldAlert, type LucideIcon } from 'lucide-react';
import type * as React from 'react';

import { ICON_STROKE } from './icons.tsx';
import { cn } from './lib/utils.ts';

type SourceCardProps = {
  /** "Źródło urzędowe", "Fact-check · Demagog". */
  typeLabel: string;
  icon?: LucideIcon;
  title: string;
  /** Rendered as a link only when set. */
  href?: string;
  /** "Ministerstwo Spraw Zagranicznych · gov.pl · opubl. 20.11.2026". */
  meta: string;
  /** Exact excerpt from the source. */
  quote?: React.ReactNode;
  /** Neutral warning about the source (archive, sanctions, mock data). */
  caution?: React.ReactNode;
  /** Extra line at the bottom, e.g. the fact-checker's rating. */
  footer?: React.ReactNode;
  className?: string;
};

/** A source behind a verdict: type, linked title, publisher and dates, quoted excerpt. Flat, no shadow. */
export function SourceCard({
  typeLabel,
  icon: Icon = FileText,
  title,
  href,
  meta,
  quote,
  caution,
  footer,
  className,
}: SourceCardProps) {
  return (
    <article
      className={cn(
        'flex flex-col gap-2 rounded-sm border border-line bg-surface-raised p-4',
        className,
      )}
    >
      <span className="flex items-center gap-2 text-eyebrow text-ink-muted uppercase">
        <Icon className="size-[18px]" strokeWidth={ICON_STROKE} aria-hidden="true" />
        {typeLabel}
      </span>
      <h3 className="m-0 text-title-3 break-words">
        {href ? (
          <a className="pw-link" href={href} target="_blank" rel="noopener noreferrer">
            {title}
            <span className="sr-only"> (otwiera się w nowej karcie)</span>
          </a>
        ) : (
          title
        )}
      </h3>
      <span className="text-caption text-ink-muted">{meta}</span>
      {quote ? (
        <blockquote className="m-0 border-l-3 border-primary bg-primary-soft px-4 py-3 text-body">
          {quote}
        </blockquote>
      ) : null}
      {caution ? (
        <p className="m-0 flex items-start gap-2 text-label text-caution">
          <ShieldAlert
            className="mt-px size-[18px] shrink-0"
            strokeWidth={ICON_STROKE}
            aria-hidden="true"
          />
          {caution}
        </p>
      ) : null}
      {footer}
    </article>
  );
}

export { FileText as OfficialSourceIcon, Newspaper as FactcheckSourceIcon };
