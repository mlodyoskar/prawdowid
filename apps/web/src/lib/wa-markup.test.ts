import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseLine, parseWhatsApp } from './wa-markup.ts';

test('bold, italic and strikethrough markers', () => {
  assert.deepEqual(parseLine('To *ważne* i _pilne_, ~nieaktualne~.'), [
    { type: 'text', text: 'To ' },
    { type: 'bold', text: 'ważne' },
    { type: 'text', text: ' i ' },
    { type: 'italic', text: 'pilne' },
    { type: 'text', text: ', ' },
    { type: 'strike', text: 'nieaktualne' },
    { type: 'text', text: '.' },
  ]);
});

test('markers need non-space neighbours and do not split words', () => {
  assert.deepEqual(parseLine('2 * 3 * 4'), [{ type: 'text', text: '2 * 3 * 4' }]);
  assert.deepEqual(parseLine('snake_case_name'), [{ type: 'text', text: 'snake_case_name' }]);
});

test('links become clickable, without trailing punctuation; underscores in URLs stay', () => {
  assert.deepEqual(parseLine('Źródło: https://www.gov.pl/web/a_b_c/x?check=1.'), [
    { type: 'text', text: 'Źródło: ' },
    {
      type: 'link',
      text: 'https://www.gov.pl/web/a_b_c/x?check=1',
      href: 'https://www.gov.pl/web/a_b_c/x?check=1',
    },
    { type: 'text', text: '.' },
  ]);
  assert.deepEqual(parseLine('javascript:alert(1)'), [
    { type: 'text', text: 'javascript:alert(1)' },
  ]);
});

test('HTML stays text and lines are kept', () => {
  assert.deepEqual(parseWhatsApp('<b>x</b>\n\n*a*'), [
    [{ type: 'text', text: '<b>x</b>' }],
    [],
    [{ type: 'bold', text: 'a' }],
  ]);
});
