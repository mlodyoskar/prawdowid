import type * as React from 'react';

import { cn } from './lib/utils.ts';

type AppHeaderProps = {
  href?: string;
  /** Right-hand slot: links or actions. */
  children?: React.ReactNode;
  className?: string;
};

/** Site header: name, the red gov.pl rule, and the service name. The rule is the only red. */
export function AppHeader({ href = '/', children, className }: AppHeaderProps) {
  return (
    <header className={cn('bg-surface shadow-bar', className)}>
      <div className="mx-auto flex min-h-appbar max-w-5xl items-center gap-3 px-4 sm:px-6">
        <a
          href={href}
          className="flex items-center gap-3 self-stretch text-ink no-underline"
          aria-label="Prawdowid – sprawdzanie informacji, strona główna"
        >
          <span className="text-[22px] leading-7 font-bold tracking-[-0.01em]">Prawdowid</span>
          <span className="my-3 w-0.5 self-stretch bg-accent-red" aria-hidden="true" />
          <span className="text-[13px] leading-4">
            Sprawdzanie
            <br />
            informacji
          </span>
        </a>
        {children ? <div className="ml-auto flex items-center gap-4">{children}</div> : null}
      </div>
    </header>
  );
}
