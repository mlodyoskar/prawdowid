import type * as React from 'react';

import { cn } from './lib/utils.ts';

type AppHeaderProps = {
  href?: string;
  /** Right-hand slot: links or actions. */
  children?: React.ReactNode;
  className?: string;
};

/** Site header: a blue bar with the name, a thin rule, and the claim, all in white. */
export function AppHeader({ href = '/', children, className }: AppHeaderProps) {
  return (
    <header className={cn('bg-header text-on-header shadow-bar', className)}>
      <div className="mx-auto flex min-h-appbar max-w-5xl items-center gap-3 px-4 sm:px-6">
        <a
          href={href}
          className={cn(
            'flex items-center gap-3 self-stretch text-on-header no-underline',
            'focus-visible:outline-on-header',
          )}
          aria-label="Prawdowid – zobacz, co mówią źródła, strona główna"
        >
          <span className="text-[22px] leading-7 font-bold tracking-[-0.01em]">Prawdowid</span>
          <span className="my-3 w-0.5 self-stretch bg-on-header/60" aria-hidden="true" />
          <span className="text-[13px] leading-4">
            Zobacz, co mówią
            <br />
            źródła
          </span>
        </a>
        {children ? <div className="ml-auto flex items-center gap-4">{children}</div> : null}
      </div>
    </header>
  );
}
