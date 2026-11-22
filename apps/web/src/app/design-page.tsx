import type { Evidence } from '@prawdowid/contracts';
import { ArrowRight } from 'lucide-react';
import { type ReactNode } from 'react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  AppHeader,
  Button,
  ClaimCard,
  describedBy,
  Eyebrow,
  Field,
  ICON_STROKE,
  Notice,
  Separator,
  Steps,
  StrengthMeter,
  SummaryBanner,
  Textarea,
  VERDICTS,
  VerdictBadge,
} from '@/ui';

import { EvidenceSource } from './evidence-source.tsx';
import { SiteFooter } from './site-footer.tsx';

const COLOR_GROUPS: { title: string; tokens: string[] }[] = [
  { title: 'Powierzchnie', tokens: ['surface', 'surface-alt', 'surface-raised'] },
  { title: 'Linie', tokens: ['line', 'line-strong', 'line-soft'] },
  { title: 'Tekst', tokens: ['ink', 'ink-muted'] },
  {
    title: 'Marka',
    tokens: [
      'primary',
      'primary-hover',
      'primary-strong',
      'primary-soft',
      'on-primary',
      'accent-red',
      'focus',
    ],
  },
  {
    title: 'Werdykty',
    tokens: [
      'verdict-true',
      'verdict-true-bg',
      'verdict-false',
      'verdict-false-bg',
      'verdict-misleading',
      'verdict-misleading-bg',
      'verdict-insufficient',
      'verdict-insufficient-bg',
      'verdict-unverifiable',
    ],
  },
  { title: 'Komunikaty', tokens: ['notice', 'notice-bg', 'caution', 'caution-bg'] },
];

const TYPE_STYLES: { cls: string; spec: string; sample: string }[] = [
  { cls: 'text-display', spec: '30/38 · 700', sample: 'Sprawdź, zanim udostępnisz' },
  { cls: 'text-title-1', spec: '24/32 · 700', sample: 'Wynik sprawdzenia' },
  { cls: 'text-title-2', spec: '20/28 · 600', sample: 'Źródła, na których się opieramy' },
  { cls: 'text-title-3', spec: '18/26 · 600', sample: 'Ministerstwo Spraw Zagranicznych' },
  {
    cls: 'text-body-lg',
    spec: '18/28 · 400',
    sample: 'Nie znaleźliśmy wiarygodnych publikacji, które potwierdzają tę informację.',
  },
  {
    cls: 'text-body',
    spec: '16/24 · 400',
    sample: 'Wklej tekst lub link do wiadomości, którą chcesz sprawdzić.',
  },
  { cls: 'text-label', spec: '14/20 · 600', sample: 'Siła podstawy odpowiedzi' },
  { cls: 'text-caption', spec: '14/20 · 400', sample: '20.11.2026 · gov.pl · pobrano 21.11.2026' },
  { cls: 'text-eyebrow uppercase', spec: '13/18 · 600', sample: 'Twierdzenie 1 z 2' },
];

const OFFICIAL: Evidence = {
  id: 'e1',
  kind: 'corpus',
  sourceType: 'primary',
  title:
    'Informacja o możliwości akredytacji mediów na spotkanie ministrów spraw zagranicznych państw członkowskich NATO',
  publisher: 'Ministerstwo Spraw Zagranicznych',
  url: 'https://www.gov.pl/web/dyplomacja',
  publishedAt: '2026-11-20T10:00:00Z',
  fetchedAt: '2026-11-21T10:00:00Z',
  excerpt:
    '02 grudnia 2026, Bruksela, Belgia – spotkanie ministrów spraw zagranicznych państw członkowskich NATO.',
};

const FACTCHECK: Evidence = {
  id: 'e2',
  kind: 'factcheck',
  title: 'Czy spotkanie NATO odbędzie się w Warszawie?',
  publisher: 'Demagog',
  url: 'https://demagog.org.pl',
  publishedAt: '2026-11-19T10:00:00Z',
  fetchedAt: '2026-11-21T10:00:00Z',
  excerpt: 'Spotkanie ministrów odbędzie się w kwaterze głównej NATO w Brukseli.',
  rating: 'Fałsz',
};

