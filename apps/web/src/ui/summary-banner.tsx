import type * as React from 'react';

import { cn } from './lib/utils.ts';

type SummaryBannerProps = {
  eyebrow: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  /** Lets the page move focus here when the result arrives. */
  headingRef?: React.Ref<HTMLHeadingElement>;
};

/** Navy summary block at the top of a result (primary-strong, like MSZ graphics on gov.pl). */
export function SummaryBanner({
  eyebrow,
  title,
  children,
  className,
  headingRef,
}: SummaryBannerProps) {
  return (
    <section
      className={cn(
        'flex flex-col gap-3 rounded-sm bg-primary-strong px-4 py-6 text-on-primary sm:px-6',
        className,
      )}
    >
      <span className="text-eyebrow uppercase">{eyebrow}</span>
      <h2 ref={headingRef} tabIndex={-1} className="m-0 text-title-1 outline-offset-4">
        {title}
      </h2>
      {children ? <div className="text-body [&_p]:m-0">{children}</div> : null}
    </section>
  );
}
