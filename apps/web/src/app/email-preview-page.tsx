import type { ReactNode } from 'react';

import { AppHeader, Eyebrow, Notice } from '@/ui';

import { SiteFooter } from './site-footer.tsx';

/*
 * Design preview of the moderator notification e-mail. Nothing here is sent: the system only marks
 * a case `review_recommended` (apps/api/src/cases.ts). The sample content is illustrative.
 * Colours are literal hex values on purpose: e-mail clients do not read our CSS variables.
 */

const INK = '#1b1b1b';
const MUTED = '#595959';
const LINE = '#c4c4c4';
const LINE_SOFT = '#e6e6e6';
const PRIMARY = '#0052a5';
const PRIMARY_SOFT = '#e5eef7';
const RED = '#d4213d';
const FALSE = '#b3122e';
const INSUFFICIENT = '#3f4a5a';
const FONT = 'Arial, Helvetica, sans-serif';

function MailHeaders({ subject }: { subject: string }) {
  return (
    <dl
      className="m-0 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 px-1 text-[12px]"
      style={{ color: MUTED }}
    >
      <dt className="font-bold" style={{ color: INK }}>
        Od:
      </dt>
      <dd className="m-0">Prawdowid &lt;powiadomienia@prawdowid.example&gt;</dd>
      <dt className="font-bold" style={{ color: INK }}>
        Temat:
      </dt>
      <dd className="m-0">{subject}</dd>
    </dl>
  );
}

function MailButton({ children }: { children: ReactNode }) {
  return (
    // In the real e-mail this is a link; the preview shows it without a target.
    <span
      className="inline-block px-[22px] py-[14px] text-[15px] font-bold"
      style={{ background: PRIMARY, color: '#ffffff' }}
    >
      {children}
    </span>
  );
}

