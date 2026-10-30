# Decisions

Append-only architecture decision records. Newest last.

- D01: additive database indexes only; no feature removal.
- D02: collapse read round-trips with window totals.
- D03: chunked transactional sync apply with batched audit.
- D04: collapse sync-changes list round-trip.
- D05: defer unverifiable performance changes.
- D06: normalize sync timestamps to ISO strings.
- D07: keyset export paging.
- D08: conditional GETs with ETags.
- D09: duplication-guard hardening.
- D10-D18: sync history attribution, contingency links, sync lease contention, Fracttal detail derivations, raw detail panel, sync status timestamp contract, and related implementation decisions.

See git history for full context.
