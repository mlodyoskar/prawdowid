import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { SourceHit } from '@prawdowid/sources';

import { EvidenceRegistry } from './tools.ts';

const hit = (overrides: Partial<SourceHit> = {}): SourceHit => ({
  kind: 'corpus',
  title: 'Otwarcie obwodnicy',
  publisher: 'Ministerstwo Infrastruktury',
  url: 'https://example.gov.pl/obwodnica',
  publishedAt: '2026-11-18',
  fetchedAt: '2026-11-21',
  excerpt: 'Kierowcy pojadą nową trasą od piątku.',
  fragmentId: 'doc-1-f01',
  sourceType: 'primary',
  ...overrides,
});

test('ten sam fragment dostaje to samo id, inny fragment tego samego dokumentu: własne', () => {
  const registry = new EvidenceRegistry();
  const first = registry.register(hit());
  const again = registry.register(hit());
  const other = registry.register(
    hit({ fragmentId: 'doc-1-f03', excerpt: 'Nowa obwodnica ma 8,6 km długości.' }),
  );

  assert.equal(again.id, first.id);
  assert.notEqual(other.id, first.id);
  assert.equal(other.url, first.url);
  assert.equal(registry.byId.get(other.id)?.excerpt, 'Nowa obwodnica ma 8,6 km długości.');
  assert.equal(registry.byId.size, 2);
});

test('fact-check bez fragmentu jest rozpoznawany po adresie', () => {
  const registry = new EvidenceRegistry();
  const factcheck = { kind: 'factcheck', fragmentId: undefined, rating: 'Fałsz' } as const;
  const first = registry.register(hit(factcheck));
  assert.equal(registry.register(hit(factcheck)).id, first.id);
  assert.equal(first.id, 'fc_1');
});
