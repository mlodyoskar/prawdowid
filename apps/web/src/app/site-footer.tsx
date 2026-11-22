export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-line-soft bg-surface-alt">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-caption text-ink-muted sm:px-6">
        <span>Prawdowid · wyzwanie MSZ, HackNation 2026</span>
        <nav aria-label="Inne strony" className="flex flex-wrap gap-4">
          <a className="pw-link" href="/whatsapp">
            Symulator kanału WhatsApp
          </a>
          <a className="pw-link" href="/design">
            Design system
          </a>
        </nav>
      </div>
    </footer>
  );
}
