// Pre-hydration settings restore. Kept external so the page can use a
// strict CSP without inline-script hashes. Runs synchronously in <head>.
(function () {
  try {
    const s = JSON.parse(localStorage.getItem("barrier-settings") || "{}");
    const t = s.theme || "dark";
    document.documentElement.dataset.theme =
      t === "light" || t === "dark" || t === "amoled" ? t : "dark";
    if (s.reduceMotion) document.documentElement.classList.add("no-anim");
    if (s.disableBlur) document.documentElement.classList.add("no-blur");
    const P = {
      aurora: { p: "#6366f1", s: "#22d3ee", g: "rgba(99,102,241,.35)" },
      blue: { p: "#3b82f6", s: "#6366f1", g: "rgba(59,130,246,.18)" },
      green: { p: "#22c55e", s: "#10b981", g: "rgba(34,197,94,.18)" },
      red: { p: "#ef4444", s: "#f97316", g: "rgba(239,68,68,.18)" },
      yellow: { p: "#eab308", s: "#f59e0b", g: "rgba(234,179,8,.18)" },
      brown: { p: "#b45309", s: "#d97706", g: "rgba(180,83,9,.18)" },
      mono: { p: "#94a3b8", s: "#cbd5e1", g: "rgba(148,163,184,.18)" },
      purple: { p: "#a855f7", s: "#c084fc", g: "rgba(168,85,247,.18)" },
    };
    const c = P[s.accentColor || "aurora"];
    if (c) {
      const r = document.documentElement;
      r.style.setProperty("--accent", c.p);
      r.style.setProperty("--accent-2", c.s);
      r.style.setProperty("--glow", c.g);
    }
    const dn = s.density === "compact" || s.density === "spacious"
      ? s.density
      : "comfortable";
    document.documentElement.dataset.density = dn;
    const fs = s.fontSize;
    const font = fs === "small" || fs === "standard" || fs === "large" ||
        fs === "xlarge"
      ? fs
      : "standard";
    document.documentElement.dataset.fontSize = font;
  } catch (e) {
    console.error("[settings-restore]", e);
  }
})();