function Stat({ label, value, color = INK }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-1 p-3" style={{ border: `1px solid ${LINE}` }}>
      <span className="text-[12px]" style={{ color: MUTED }}>
        {label}
      </span>
      <span className="text-[14px] font-bold" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

/** Variant A: a full case card for one flagged case. */
function CaseCardMail() {
  return (
    <div
      className="flex flex-col gap-4 px-3 py-6 sm:px-6"
      style={{ background: '#f2f2f2', fontFamily: FONT, color: INK }}
    >
      <MailHeaders subject="[Prawdowid] Sprawa do weryfikacji: powtarzające się pytanie bez źródeł" />
      <div className="flex flex-col bg-white" style={{ border: `1px solid ${LINE}` }}>
        <div className="h-1.5" style={{ background: RED }} />
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 sm:px-7"
          style={{ borderBottom: `1px solid ${LINE_SOFT}` }}
        >
          <span className="text-[18px] font-bold">Prawdowid</span>
          <span className="text-[12px]" style={{ color: MUTED }}>
            Sprawa #C-0142 · 22.11.2026, 09:14
          </span>
        </div>
        <div className="flex flex-col gap-5 px-5 py-6 sm:px-7">
          <div className="flex flex-col gap-2">
            <span
              className="text-[12px] font-bold tracking-[0.08em] uppercase"
              style={{ color: RED }}
            >
              Rekomendacja weryfikacji
            </span>
            <h3 className="m-0 text-[22px] leading-tight">
              To samo pytanie wróciło 3 razy w ciągu doby, a system nie znalazł źródła
            </h3>
            <p className="m-0 text-[15px] leading-normal">
              Prawdowid wstrzymał się od rozstrzygnięcia. Sprawa wymaga oceny człowieka: czy
              istnieje dokument, który ją rozstrzyga, i czy warto go dodać do korpusu.
            </p>
          </div>
          <div className="flex flex-col gap-1.5 px-5 py-4" style={{ background: PRIMARY_SOFT }}>
            <span className="text-[12px]" style={{ color: MUTED }}>
              Twierdzenie (dane osobowe zamaskowane)
            </span>
            <span className="text-[17px] leading-snug font-bold">
              „Od grudnia wraca obowiązkowy pobór do wojska.”
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Werdykt" value="Brak wystarczających dowodów" color={INSUFFICIENT} />
            <Stat label="Zgłoszenia" value="3 w ciągu 24 h" />
            <Stat label="Kanały" value="WWW 2 · WhatsApp 1" />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[14px] font-bold">Czego nie ustalono</span>
            <ul className="m-0 flex flex-col gap-1 pl-5 text-[14px] leading-normal">
              <li>Brak komunikatu MON lub aktu prawnego o przywróceniu poboru.</li>
              <li>
                Rozstrzygnąłby to komunikat Ministerstwa Obrony Narodowej albo projekt ustawy w
                ISAP.
              </li>
            </ul>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <MailButton>Otwórz sprawę</MailButton>
            <span className="text-[14px] underline" style={{ color: PRIMARY }}>
              Zobacz ostatni wynik
            </span>
          </div>
        </div>
        <p
          className="m-0 px-5 py-4 text-[12px] leading-normal sm:px-7"
          style={{ borderTop: `1px solid ${LINE_SOFT}`, color: MUTED }}
        >
          Powód oznaczenia: <strong>repeat_no_evidence</strong> (co najmniej 3 zgłoszenia z
          werdyktem „brak wystarczających dowodów” w 24 h). Wiadomość zawiera tylko zamaskowane
          twierdzenie i liczniki, bez treści zgłoszeń ani danych zgłaszających. Otrzymujesz ją, bo
          administrator wskazał Cię jako moderatora.
        </p>
      </div>
    </div>
  );
}

/** Variant B: a short, text-first alert for quick triage. */
function ShortAlertMail() {
  const rows: [string, ReactNode][] = [
    [
      'Werdykt',
      <span key="verdict" style={{ color: FALSE, fontWeight: 700 }}>
        Fałszywe
      </span>,
    ],
    ['Główne źródło', 'GIS – ostrzeżenia, 21.11.2026'],
    ['Zgłoszenia', '1 (pierwsze)'],
    ['Powód', 'high_risk: temat z listy, werdykt inny niż „potwierdzone”'],
  ];
  return (
    <div
      className="flex flex-col gap-6 bg-white px-5 py-6 sm:px-10"
      style={{ fontFamily: FONT, color: INK }}
    >
      <div className="pb-4" style={{ borderBottom: `1px solid ${LINE_SOFT}` }}>
        <MailHeaders subject="Wysokie ryzyko: twierdzenie o zdrowiu publicznym oznaczone jako fałszywe" />
      </div>
      <div className="flex items-center gap-2.5">
        <span className="size-3 rounded-full" style={{ background: FALSE }} aria-hidden="true" />
        <span className="text-[13px] font-bold" style={{ color: FALSE }}>
          Wysokie ryzyko · zdrowie publiczne
        </span>
      </div>
      <p className="m-0 text-[16px] leading-relaxed">Dzień dobry,</p>
      <p className="m-0 text-[16px] leading-relaxed">
        Prawdowid oznaczył twierdzenie z tematu wysokiego ryzyka. System wydał werdykt{' '}
        <strong>fałszywe</strong> na podstawie komunikatu GIS. Prosimy o sprawdzenie, czy odpowiedź
        jest poprawna i czy sprawa wymaga reakcji.
      </p>
      <blockquote
        className="m-0 py-1 pl-4 text-[17px] leading-snug font-bold"
        style={{ borderLeft: `4px solid ${PRIMARY}` }}
      >
        „Woda w kranach w całym województwie jest skażona i nie wolno jej pić.”
      </blockquote>
      <table className="w-full border-collapse text-[14px] leading-normal">
        <tbody>
          {rows.map(([label, value], i) => (
            <tr key={label}>
              <th
                scope="row"
                className="w-40 py-1.5 text-left align-top font-normal"
                style={{ color: MUTED, borderTop: i > 0 ? `1px solid ${LINE_SOFT}` : undefined }}
              >
                {label}
              </th>
              <td
                className="py-1.5"
                style={{ borderTop: i > 0 ? `1px solid ${LINE_SOFT}` : undefined }}
              >
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-col items-start gap-3">
        <MailButton>Sprawdź odpowiedź systemu</MailButton>
        <span className="text-[13px]" style={{ color: MUTED }}>
          albo odpowiedz na tego maila, aby dodać notatkę do sprawy #C-0143
        </span>
      </div>
      <p
        className="m-0 pt-4 text-[12px] leading-normal"
        style={{ borderTop: `1px solid ${LINE_SOFT}`, color: MUTED }}
      >
        Werdykt wydał system automatyczny i nie jest ostateczną oceną. Mail zawiera tylko
        zamaskowane twierdzenie, bez danych zgłaszającego. Ustawienia powiadomień zmienia
        administrator.
      </p>
    </div>
  );
}

function Variant({
  id,
  label,
  title,
  description,
  children,
}: {
  id: string;
  label: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <Eyebrow>{label}</Eyebrow>
      <h2 id={id} className="m-0 text-title-2">
        {title}
      </h2>
      <p className="m-0 text-body text-ink-muted">{description}</p>
      <div className="overflow-hidden rounded-sm border border-line shadow-sm">{children}</div>
    </section>
  );
}

export function EmailPreviewPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <AppHeader>
        <a className="pw-link text-label" href="/">
          Sprawdź na stronie
        </a>
      </AppHeader>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-2">
          <Eyebrow>Sprawy moderatora</Eyebrow>
          <h1 className="m-0 text-title-1 sm:text-display">Podgląd powiadomienia dla moderatora</h1>
          <p className="m-0 max-w-3xl text-body-lg text-ink-muted">
            Tak mógłby wyglądać mail do moderatora wskazanego przez administratora, gdy system
            oznaczy sprawę do weryfikacji: przy pytaniu, które wraca bez źródeł, przy temacie
            wysokiego ryzyka albo przy próbie prompt injection.
          </p>
        </div>
        <Notice title="To tylko projekt">
          <p>
            Dziś system nie wysyła powiadomień: oznacza sprawę i pokazuje to w wyniku, ale nie
            pisze, że sprawę przekazano. Treść maili to przykład, nie prawdziwe zgłoszenia.
          </p>
        </Notice>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-8">
          <Variant
            id="wariant-a"
            label="Wariant A"
            title="Karta sprawy"
            description="Pełny obraz jednej sprawy: twierdzenie, werdykt, liczniki, czego nie ustalono i przycisk do sprawy."
          >
            <CaseCardMail />
          </Variant>
          <Variant
            id="wariant-b"
            label="Wariant B"
            title="Krótki alert"
            description="Zwykły mail tekstowy do szybkiej reakcji, czytelny także w prostym kliencie poczty."
          >
            <ShortAlertMail />
          </Variant>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
