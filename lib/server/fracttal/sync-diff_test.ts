// Unit tests for per-barrier sync diff helpers (change-details feature).
// This is why it exists: changed_fields badges and snapshots must name
// exactly the SignatureSource keys that differed, plus availabilityId.
import { diffSignatureFields, fieldsSignature, snapshotOf } from "./sync.ts";

import { assertEquals } from "jsr:@std/assert@^1";

Deno.test("diffSignatureFields names changed keys plus availability", () => {
  const old = {
    tag: "A",
    locationId: 1,
    typologyId: 1,
    locDescId: 0,
    criticalityId: 1,
    categoryId: 7,
    groupingId: 0,
    ownerId: null,
    comments: "",
    actionPlan: "",
    isActive: true,
    scopeSource: "all",
  };
  const same = { ...old };
  assertEquals(diffSignatureFields(old, same, false), []);
  assertEquals(diffSignatureFields(old, same, true), ["availabilityId"]);
  assertEquals(
    diffSignatureFields(old, { ...old, tag: "B", comments: "x" }, false),
    ["tag", "comments"],
  );
  // Signature parity: identical inputs share a signature.
  assertEquals(fieldsSignature(old), fieldsSignature(same));
  assertEquals(snapshotOf(old, 4), { ...old, availabilityId: 4 });
});
