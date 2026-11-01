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
    origin: "",
    installLocal: "",
    equipTypology: "",
    fieldInstalled: "",
    fieldOperational: "",
    opStatus: "",
    hasMaintPlan: "",
    planFollowed: "",
    failureFree: "",
    maintStatus: "",
    hasContingency: "Não",
    contingencyDesc: "",
    evidenceCode: "",
    degradationDesc: "",
    extraComments: "",
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

Deno.test("snapshotOf strips non-signature extras for symmetry", () => {
  const base = {
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
    origin: "",
    installLocal: "",
    equipTypology: "",
    fieldInstalled: "",
    fieldOperational: "",
    opStatus: "",
    hasMaintPlan: "",
    planFollowed: "",
    failureFree: "",
    maintStatus: "",
    hasContingency: "Sim",
    contingencyDesc: "GM-1",
    evidenceCode: "",
    degradationDesc: "",
    extraComments: "",
  };
  const withExtras = {
    ...base,
    externalCode: "X-1",
    history: { note: "n", sourceAuthor: null, participants: [] },
    sourceUpdatedAt: "2026-09-11",
  };
  // Extra SyncBarrierInput keys never leak into the audit snapshot.
  assertEquals(snapshotOf(withExtras, 4), { ...base, availabilityId: 4 });
  // Contingency rides the signature: Sim -> Não clearing is a diff.
  assertEquals(
    diffSignatureFields(base, { ...base, hasContingency: "Não" }, false),
    ["hasContingency"],
  );
});

Deno.test("owned fields are excluded from signature and diff", () => {
  const base = {
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
    origin: "",
    installLocal: "",
    equipTypology: "",
    fieldInstalled: "",
    fieldOperational: "",
    opStatus: "",
    hasMaintPlan: "",
    planFollowed: "",
    failureFree: "",
    maintStatus: "",
    hasContingency: "Não",
    contingencyDesc: "",
    evidenceCode: "",
    degradationDesc: "",
    extraComments: "",
  };
  const edited = { ...base, origin: "Manual", tag: "B" };
  // No exclusion: the manual edit changes the signature.
  assertEquals(fieldsSignature(base) === fieldsSignature(edited), false);
  // With exclusion: owned keys never enter on either side.
  assertEquals(
    fieldsSignature(base, ["origin", "tag"]),
    fieldsSignature(edited, ["origin", "tag"]),
  );
  // Diff skips owned keys but still reports the rest (and availability).
  assertEquals(diffSignatureFields(base, edited, false, ["origin"]), ["tag"]);
  assertEquals(
    diffSignatureFields(base, edited, true, ["origin", "tag"]),
    ["availabilityId"],
  );
  assertEquals(diffSignatureFields(base, edited, false, []), [
    "tag",
    "origin",
  ]);
});
