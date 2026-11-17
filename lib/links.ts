// Only http(s), so a typed "javascript:" never becomes a live link. Trailing
// punctuation stays outside, so "see https://example.com." links without the dot.
// ponytail: a URL ending in ")" loses it (Wikipedia's Foo_(bar)); balance parens if that bites.
const LINK = /(https?:\/\/[^\s<>"]*[^\s<>".,;:!?')\]])/i;

/** Text split around URLs: odd indexes are the URLs. */
export function splitLinks(text: string) {
  return text.split(LINK);
}
