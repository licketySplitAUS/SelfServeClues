import test from "node:test";
import assert from "node:assert/strict";
import { anonymousAlias } from "../netlify/lib/anonymous-alias.mjs";

test("aliases remain stable for existing installation codes", () => {
  for (const [code, name] of [["BE-ABCD-EFGH", "Katherine"], ["BE-MBQX-QRM7", "Joshua"], ["BE-CRCJ-3JEC", "Stanley"]]) {
    assert.equal(anonymousAlias(code), name);
    assert.equal(anonymousAlias(code), anonymousAlias(code));
  }
});
test("invalid or missing identifiers never acquire a plausible alias", () => {
  for (const value of [undefined, null, {}, "", "unknown", "be-abcd-efgh", "BE-ABCD-EFGI", "BE-ABCD-EFGH\n", "<@everyone>"]) {
    assert.equal(anonymousAlias(value), "Unknown");
  }
});
