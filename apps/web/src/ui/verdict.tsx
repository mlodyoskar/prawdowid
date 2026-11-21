import { Verdict } from '@prawdowid/contracts';
import { CircleCheck, CircleSlash2, CircleX, TriangleAlert, type LucideIcon } from 'lucide-react';
import type * as React from 'react';

import { Badge } from './base/badge.tsx';
import { ICON_STROKE, InsufficientIcon } from './icons.tsx';

type VerdictVariant = 'confirmed' | 'refuted' | 'misleading' | 'insufficient' | 'unverifiable';

/** One entry per verdict from contracts: the type makes a missing verdict a compile error. */
export const VERDICT_META: Record<
  Verdict,
  { variant: VerdictVariant; label: string; Icon: LucideIcon | typeof InsufficientIcon }
> = {
  potwierdzone: { variant: 'confirmed', label: 'Potwierdzone', Icon: CircleCheck },
  fałszywe: { variant: 'refuted', label: 'Fałszywe', Icon: CircleX },
  'wprowadzające w błąd': {
    variant: 'misleading',
    label: 'Wprowadzające w błąd',
    Icon: TriangleAlert,
  },
  'brak wystarczających dowodów': {
    variant: 'insufficient',
    label: 'Brak wystarczających dowodów',
    Icon: InsufficientIcon,
  },
  'nie podlega weryfikacji': {
    variant: 'unverifiable',
    label: 'Nie podlega weryfikacji',
    Icon: CircleSlash2,
  },
};

export const VERDICTS: readonly Verdict[] = Verdict.options;

type VerdictBadgeProps = Omit<React.ComponentProps<typeof Badge>, 'variant' | 'children'> & {
  verdict: Verdict;
  /** Overrides the default label, e.g. "Nie podlega weryfikacji · opinia". */
  label?: string;
};

/** Verdict badge: always icon + word, since green and red have similar lightness. */
export function VerdictBadge({ verdict, label, ...props }: VerdictBadgeProps) {
  const meta = VERDICT_META[verdict];
  return (
    <Badge variant={meta.variant} {...props}>
      <meta.Icon strokeWidth={ICON_STROKE} aria-hidden="true" />
      {label ?? meta.label}
    </Badge>
  );
}
