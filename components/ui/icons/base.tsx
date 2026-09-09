// Icon base - shared props type and SVG factory for the static icon set.
// This is why it exists: every icon is the same 24px stroke SVG shape, so
// one factory keeps size/color/width handling identical across groups.
export interface P {
  size?: number;
  color?: string;
  strokeWidth?: number;
}
/* Icon factory: D wraps a raw path string in a 24px stroke SVG from size/color/width props.
   All path strings are static constants, so innerHTML never touches user input. */
export const D = (s: number, c: string, w: number, ch: string) => (
  <svg
    width={s}
    height={s}
    viewBox="0 0 24 24"
    fill="none"
    stroke={c}
    strokeWidth={w}
    strokeLinecap="round"
    strokeLinejoin="round"
    // deno-lint-ignore react-no-danger
    dangerouslySetInnerHTML={{ __html: ch }}
  />
);
