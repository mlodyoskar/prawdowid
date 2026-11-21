import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '../lib/utils.ts';

/**
 * shadcn/ui Alert restyled as the gov.pl message box: tinted background and a 4px side bar.
 * - notice: system messages that are NOT verdicts (failure, limit, clarify, out of scope).
 * - caution: neutral warning about a source (sanctioned entity, archival material).
 * Pass `role="status"` or `role="alert"` only when the box appears in response to an action.
 */
const alertVariants = cva(
  'grid w-full grid-cols-[0_1fr] items-start gap-y-1 border-l-4 p-4 text-body text-ink has-[>svg]:grid-cols-[24px_1fr] has-[>svg]:gap-x-3 [&>svg]:size-6',
  {
    variants: {
      variant: {
        notice: 'border-notice bg-notice-bg [&>svg]:text-notice',
        caution:
          'border-caution bg-caution-bg [&>svg]:text-caution *:data-[slot=alert-title]:text-caution',
      },
    },
    defaultVariants: {
      variant: 'notice',
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="alert-title"
      className={cn('col-start-2 m-0 text-body font-bold', className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn('col-start-2 grid gap-2 text-body [&_p]:m-0', className)}
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertTitle, alertVariants };
