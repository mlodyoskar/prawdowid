import type * as React from 'react';

import { cn } from '../lib/utils.ts';

/** shadcn/ui Textarea restyled: line-strong border (≥3:1), 16px text, 148px minimum height. */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'field-sizing-content block min-h-37 w-full resize-y rounded-sm border border-line-strong bg-surface px-4 py-3 text-body text-ink placeholder:text-ink-muted disabled:cursor-not-allowed disabled:bg-surface-alt aria-invalid:border-verdict-false',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
