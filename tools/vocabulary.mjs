/**
 * vocabulary.mjs — the brand vocabulary guard, as pure functions.
 *
 * Kept separate from build-stage.mjs so the test can import it without running
 * a build. Enforced by the build rather than left to whoever remembers to run a
 * grep: a previous project shipped a brand pass that checked the page and
 * missed sixty generated one-liners. This is that lesson, mechanised.
 */

/**
 * The part of a built page a human actually reads.
 *
 * Source comments and the stylesheet are stripped. They ship in the file but
 * nobody reads them, and flagging them trains people to disable the guard —
 * which is exactly how a rule stops working.
 */
export function visibleText(page) {
  return page
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/<style[\s\S]*?<\/style>/g, "");
}

export const VETOED = [
  // Case-SENSITIVE on the acronym on purpose. The violation is writing "TTL" in
  // copy; a lowercase `ttl` inside `/^ttl$/` is the mapping rule that detects an
  // expiry column in someone else's schema, and it is correct. "time-to-live"
  // stays case-insensitive because no legitimate identifier spells it that way.
  [/\bTTL\b/, 'say "Entity Expiration" / "Lifetime Extension", never TTL'],
  [/\btime-to-live\b/i, 'say "Entity Expiration" / "Lifetime Extension", never time-to-live'],
  // `records` as a noun for data items is vetoed. As a verb it is ordinary
  // English ("$creator records who wrote it"), so those senses are excused.
  [/\brecords\b(?!\s+(each|who|that|it|the))/i, 'say "Arkiv entities", never "records"'],
  [/\bon Ethereum\b/i, 'Arkiv is its own DB-Chain; say "Ethereum-aligned"'],
];

/** The first vocabulary problem in a built page, or null when it is clean. */
export function vocabularyProblem(page) {
  const visible = visibleText(page);
  for (const [pattern, why] of VETOED) {
    const hit = visible.match(pattern);
    if (hit) return `vetoed vocabulary in user-visible text: "${hit[0]}" — ${why}`;
  }
  return null;
}
