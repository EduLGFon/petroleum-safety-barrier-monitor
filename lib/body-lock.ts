// Body scroll lock - reference-counted document overflow guard.
// This is why it exists: modal and panel both lock scrolling while open; a
// counter keeps scroll locked until the last overlay closes instead of the
// first close re-enabling scroll under a still-open dialog.
let locks = 0;

// Locks body scroll; safe to call during SSR (no document there).
export function lockBody(): void {
  if (typeof document === "undefined") return;
  locks++;
  document.body.style.overflow = "hidden";
}

// Releases one body scroll lock; scroll resumes at zero locks only.
export function unlockBody(): void {
  if (typeof document === "undefined") return;
  locks = Math.max(0, locks - 1);
  if (locks === 0) document.body.style.overflow = "";
}
