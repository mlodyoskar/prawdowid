import type * as React from 'react';

import { Label } from './base/label.tsx';
import { cn } from './lib/utils.ts';

type FieldProps = {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  /** The control. Wire it up with `id`, plus `aria-describedby={describedBy(id, …)}`. */
  children: React.ReactNode;
};

export const hintId = (id: string) => `${id}-hint`;
export const errorId = (id: string) => `${id}-error`;

/** Ids for `aria-describedby`, in reading order: error first, then hint. */
export function describedBy(id: string, { hint, error }: { hint?: boolean; error?: boolean }) {
  return [error && errorId(id), hint && hintId(id)].filter(Boolean).join(' ') || undefined;
}

/** Form field: label, control, hint and error stacked 8px apart. */
export function Field({ id, label, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={errorId(id)} className="m-0 text-label text-verdict-false">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId(id)} className="m-0 text-caption text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
