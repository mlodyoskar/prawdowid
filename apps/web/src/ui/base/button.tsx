import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type * as React from 'react';

import { cn } from '../lib/utils.ts';

/**
 * shadcn/ui Button restyled to gov.pl: 48px touch height, 4px radius, 2px primary border.
 * - primary: main action, UPPERCASE like "SZUKAJ" on gov.pl. One per screen.
 * - secondary: outlined, for the second action.
 * - text: underlined link-like action (cancel, delete).
 * - tool: small outlined control next to a field (add image).
 */
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-sm border-2 text-body font-bold tracking-[0.02em] whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        primary:
          'border-primary bg-primary text-on-primary uppercase hover:border-primary-hover hover:bg-primary-hover',
        secondary:
          'border-primary bg-surface font-semibold tracking-normal text-primary hover:bg-primary-soft',
        text: 'border-transparent bg-transparent font-semibold tracking-normal text-primary underline underline-offset-2 hover:text-primary-hover',
        tool: 'border border-line-strong bg-surface text-label tracking-normal text-ink hover:border-primary hover:text-primary',
      },
      size: {
        default: 'min-h-touch px-6',
        sm: 'min-h-11 px-3',
        icon: 'size-touch',
      },
    },
    compoundVariants: [{ variant: 'text', size: 'default', className: 'px-2' }],
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      data-variant={variant ?? 'primary'}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
