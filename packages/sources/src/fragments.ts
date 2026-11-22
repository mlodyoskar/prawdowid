/** Tyle znaków widzi model z jednego materiału, więc fragment korpusu nie może być dłuższy. */
export const MAX_FRAGMENT_CHARS = 600;

/**
 * Dzieli treść na fragmenty do `max` znaków, tnąc na granicach zdań.
 * Używane dla dokumentów bez gotowych fragmentów (np. w testach); snapshot korpusu ma własne.
 */
export function splitIntoFragments(text: string, max: number = MAX_FRAGMENT_CHARS): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean === '') return [];

  const fragments: string[] = [];
  let current = '';
  const flush = () => {
    if (current !== '') fragments.push(current);
    current = '';
  };

  for (const sentence of clean.split(/(?<=[.!?…])\s+/)) {
    for (const piece of hardSplit(sentence, max)) {
      if (current !== '' && current.length + 1 + piece.length > max) flush();
      current = current === '' ? piece : `${current} ${piece}`;
    }
  }
  flush();
  return fragments;
}

/** Zdanie dłuższe niż limit tniemy na spacjach (a słowo dłuższe niż limit: na sztywno). */
function hardSplit(sentence: string, max: number): string[] {
  if (sentence.length <= max) return [sentence];
  const pieces: string[] = [];
  let rest = sentence;
  while (rest.length > max) {
    const space = rest.lastIndexOf(' ', max);
    const cut = space > 0 ? space : max;
    pieces.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest !== '') pieces.push(rest);
  return pieces;
}
