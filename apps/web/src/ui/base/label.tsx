import { Label as LabelPrimitive } from 'radix-ui';
import type * as React from 'react';

import { cn } from '../lib/utils.ts';

/** shadcn/ui Label: label style (14/20 semibold). */
function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn('text-label text-ink select-none', className)}
      {...props}
    />
  );
}

export { Label };
