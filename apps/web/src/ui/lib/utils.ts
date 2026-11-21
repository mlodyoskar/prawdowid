import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The type scale (text-body, text-label…) is a font size, not a color. Without this,
// tailwind-merge treats `text-label text-ink` as two colors and drops one of them.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'display',
        'title-1',
        'title-2',
        'title-3',
        'body-lg',
        'body',
        'label',
        'caption',
        'eyebrow',
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
