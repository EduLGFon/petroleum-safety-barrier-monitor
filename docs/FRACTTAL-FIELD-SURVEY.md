# Fracttal field survey

Live read of the Fracttal tenant compared with the narrow slices the app parses (`lib/server/fracttal/types.ts`, `parseAsset`, `parseWorkOrder`, `parseWorkRequest`) and `db/schema.sql`. The app consumes a validated subset; everything else stays behind the admin raw-detail endpoint.

## Barrier (item_type 2)

Captured: identity, flags, taxonomy, hierarchy, out-of-service dates, maintenance plan, free-text fields `field_1..field_6`, notes, description, units. Not captured: custom fields, commissioning dates, running hours, cost center, geolocation, inventory/accounting fields. Criticality is derived from the TAG suffix plus ESO flag; `priorities_description` is effectively null upstream.

## Work order

Captured: join code, classification, status, text, dates, people. Not captured: most of the 87 upstream fields. Important candidates include priority, cost, and timestamps.

## Work request

Captured: join code, status, text, dates, people. Not captured: the remaining upstream fields.

## Conclusion

Only fields needed for status derivation and display are synced. Raw upstream rows remain available through the admin-only raw detail panel when `DEV=true`.
