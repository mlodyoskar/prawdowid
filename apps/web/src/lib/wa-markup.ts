/**
 * WhatsApp text markup for the channel simulator: *bold*, _italic_, ~strikethrough~ and bare
 * http(s) links, as the WhatsApp app renders them. Everything else stays plain text (React escapes
 * it), so a reply can never inject HTML.
 */
export type Segment =
  | { type: 'text' | 'bold' | 'italic' | 'strike'; text: string }
  | { type: 'link'; text: string; href: string };

// A marker pair hugs non-space characters, like in WhatsApp: "2 * 3 * 4" stays plain.
const TOKEN =
  /(https?:\/\/[^\s<>"]+)|\*(\S(?:[^*\n]*?\S)?)\*|_(\S(?:[^_\n]*?\S)?)_|~(\S(?:[^~\n]*?\S)?)~/g;
// Punctuation that usually ends the sentence, not the link.
const TRAILING = /[.,;:!?)\]}”’»]+$/;

function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function pushText(out: Segment[], text: string): void {
  if (!text) return;
  const last = out.at(-1);
  if (last?.type === 'text') last.text += text;
  else out.push({ type: 'text', text });
}

/** One line of text → segments. Markers do not span lines. */
export function parseLine(line: string): Segment[] {
  const out: Segment[] = [];
  let pos = 0;
  for (const m of line.matchAll(TOKEN)) {
    const start = m.index;
    // A marker glued to a word ("snake_case_name") is not formatting.
    const before = start > 0 ? line[start - 1] : '';
    const [whole, url, bold, italic, strike] = m;
    if (url === undefined && before && /[\p{L}\p{N}]/u.test(before)) continue;

    pushText(out, line.slice(pos, start));
    if (url !== undefined) {
      const tail = TRAILING.exec(url)?.[0] ?? '';
      const href = url.slice(0, url.length - tail.length);
      if (isWebUrl(href)) out.push({ type: 'link', text: href, href });
      else pushText(out, href);
      pushText(out, tail);
    } else if (bold !== undefined) out.push({ type: 'bold', text: bold });
    else if (italic !== undefined) out.push({ type: 'italic', text: italic });
    else if (strike !== undefined) out.push({ type: 'strike', text: strike });
    pos = start + whole.length;
  }
  pushText(out, line.slice(pos));
  return out;
}

/** Whole message → lines of segments. */
export function parseWhatsApp(text: string): Segment[][] {
  return text.split('\n').map(parseLine);
}
