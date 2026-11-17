// Alert audience - the recipient scope contract shared by every send path.
// This is why it exists: alerts must reach only active users whose access
// groups cover the barrier station. A null scope means admin (every
// station), an array is the allowed station set, and an empty array reaches
// nobody. An omitted scope stays unrestricted for legacy callers/tests.
// SECURITY: station scoping is fail-closed - an unknown barrier location is
// delivered only to unrestricted (admin) recipients.
export interface AlertAudienceRecipient {
  email: string;
  name?: string;
  phone?: string;
  // undefined/null: unrestricted (legacy callers/admin); []: no station.
  locationIds?: readonly number[] | null;
}

// recipientsForLocation: the single per-event audience filter. Empty emails
// never receive; a null/unknown station reaches only unrestricted recipients.
export function recipientsForLocation(
  recipients: readonly AlertAudienceRecipient[],
  locationId: number | null | undefined,
): AlertAudienceRecipient[] {
  const station = locationId ?? null;
  return recipients.filter((recipient) => {
    if (recipient.email.trim() === "") return false;
    if (recipient.locationIds === undefined || recipient.locationIds === null) {
      return true;
    }
    if (station === null) return false;
    return recipient.locationIds.includes(station);
  });
}
