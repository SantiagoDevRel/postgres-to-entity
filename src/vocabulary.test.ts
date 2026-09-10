/**
 * vocabulary.test.ts — the brand guard has to actually fire.
 *
 * A grep rule that never matches is worse than no rule: it produces a green
 * build and the false confidence that goes with it. So this mutation-tests the
 * guard in both directions — it must catch a vetoed word in visible copy, and
 * it must NOT catch the same string in a comment, in the stylesheet, or in a
 * regex that legitimately matches a user's column named `ttl`.
 *
 * Run:  npm test
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

// @ts-expect-error — plain JS on purpose, shared with the build script.
import { visibleText, vocabularyProblem } from "../tools/vocabulary.mjs";

const page = (body: string) => `<style>.x{}</style><div>${body}</div>`;

describe("the vocabulary guard fires", () => {
  it("catches TTL in visible copy", () => {
    const problem = vocabularyProblem(page("<p>Set a TTL of 30 days</p>"));
    assert.ok(problem, "TTL in visible copy must fail the build");
    assert.match(problem, /Entity Expiration/);
  });

  it("catches time-to-live", () => {
    assert.ok(vocabularyProblem(page("<p>the time-to-live of an entity</p>")));
  });

  it("catches records used as a noun for data items", () => {
    const problem = vocabularyProblem(page("<p>1,000 records written</p>"));
    assert.ok(problem, '"records" as a noun must fail the build');
    assert.match(problem, /Arkiv entities/);
  });

  it('catches "on Ethereum"', () => {
    assert.ok(vocabularyProblem(page("<p>a queryable database on Ethereum</p>")));
  });
});

describe("the vocabulary guard does not cry wolf", () => {
  it("excuses records used as a verb", () => {
    assert.equal(vocabularyProblem(page("<p>$creator records who wrote it</p>")), null);
    assert.equal(vocabularyProblem(page("<p>the parser records each skipped statement</p>")), null);
  });

  it("ignores source comments, which ship but are never read by a user", () => {
    assert.equal(vocabularyProblem("<!-- a TTL of 30 days -->" + page("<p>fine</p>")), null);
    assert.equal(vocabularyProblem(page("<p>fine</p>") + "/* set the TTL */"), null);
    assert.equal(vocabularyProblem(page("<p>fine</p>") + "\n  // records go here"), null);
  });

  it("ignores a regex that matches a user's column named ttl", () => {
    // This literal lives in model.ts and is correct: it detects an expiry
    // column in somebody else's schema. Flagging it would train us to disable
    // the guard, which is how the rule stops working.
    const source = page("<p>fine</p>") + "\n// EXPIRY_HINTS\nconst h = [/^ttl$/];";
    assert.equal(vocabularyProblem(source), null);
  });

  it("passes a page with no vetoed vocabulary at all", () => {
    assert.equal(
      vocabularyProblem(page("<p>Entity Expiration leaves the queryable surface on its own</p>")),
      null,
    );
  });
});

describe("visibleText", () => {
  it("strips the stylesheet, so a class name can never trip the guard", () => {
    assert.doesNotMatch(visibleText("<style>.ttl-badge{color:red}</style><p>ok</p>"), /ttl/i);
  });
});
