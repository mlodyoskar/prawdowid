import type * as React from 'react';

import { cn } from './lib/utils.ts';

/** Small uppercase overline above a block: "TWIERDZENIE 1 Z 2", "GDZIE SZUKAMY". */
export function Eyebrow({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span className={cn('block text-eyebrow text-ink-muted uppercase', className)} {...props} />
  );
}
