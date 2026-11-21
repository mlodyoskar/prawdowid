import { Info, ShieldAlert, type LucideIcon } from 'lucide-react';
import type * as React from 'react';

import { Alert, AlertDescription, AlertTitle } from './base/alert.tsx';
import { ICON_STROKE } from './icons.tsx';

type NoticeProps = Omit<React.ComponentProps<typeof Alert>, 'title'> & {
  title: React.ReactNode;
  icon?: LucideIcon;
};

/**
 * Message box. `notice` is for system messages that are NOT verdicts (failure, limits, clarify);
 * `caution` warns about a source's status. Never use either to show a verdict.
 */
export function Notice({ variant = 'notice', title, icon, children, ...props }: NoticeProps) {
  const Icon = icon ?? (variant === 'caution' ? ShieldAlert : Info);
  return (
    <Alert variant={variant} {...props}>
      <Icon strokeWidth={ICON_STROKE} aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      {children ? <AlertDescription>{children}</AlertDescription> : null}
    </Alert>
  );
}
