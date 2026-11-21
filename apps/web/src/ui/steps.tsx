import { cn } from './lib/utils.ts';

type StepsProps = {
  steps: readonly string[];
  /** Index of the step in progress. Earlier steps are done, later ones pending. */
  current: number;
  label: string;
  className?: string;
};

/** Progress list: filled dot = done, ringed dot = in progress, empty dot = pending. */
export function Steps({ steps, current, label, className }: StepsProps) {
  return (
    <ol aria-label={label} className={cn('m-0 flex list-none flex-col gap-4 p-0', className)}>
      {steps.map((step, i) => {
        const state = i < current ? 'done' : i === current ? 'now' : 'todo';
        return (
          <li
            key={step}
            aria-current={state === 'now' ? 'step' : undefined}
            className={cn(
              'flex items-center gap-3 text-body',
              state === 'todo' ? 'text-ink-muted' : 'text-ink',
              state === 'now' && 'font-semibold',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'box-border size-3.5 shrink-0 rounded-full border-2',
                state === 'done' && 'border-primary bg-primary',
                state === 'now' &&
                  'border-primary shadow-[inset_0_0_0_2px_var(--surface),inset_0_0_0_7px_var(--primary)] motion-safe:animate-pulse',
                state === 'todo' && 'border-line-strong',
              )}
            />
            {step}
            {state === 'done' ? <span className="sr-only"> (gotowe)</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
