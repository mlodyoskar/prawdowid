/**
 * Heurystyczne wykrywanie prób prompt injection (scenariusz E: „zignorowanie instrukcji
 * i odnotowanie zdarzenia”). Detektor tylko odnotowuje: model i tak traktuje te treści jako dane.
 */

const PATTERNS: Array<{ id: string; re: RegExp }> = [
  {
    id: 'pl_ignore_instructions',
    re: /\bz?ignoruj\w*\s+(?:wszystk\w+\s+|poprzedni\w*\s+|wcześniejsz\w+\s+|powyższ\w+\s+)*(?:instrukcj|polece|zasad|regu)/i,
  },
  {
    id: 'pl_forget_instructions',
    re: /zapomnij\s+(?:o\s+)?(?:wszystk\w+\s+|poprzedni\w*\s+)*(?:instrukcj|polece|zasad|regu)/i,
  },
  {
    id: 'en_ignore_instructions',
    re: /\b(?:ignore|disregard|forget)\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier)?\s*(?:instructions|prompts?|rules)\b/i,
  },
  { id: 'system_prompt', re: /\bsystem(?:owy)?\s*prompt\w*/i },
  {
    id: 'pl_role_override',
    re: /\bjesteś\s+teraz\b|\bod\s+teraz\s+jesteś\b|\bwciel\s+się\b|\budawaj,?\s+że\s+jesteś\b/i,
  },
  {
    id: 'en_role_override',
    re: /\byou\s+are\s+now\b|\bact\s+as\s+(?:a|an|the)\b|\bpretend\s+(?:to\s+be|you\s+are)\b/i,
  },
  {
    id: 'pl_force_verdict',
    re: /\b(?:oceń|oznacz|uznaj|zakwalifikuj)\w*\s+(?:to\s+|je\s+|tę\s+\w+\s+)?(?:twierdzenie\s+)?jako\s+(?:prawdziw|potwierdzon|fałszyw|wiarygodn)/i,
  },
  {
    id: 'en_force_verdict',
    re: /\b(?:rate|mark|classify|label)\s+(?:this|it)\s+(?:claim\s+)?as\s+(?:true|false|confirmed|verified)\b/i,
  },
  {
    id: 'role_tokens',
    re: /<\|(?:system|assistant|user|im_start|im_end)\|>|\[\/?(?:INST|SYS)\]|<\/?(?:system|assistant)>/i,
  },
  { id: 'instruction_header', re: /^#{2,}\s*(?:instruction|instrukcj|system)/im },
  { id: 'data_block_escape', re: /<<<\s*ZGLOSZENIE|ZGLOSZENIE\s*>>>|<<<\s*STRONA|STRONA\s*>>>/i },
];

export type InjectionSignal = {
  /** Skąd pochodzi treść: `user`, `url:<host>` albo id dowodu (np. `doc_3`). */
  source: string;
  pattern: string;
};

/** Zwraca identyfikatory dopasowanych wzorców (puste, gdy nic nie wykryto). */
export function detectInjection(text: string): string[] {
  return PATTERNS.filter((p) => p.re.test(text)).map((p) => p.id);
}

/** Neutralizuje znaczniki bloków danych, żeby treść nie mogła „wyjść” z bloku. */
export function neutralizeMarkers(text: string): string {
  return text.replace(
    /<<<\s*(?:ZGLOSZENIE|STRONA)|(?:ZGLOSZENIE|STRONA)\s*>>>/gi,
    '[usunięty znacznik]',
  );
}
