// xlsx style registry - builds styles.xml from the styles the export uses.
// Why it exists: the spreadsheet keeps the brand block and the per-status
// colours the HTML export had, and availability/criticality are dynamic data,
// so a status added after this deploy must get a colour without a code change.
// Styles are therefore registered on demand while the rows stream, and the
// table is emitted once the last row is known. Excel needs fills 0 (none) and
// 1 (gray125) reserved, and cellXfs[0] must be the default.
import { xmlDoc } from "./xml.ts";

// Main spreadsheet namespace, shared by every part.
export const NS_MAIN =
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

export interface FontSpec {
  // Points; Excel's default is 11.
  size: number;
  bold?: boolean;
  italic?: boolean;
  // ARGB, e.g. "FF1E293B".
  color: string;
  // Monospace face for TAG cells.
  mono?: boolean;
}

export interface AlignSpec {
  horizontal?: "left" | "center" | "right";
  vertical?: "top" | "center";
  wrap?: boolean;
}

export interface StyleSpec {
  font?: FontSpec;
  // Solid ARGB fill, or nothing for the default background.
  fill?: string;
  align?: AlignSpec;
  // Thin border in this ARGB colour; omitted for borderless cells.
  border?: string;
}

const DEFAULT_FONT: FontSpec = { size: 9, color: "FF1E293B" };

// argb: "#rgb"/"#rrggbb"/"#aarrggbb" (any case) to the ARGB Excel expects.
// Anything else (the hsl() fallbacks of dispColorFor/critColorFor, an empty
// string) becomes the neutral fallback instead of a colour Excel would refuse
// to parse.
export function argb(color: string, fallback = "FF64748B"): string {
  const hex = color.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    const [r, g, b] = [...hex];
    return `FF${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) return `FF${hex}`.toUpperCase();
  if (/^[0-9a-f]{8}$/i.test(hex)) return hex.toUpperCase();
  return fallback;
}

// wash: the same colour as a translucent ARGB background, i.e. the ARGB value
// with its alpha replaced (never appended - that would be 10 hex digits).
export function wash(
  color: string,
  alpha = "1F",
  fallback = "FF64748B",
): string {
  return alpha + argb(color, fallback).slice(2);
}

export interface StyleBook {
  // Registers (or reuses) a style and returns its cellXfs index.
  style(spec: StyleSpec): number;
  // The finished styles.xml part.
  xml(): string;
}

// styleBook: an empty registry. Index 0 is always the default cell style.
export function styleBook(): StyleBook {
  const fonts: FontSpec[] = [DEFAULT_FONT];
  const fills: string[] = ["", ""]; // 0 = none, 1 = gray125 (Excel requires both)
  const borders: (string | null)[] = [null];
  const xfs: StyleSpec[] = [{}];
  // Dedupe keys, so the same spec never bloats the table. Font 0 and xf 0 are
  // pre-registered: an empty spec must resolve to the default cell style.
  const fontKeys = new Map<string, number>([
    [JSON.stringify(DEFAULT_FONT), 0],
  ]);
  const fillKeys = new Map<string, number>();
  const borderKeys = new Map<string, number>();
  const xfKeys = new Map<string, number>([
    [JSON.stringify([0, 0, 0, {}]), 0],
  ]);

  const fontId = (f: FontSpec): number => {
    const key = JSON.stringify(f);
    const at = fontKeys.get(key);
    if (at !== undefined) return at;
    fonts.push(f);
    return fontKeys.set(key, fonts.length - 1).get(key)!;
  };
  const fillId = (color: string): number => {
    const at = fillKeys.get(color);
    if (at !== undefined) return at;
    fills.push(color);
    return fillKeys.set(color, fills.length - 1).get(color)!;
  };
  const borderId = (color: string): number => {
    const at = borderKeys.get(color);
    if (at !== undefined) return at;
    borders.push(color);
    return borderKeys.set(color, borders.length - 1).get(color)!;
  };

  const style = (spec: StyleSpec): number => {
    const font = fontId(spec.font ?? DEFAULT_FONT);
    const fill = spec.fill ? fillId(spec.fill) : 0;
    const border = spec.border ? borderId(spec.border) : 0;
    const align = spec.align ?? {};
    const key = JSON.stringify([font, fill, border, align]);
    const at = xfKeys.get(key);
    if (at !== undefined) return at;
    xfs.push(spec);
    return xfKeys.set(key, xfs.length - 1).get(key)!;
  };

  const fontXml = (f: FontSpec): string =>
    `<font>${f.bold ? "<b/>" : ""}${f.italic ? "<i/>" : ""}` +
    `<sz val="${f.size}"/><color rgb="${f.color}"/>` +
    `<name val="${f.mono ? "Consolas" : "Calibri"}"/>` +
    `<family val="2"/></font>`;

  const fillXml = (color: string, at: number): string => {
    if (at === 0) return `<fill><patternFill patternType="none"/></fill>`;
    if (at === 1) return `<fill><patternFill patternType="gray125"/></fill>`;
    return `<fill><patternFill patternType="solid">` +
      `<fgColor rgb="${color}"/><bgColor indexed="64"/></patternFill></fill>`;
  };

  const borderXml = (color: string | null): string => {
    if (!color) {
      return `<border><left/><right/><top/><bottom/><diagonal/></border>`;
    }
    const side = (tag: string) =>
      `<${tag} style="thin"><color rgb="${color}"/></${tag}>`;
    return `<border>${side("left")}${side("right")}${side("top")}${
      side("bottom")
    }<diagonal/></border>`;
  };

  const xfXml = (spec: StyleSpec): string => {
    const font = fontId(spec.font ?? DEFAULT_FONT);
    const fill = spec.fill ? fillId(spec.fill) : 0;
    const border = spec.border ? borderId(spec.border) : 0;
    const a = spec.align ?? {};
    // Attributes must be space separated: a joined-without-space list would
    // still parse in lenient readers but is not well-formed XML.
    const alignAttrs = [
      a.horizontal ? `horizontal="${a.horizontal}"` : "",
      a.vertical ? `vertical="${a.vertical}"` : "",
      a.wrap ? 'wrapText="1"' : "",
    ].filter((part) => part !== "").join(" ");
    const needsAlign = alignAttrs !== "";
    return `<xf numFmtId="0" fontId="${font}" fillId="${fill}" ` +
      `borderId="${border}" xfId="0" applyFont="1"${
        fill ? ' applyFill="1"' : ""
      }` +
      `${border ? ' applyBorder="1"' : ""}` +
      `${needsAlign ? ' applyAlignment="1"' : ""}>` +
      (needsAlign ? `<alignment ${alignAttrs}/>` : "") +
      `</xf>`;
  };

  const xml = (): string =>
    `${xmlDoc()}<styleSheet xmlns="${NS_MAIN}">` +
    `<fonts count="${fonts.length}">${fonts.map(fontXml).join("")}</fonts>` +
    `<fills count="${fills.length}">${
      fills.map((color, at) => fillXml(color, at)).join("")
    }</fills>` +
    `<borders count="${borders.length}">${
      borders.map(borderXml).join("")
    }</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="${xfs.length}">${
      xfs.map((spec) => xfXml(spec)).join("")
    }</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`;

  return { style, xml };
}
