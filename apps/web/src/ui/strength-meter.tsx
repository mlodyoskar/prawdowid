import type { Confidence } from '@prawdowid/contracts';

import { cn } from './lib/utils.ts';

export const CONFIDENCE_LEVEL: Record<Confidence, { level: 1 | 2 | 3; label: string }> = {
  niska: { level: 1, label: 'Słaba' },
  średnia: { level: 2, label: 'Umiarkowana' },
  wysoka: { level: 3, label: 'Silna' },
};

type StrengthMeterProps = {
  confidence: Confidence;
  /** Short reasons shown under the bar: "2 niezależne źródła pierwotne". */
  reasons?: readonly string[];
  className?: string;
};

/** "Siła podstawy odpowiedzi": how strong the evidence behind a verdict is, in 3 steps. */
export function StrengthMeter({ confidence, reasons, className }: StrengthMeterProps) {
  const { level, label } = CONFIDENCE_LEVEL[confidence];
  return (
    <div className={cn('flex flex-col gap-2 rounded-sm bg-surface-alt p-4', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-label">Siła podstawy odpowiedzi</span>
        <span className="text-label font-bold text-primary">{label}</span>
      </div>
      <div className="grid grid-cols-3 gap-1" aria-hidden="true">
        {[1, 2, 3].map((step) => (
          <i
            key={step}
            className={cn(
              'h-2 border',
              step <= level ? 'border-primary bg-primary' : 'border-line-strong bg-surface',
            )}
          />
        ))}
      </div>
      {reasons && reasons.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-caption text-ink-muted">
          {reasons.map((reason) => (
            <li key={reason}>– {reason}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
