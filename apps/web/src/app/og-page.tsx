import { AppHeader, ClaimCard } from '../ui/index.ts';

/**
 * Link preview image (public/og-image.png), built from the real UI components.
 * Dev only: the page is laid out at 600×315 CSS px and captured at 2× to get 1200×630,
 * so the components keep their app sizes and stay readable as a small thumbnail.
 *
 * Regenerate: run `pnpm --filter @prawdowid/web dev`, then from apps/web:
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
 *     --hide-scrollbars --force-device-scale-factor=2 --window-size=600,315 \
 *     --virtual-time-budget=5000 --screenshot=public/og-image.png http://localhost:5173/og
 */
export function OgPage() {
  return (
    <div className="relative flex h-[315px] w-[600px] flex-col overflow-hidden bg-surface text-ink">
      <AppHeader className="relative z-10" />

      <div className="flex min-h-0 flex-1">
        <section className="flex w-[268px] shrink-0 flex-col justify-center gap-3 pr-4 pl-6">
          <h1 className="m-0 text-display">
            Sprawdź informację, <span className="text-primary">zanim w nią uwierzysz.</span>
          </h1>
          <p className="m-0 text-body text-ink-muted">Pokazujemy, co mówią oficjalne źródła.</p>
        </section>

        {/* A peek at a real result: the card runs off the bottom edge, like a screen in the app. */}
        <div className="relative min-w-0 flex-1 bg-surface-alt pt-5 pl-5" aria-hidden="true">
          <div className="h-full rounded-tl-sm border-t border-l border-line bg-surface p-4">
            <ClaimCard
              eyebrow="Twierdzenie 1 z 2"
              claim="Spotkanie ministrów spraw zagranicznych NATO 2 grudnia odbędzie się w Warszawie."
              verdict="fałszywe"
              explanation="Ministerstwo Spraw Zagranicznych podaje, że spotkanie odbędzie się 2 grudnia 2026 r. w Brukseli. Tak samo podaje NATO."
              confidence="wysoka"
            />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface-alt to-transparent" />
        </div>
      </div>

      {/* Navy band with the red rule, as in gov.pl graphics. */}
      <div className="relative h-2 shrink-0 bg-primary-strong">
        <span className="absolute inset-y-0 left-6 w-14 bg-accent-red" />
      </div>
    </div>
  );
}