const ARCHIVE: Evidence = {
  id: 'e3',
  kind: 'corpus',
  sourceType: 'secondary',
  title: 'Szczyt NATO w Warszawie, 8–9 lipca 2016 r.',
  publisher: 'Ministerstwo Obrony Narodowej',
  url: 'https://www.gov.pl/web/obrona-narodowa',
  publishedAt: '2016-07-01T10:00:00Z',
  fetchedAt: '2026-11-21T10:00:00Z',
  excerpt: '',
};

const SAMPLE_EVIDENCE: readonly Evidence[] = [OFFICIAL, FACTCHECK, ARCHIVE];

function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex scroll-mt-6 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="m-0 text-title-1">
          {title}
        </h2>
        {intro ? <p className="m-0 text-body text-ink-muted">{intro}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Specimen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <Eyebrow>{label}</Eyebrow>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </div>
  );
}

/** Living catalog of tokens and components. Reach it at /design. */
export function DesignPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <AppHeader />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-16 px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-2">
          <Eyebrow>Prawdowid · gov.pl</Eyebrow>
          <h1 className="m-0 text-display">Design system</h1>
          <p className="m-0 max-w-2xl text-body-lg text-ink-muted">
            Tokeny i komponenty interfejsu. Kod jest w <code>apps/web/src/ui</code>: prymitywy
            shadcn/ui w <code>base/</code>, komponenty Prawdowid obok.
          </p>
        </div>

        <Section
          id="colors"
          title="Kolory"
          intro={
            <>
              Klasy Tailwind z nazwy tokenu: <code>bg-surface</code>, <code>text-ink-muted</code>,{' '}
              <code>border-line-strong</code>. Czerwony akcent tylko w nagłówku – nigdy jako
              werdykt.
            </>
          }
        >
          {COLOR_GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-3">
              <h3 className="m-0 text-title-3">{group.title}</h3>
              <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-5">
                {group.tokens.map((token) => (
                  <li key={token} className="flex flex-col gap-2">
                    <span
                      className="h-14 rounded-sm border border-line-soft"
                      style={{ background: `var(--${token})` }}
                    />
                    <code className="text-caption break-all">{token}</code>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Section>

        <Section
          id="type"
          title="Typografia"
          intro="Open Sans. Klasa ustawia rozmiar, interlinię i grubość. Treść nigdy poniżej 16 px."
        >
          <ul className="m-0 flex list-none flex-col gap-5 p-0">
            {TYPE_STYLES.map((t) => (
              <li key={t.cls} className="grid gap-1 sm:grid-cols-[180px_1fr] sm:gap-6">
                <span className="text-caption text-ink-muted">
                  <code>{t.cls.split(' ')[0]}</code> · {t.spec}
                </span>
                <span className={t.cls}>{t.sample}</span>
              </li>
            ))}
          </ul>
          <p className="m-0 text-body">
            Link w tekście jest zawsze podkreślony:{' '}
            <a className="pw-link" href="#type">
              zobacz wszystkie
            </a>
            .
          </p>
        </Section>

        <Section
          id="buttons"
          title="Przyciski"
          intro="Wysokość dotykowa 48 px. Jeden przycisk główny (WERSALIKI) na ekran."
        >
          <Specimen label="Warianty">
            <Button>Sprawdź</Button>
            <Button variant="secondary">Udostępnij wynik</Button>
            <Button variant="text">Anuluj sprawdzanie</Button>
            <Button variant="tool" size="sm">
              Dodaj zdjęcie
            </Button>
          </Specimen>
          <Specimen label="Z ikoną, wyłączony, jako link">
            <Button>
              Sprawdź
              <ArrowRight strokeWidth={ICON_STROKE} aria-hidden="true" />
            </Button>
            <Button disabled>Sprawdzamy…</Button>
            <Button variant="secondary" asChild>
              <a href="#buttons">Link jako przycisk</a>
            </Button>
          </Specimen>
        </Section>

        <Section id="fields" title="Pola formularza">
          <div className="grid gap-6 md:grid-cols-2">
            <Field
              id="demo-field"
              label="Co chcesz sprawdzić?"
              hint="Wklej tekst lub link do wiadomości."
            >
              <Textarea
                id="demo-field"
                placeholder="Wklej wiadomość…"
                aria-describedby={describedBy('demo-field', { hint: true })}
              />
            </Field>
            <Field id="demo-error" label="Z błędem" error="Wpisz lub wklej wiadomość.">
              <Textarea
                id="demo-error"
                aria-invalid
                aria-describedby={describedBy('demo-error', { error: true })}
              />
            </Field>
          </div>
        </Section>

        <Section
          id="verdicts"
          title="Werdykty"
          intro="Zawsze ikona i słowo: zieleń i czerwień mają podobną jasność. Wstrzymanie się ma przerywaną ramkę."
        >
          <Specimen label="Domyślny">
            {VERDICTS.map((v) => (
              <VerdictBadge key={v} verdict={v} />
            ))}
          </Specimen>
          <Specimen label="Duży (size=lg)">
            {VERDICTS.map((v) => (
              <VerdictBadge key={v} verdict={v} size="lg" />
            ))}
          </Specimen>
        </Section>

        <Section id="strength" title="Siła podstawy odpowiedzi">
          <div className="grid gap-4 md:grid-cols-3">
            <StrengthMeter confidence="niska" reasons={['brak źródła pierwotnego na ten temat']} />
            <StrengthMeter confidence="średnia" reasons={['1 źródło pierwotne']} />
            <StrengthMeter
              confidence="wysoka"
              reasons={['2 niezależne źródła pierwotne', 'oba z ostatnich 7 dni']}
            />
          </div>
        </Section>

        <Section
          id="sources"
          title="Karty źródeł"
          intro="Płaskie, bez cienia. Cytat to dokładny fragment źródła."
        >
          <div className="grid gap-4 md:grid-cols-2">
            {SAMPLE_EVIDENCE.map((e) => (
              <EvidenceSource key={e.id} evidence={e} />
            ))}
          </div>
        </Section>

        <Section
          id="notices"
          title="Komunikaty"
          intro="Komunikat systemowy nigdy nie jest werdyktem: awaria to nie ocena wiadomości."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Notice title="Nie udało się odczytać obrazu">
              <p>
                Usługa odczytu tekstu z obrazu jest chwilowo niedostępna. To nie jest ocena Twojej
                wiadomości.
              </p>
            </Notice>
            <Notice variant="caution" title="Materiał archiwalny">
              <p>Źródło jest z 2016 r. Może wyjaśniać, skąd wzięła się pogłoska.</p>
            </Notice>
          </div>
        </Section>

        <Section id="steps" title="Postęp">
          <Steps
            label="Postęp sprawdzania"
            current={1}
            steps={[
              'Rozpoznaliśmy 2 twierdzenia do sprawdzenia',
              'Szukamy w źródłach urzędowych…',
              'Przygotowujemy odpowiedź',
            ]}
          />
        </Section>

        <Section id="result" title="Wynik" intro="Baner podsumowania i karta twierdzenia.">
          <div className="flex max-w-3xl flex-col gap-8">
            <SummaryBanner eyebrow="Wynik sprawdzenia" title="W wiadomości są 2 twierdzenia">
              <p>Jedno jest fałszywe. Dla drugiego nie mamy wystarczających dowodów.</p>
            </SummaryBanner>
            <ClaimCard
              eyebrow="Twierdzenie 1 z 2"
              claim="Spotkanie ministrów spraw zagranicznych NATO 2 grudnia odbędzie się w Warszawie."
              verdict="fałszywe"
              explanation="Ministerstwo Spraw Zagranicznych podaje, że spotkanie odbędzie się 2 grudnia 2026 r. w Brukseli. Tak samo podaje NATO."
              confidence="wysoka"
              reasons={['2 niezależne źródła pierwotne (MSZ, NATO)', 'oba z ostatnich 7 dni']}
            >
              <EvidenceSource evidence={OFFICIAL} />
              <Accordion type="multiple">
                <AccordionItem value="more">
                  <AccordionTrigger>Pokaż pozostałe źródła (1)</AccordionTrigger>
                  <AccordionContent>
                    <EvidenceSource evidence={FACTCHECK} />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </ClaimCard>
            <Separator />
            <ClaimCard
              eyebrow="Twierdzenie 2 z 2"
              claim="Na ten dzień zostanie zamknięta przestrzeń powietrzna nad stolicą."
              verdict="brak wystarczających dowodów"
              explanation="Nie znaleźliśmy komunikatu żadnej instytucji o zamknięciu przestrzeni powietrznej 2 grudnia."
              confidence="niska"
            />
          </div>
        </Section>
      </main>

      <SiteFooter />
    </div>
  );
}
