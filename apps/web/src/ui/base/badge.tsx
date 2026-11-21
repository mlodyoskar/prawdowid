import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type * as React from 'react';

import { cn } from '../lib/utils.ts';

/**
 * shadcn/ui Badge restyled: 2px radius, 14/20 bold. The verdict variants are what VerdictBadge uses,
 * and each one is always paired with an icon and a word.
 */
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-2 rounded-xs border border-transparent py-1.5 pr-3 pl-2 text-label font-bold [&>svg]:pointer-events-none [&>svg]:size-[18px] [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        neutral: 'bg-surface-alt text-ink',
        confirmed: 'bg-verdict-true-bg text-verdict-true',
        refuted: 'bg-verdict-false-bg text-verdict-false',
        misleading: 'bg-verdict-misleading-bg text-verdict-misleading',
        insufficient:
          'border-dashed border-verdict-insufficient bg-verdict-insufficient-bg text-verdict-insufficient',
        unverifiable: 'border-verdict-unverifiable bg-transparent text-verdict-unverifiable',
      },
      size: {
        default: '',
        lg: 'py-2 pr-4 pl-3 text-body font-bold',
      },
    },
    defaultVariants: {
      variant: 'neutral',
      size: 'default',
    },
  },
);

function Badge({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';
  return (
    <Comp
      data-slot="badge"
      data-variant={variant ?? 'neutral'}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
