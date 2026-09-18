// Build a URL text fragment (https://wicg.github.io/scroll-to-text-fragment/).
// Short selections encode whole; long ones use textStart,textEnd to stay compact.
const MAX_WHOLE_WORDS = 10;

export const buildTextFragment = (selection: string): string => {
  const text = selection.trim().replace(/\s+/g, ' ');
  if (!text) return '';
  const words = text.split(' ');
  if (words.length <= MAX_WHOLE_WORDS) {
    return `#:~:text=${encodeURIComponent(text)}`;
  }
  const start = words.slice(0, 4).join(' ');
  const end = words.slice(-4).join(' ');
  return `#:~:text=${encodeURIComponent(start)},${encodeURIComponent(end)}`;
};
