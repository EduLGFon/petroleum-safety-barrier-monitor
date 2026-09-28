// PDF report layout - page geometry and row pagination.
// Why it exists: drawing needs exact y positions and page breaks, but rows
// have dynamic heights (wrapped text), so geometry lives here as pure,
// unit-tested math while document.ts turns it into content-stream bytes.
// Coordinates are top-down points (y grows downward); the writer converts.
export const PAGE_W = 842;
export const PAGE_H = 595;

// A4 landscape margins mirroring the old @page rule (12/10/14/10mm).
export const M_LEFT = 28.35;
export const M_RIGHT = 28.35;
export const M_TOP = 34.02;
export const M_BOTTOM = 39.69;

export const CONTENT_X = M_LEFT;
export const CONTENT_W = PAGE_W - M_LEFT - M_RIGHT;
// Usable table area, top-down: below the top margin, above the footer strip.
export const CONTENT_TOP = M_TOP;
export const CONTENT_BOTTOM = PAGE_H - M_BOTTOM - 14;

// First page reserves the brand block above the table.
export const BRAND_H = 88;

// Type scale: small enough that 30 columns fit and typical codes (TAG,
// numeric ID) stay whole on one line, still crisp vector text.
export const HEAD_PT = 6;
export const CELL_PT = 6;
export const LINE = CELL_PT * 1.15;
export const HEAD_LINE = HEAD_PT * 1.15;
export const PAD_X = 2;
export const PAD_Y = 3;

// rowHeight: wrapped lines plus vertical padding. Every cell in the row
// shares it, so banding and pills align across the full width.
export function rowHeight(lines: number, line = LINE): number {
  return Math.max(1, lines) * line + PAD_Y;
}

// PagePlanner: greedy page breaker over row heights. Rows accumulate until
// the next one overflows the page, then the fitting run emits as one page -
// so pages always fill forward and the header room is reserved on each. A
// lone over-tall row waits instead of emitting an empty page; it goes out
// solo on the next push or at flush. Heights only - the caller keeps the rows
// and slices them by the returned counts.
export class PagePlanner {
  private pending: number[] = [];
  private first = true;

  constructor(
    private readonly firstCap: number,
    private readonly restCap: number,
    private readonly headerH: number,
  ) {}

  private cap(): number {
    return (this.first ? this.firstCap : this.restCap) - this.headerH;
  }

  private total(): number {
    return this.pending.reduce((a, b) => a + b, 0);
  }

  // push: one row height in, completed pages (lists of heights) out.
  push(height: number): number[][] {
    this.pending.push(height);
    const out: number[][] = [];
    for (;;) {
      if (this.total() <= this.cap()) break;
      // Only the giant row itself is pending: hold it for flush (or for a
      // follower, which will push it out onto its own overflowing page).
      if (this.pending.length === 1) break;
      out.push(this.pending.splice(0, this.pending.length - 1));
      this.first = false;
    }
    return out;
  }

  // flush: whatever is left becomes the last page (or nothing when empty).
  flush(): number[][] {
    const rest = this.pending.splice(0);
    this.first = false;
    return rest.length > 0 ? [rest] : [];
  }
}

// tableCaps: usable row heights for the first page (brand on top) and the
// rest. The caller subtracts the repeated header height per page.
export function tableCaps(): { firstCap: number; restCap: number } {
  return {
    firstCap: CONTENT_BOTTOM - CONTENT_TOP - BRAND_H,
    restCap: CONTENT_BOTTOM - CONTENT_TOP,
  };
}
