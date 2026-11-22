import type { IncidentCatalogState, IncidentMatch, Verdict } from '@prawdowid/contracts';
import { History } from 'lucide-react';

import { Notice } from '@/ui';

/**
 * Similar entries in the EUvsDisinfo catalogue. Context only: shown apart from the evidence,
 * in neutral styling and wording, never as a verdict or its basis.
 */
export function IncidentContext({
  incidents,
  verdict,
}: {
  incidents: IncidentMatch[];
  verdict: Verdict;
}) {
  if (incidents.length === 0) return null;
  return (
    <Notice icon={History} title="Podobne twierdzenie jest w katalogu EUvsDisinfo">
      <p className="m-0">
        Katalog unijnego zespołu East StratCom (ESDZ) opisuje przekazy, które uznał za
        dezinformację. Podobieństwo nie rozstrzyga, czy to konkretne twierdzenie jest prawdziwe.
        Naszą ocenę opieramy wyłącznie na źródłach wymienionych wyżej.
      </p>
      {verdict === 'brak wystarczających dowodów' ? (
        <p className="m-0 mt-2">
          Nie znaleźliśmy źródeł, które to rozstrzygają. Wpis w katalogu ich nie zastępuje.
        </p>
      ) : null}
      <ul className="m-0 mt-2 flex list-none flex-col gap-3 p-0">
        {incidents.map((m) => (
          <li key={m.url} className="flex flex-col gap-1">
            <a href={m.url} target="_blank" rel="noreferrer" className="font-bold underline">
              {m.title}
            </a>
            <span className="text-caption">Opis w katalogu (po angielsku): „{m.quote}”</span>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-2 text-caption">EUvsDisinfo nie wyraża oficjalnego stanowiska UE.</p>
    </Notice>
  );
}

const CATALOG_LABEL: Record<IncidentCatalogState['status'], string> = {
  checked: 'przejrzany',
  unavailable: 'niedostępny',
  skipped: 'pominięty',
};

/** One muted line under "Gdzie sprawdziliśmy": the catalogue is context, not an evidence source. */
export function IncidentCatalogLine({ state }: { state: IncidentCatalogState | undefined }) {
  if (!state) return null;
  return (
    <p className="m-0 text-caption text-ink-muted">
      Katalog incydentów EUvsDisinfo (kontekst, nie wpływa na ocenę): {CATALOG_LABEL[state.status]}
      {state.message ? `. ${state.message}` : ''}
    </p>
  );
}
