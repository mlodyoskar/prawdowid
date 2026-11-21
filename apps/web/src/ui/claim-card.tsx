import type { Confidence, Verdict } from '@prawdowid/contracts';
import type * as React from 'react';

import { Eyebrow } from './eyebrow.tsx';
import { cn } from './lib/utils.ts';
import { StrengthMeter } from './strength-meter.tsx';
import { VerdictBadge } from './verdict.tsx';

type ClaimCardProps = {
  /** "Twierdzenie 1 z 2". */
  eyebrow: string;
  claim: string;
  verdict: Verdict;
  explanation: string;
  /** Omitted for verdicts with nothing to weigh (not verifiable). */
  confidence?: Confidence;
  reasons?: readonly string[];
  /** Sources, limitations, links: whatever goes under the verdict. */
  children?: React.ReactNode;
  className?: string;
};

/** One checked claim: the quoted claim, the verdict, the plain-language answer and its strength. */
export function ClaimCard({
  eyebrow,
  claim,
  verdict,
  explanation,
  confidence,
  reasons,
  children,
  className,
}: ClaimCardProps) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <p className="m-0 text-title-3">„{claim}”</p>
      <VerdictBadge verdict={verdict} size="lg" />
      <p className="m-0 text-body-lg">{explanation}</p>
      {confidence ? <StrengthMeter confidence={confidence} reasons={reasons} /> : null}
      {children}
    </section>
  );
}
