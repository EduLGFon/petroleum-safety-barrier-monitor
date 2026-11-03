// Sync constants shared by the write repository and the read repository.
// Kept separate so splitting the module does not create an import cycle.
export const SYNC_AUTHOR_ID = 10; // authors.id, see db/seed_lookups.sql

// Apply chunk: barriers committed per transaction. Bounds tx length and the
// audit batch (8 params per row) well under protocol limits.
export const SYNC_APPLY_CHUNK = 200;
