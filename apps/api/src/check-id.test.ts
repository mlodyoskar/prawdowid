import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkIdFromLocation, resultUrl } from '@prawdowid/contracts';

import { CHECK_ID_LENGTH, newCheckId } from './check-id.ts';

test('id sprawdzenia jest krótki, z bezpiecznych znaków i losowy', () => {
  const ids = new Set(Array.from({ length: 2000 }, newCheckId));
  assert.equal(ids.size, 2000);
  for (const id of ids) assert.match(id, new RegExp(`^[A-Za-z0-9]{${CHECK_ID_LENGTH}}$`));
});

test('link do wyniku: /w/<id>, bez śmieci z adresu', () => {
  assert.equal(resultUrl('https://p.example/', 'K7m2Qx9pLa'), 'https://p.example/w/K7m2Qx9pLa');
  assert.equal(checkIdFromLocation('/w/K7m2Qx9pLa', ''), 'K7m2Qx9pLa');
  assert.equal(checkIdFromLocation('/w/K7m2Qx9pLa/', ''), 'K7m2Qx9pLa');
  assert.equal(
    checkIdFromLocation('/', '?check=dac47a35-04ca'),
    'dac47a35-04ca',
    'stare linki działają',
  );
  assert.equal(checkIdFromLocation('/w/', ''), null);
  assert.equal(checkIdFromLocation('/w/a/b', ''), null);
  assert.equal(checkIdFromLocation('/', ''), null);
});
