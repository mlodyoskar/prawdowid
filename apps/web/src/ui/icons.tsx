import type { LucideProps } from 'lucide-react';

/**
 * Icons are lucide-react at stroke 1.75, which matches the mockups' 24px line icons.
 * Pass `strokeWidth={ICON_STROKE}` and keep decorative icons `aria-hidden`.
 */
export const ICON_STROKE = 1.75;

/** "Brak wystarczających dowodów": dashed circle with a dash. Lucide has no match. */
export function InsufficientIcon(props: LucideProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={ICON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
      <path d="M8.5 12h7" />
    </svg>
  );
}
