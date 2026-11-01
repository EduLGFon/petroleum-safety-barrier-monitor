# Website font size setting - implementation plan

Status: implemented. Automated tests pass; the manual visual matrix in
section 9.2 remains a release gate.

Scope: authenticated dashboard, settings panel, login, splash, modals, tables,
charts, and sync UI. The setting is browser-local and affects the website UI
only. It does not change PDF/XLSX exports, e-mail templates, or server data.

Related work: the readability pass already raised the type-scale floor and
replaced most hardcoded 10-13px text with density tokens. At the time of
writing those changes are uncommitted on the working tree. Land that pass
first; this plan assumes its token values.

## Contents

1. Executive summary
2. Problem and goals
3. Current architecture
4. Inventory
5. Research and standards
6. Options considered
7. Recommended design
8. File-by-file implementation plan
9. Testing plan
10. Rollout and migration
11. Risks and mitigations
12. Acceptance criteria
13. Open questions
14. Appendix

## 1. Executive summary

Add a `fontSize` preference to the existing settings store with four presets:

- Pequeno: 93.75%
- Padrão: 100%
- Grande: 112.5%
- Muito grande: 125%

The implementation has four core parts:

1. Convert the type scale in `static/styles.css` from px to rem.
2. Set the root `font-size` from a `data-font-size` attribute on `<html>`.
3. Persist and restore `fontSize` through the existing `barrier-settings`
   localStorage key and the pre-hydration INIT script.
4. Scale SVG chart geometry with the same preset so labels do not collide
   when text grows.

Density stays orthogonal. Density controls spacing and the baseline type
scale; font size multiplies that baseline. The standard preset is pixel
identical to the current build at the browser default of 16px.

No database migration or API change is required.

### 1.1 Lessons from the readability pass

The earlier readability pass found the main problems were:

- Hardcoded 10-13px text in sync UI, charts, tables, exports, settings, login,
  and error UI.
- Low-contrast provenance captions, especially the Fracttal source line in the
  barrier editor.
- Micro and tiny tokens used for informational labels instead of compact
  badges.
- SVG text sizes that did not participate in the density scale.

The pass raised the floor to 12/11/10px in comfortable, 11/10/9px in compact,
and 13/12/11px in spacious; moved labels from micro to caption; and changed
the Fracttal caption to the small token with medium weight and secondary
color. This plan preserves those floors and makes the scale user-adjustable
without letting the smallest informational text drop below the minimum.

## 2. Problem and goals

### 2.1 Problem

The current UI has a fixed px type scale. A user who needs larger text has
only browser zoom, which scales the whole interface, including spacing and
fixed-width panels. Browser text-only settings do not affect px font sizes,
so the app ignores a preference the user already expressed.

The readability pass improved the floor, but it did not give users a way to
choose a comfortable size. Density is not a font-size control: it changes
spacing and type together, and its compact mode is not intended as an
accessibility setting.

There are also remaining hardcoded sizes outside the density scale:

- `body` at 15px and `.login-input` at 14px in `static/styles.css`.
- Seven numeric sizes in `AURORA_TYPE` in `lib/aurora.ts`.
- Numeric sizes in `BrandHeader`, `ChartSummary`, `SyncDetailsModal`, and
  `SyncHoverCard`.
- Fixed SVG row and label geometry in the compliance chart.

### 2.2 Goals

- Let the user choose a text size in Settings > Aparência.
- Apply the choice immediately across the website.
- Persist the choice in the existing browser-local settings blob.
- Restore the choice before hydration and before first paint.
- Keep density, theme, accent, and reduced-motion behavior unchanged.
- Keep the standard preset pixel identical to today.
- Compose with the browser's own default text size, not override it.
- Keep chart labels readable and truncation predictable at every preset.
- Keep browser zoom working up to 200% without loss of content or function.

### 2.3 Non-goals

- Full UI zoom or spacing scale. The setting changes text, not padding,
  borders, icon sizes, or control dimensions.
- Per-component font-size overrides. The type tokens remain the single
  source of truth.
- Server-side or cross-device preference sync. The current settings model is
  browser-local.
- Font-family changes. Inter Tight and JetBrains Mono stay as they are.
- Export font sizes. PDF and XLSX layouts are print artifacts with their own
  metrics.
- Replacing browser zoom. The setting is a convenience preference; browser
  zoom remains the WCAG 1.4.4 resize mechanism.

## 3. Current architecture

The settings flow is already in place:

```text
localStorage["barrier-settings"]
        |
        v
context/settings/storage.ts loadSettings()
  per-field validation, merge over DEFAULTS
        |
        v
context/SettingsContext.tsx SettingsProvider
  useState(DEFAULTS) for SSR, then hydrate after mount
        |
        +--> context/settings/appliers.ts
        |      applyTheme / applyAccent / applyDensity / applyMotion / applyBlur
        |      mutate documentElement
        |
        +--> components/SettingsPanel.tsx
               appearance pickers -> setters -> patch() -> saveSettings()
```

A separate inline script in `routes/_app.tsx` runs in `<head>` before island
hydration. It restores theme, accent, density, motion, and blur to prevent a
flash of the wrong appearance. Font size must join this script.

The type scale lives in `static/styles.css` under three density selectors:
`:root` and `[data-density="comfortable"]`, `[data-density="compact"]`, and
`[data-density="spacious"]`. Components consume `var(--d-*)` tokens. A few
surfaces bypass the scale with inline numeric sizes.

The chart is the only place where text size and geometry are coupled. SVG
text uses `var(--d-body)`, but row heights, bar heights, label width, count
width, axis height, and text offsets are numbers in
`components/chart/geometry.ts`. If text grows and geometry does not, labels
overlap or clip.

## 4. Inventory

### 4.1 Type tokens

All of these are font-size tokens and must become rem. The px values are the
current values after the readability pass.

| Token              | Comfortable | Compact | Spacious | rem at comfortable | Floor |
| ------------------ | ----------: | ------: | -------: | -----------------: | ----: |
| `--d-hero`         |       19 px |   17 px |    21 px |          1.1875rem |     - |
| `--d-display`      |       27 px |   23 px |    31 px |          1.6875rem |     - |
| `--d-band-num`     |       20 px |   18 px |    22 px |            1.25rem |     - |
| `--d-dialog-title` |       21 px |   19 px |    23 px |          1.3125rem |     - |
| `--d-arrow`        |       16 px |   14 px |    18 px |               1rem |     - |
| `--d-lead`         |       14 px |   13 px |    15 px |           0.875rem |     - |
| `--d-body`         |       13 px |   12 px |    14 px |          0.8125rem |     - |
| `--d-small`        |       12 px |   11 px |    13 px |            0.75rem | 11 px |
| `--d-caption`      |       12 px |   11 px |    13 px |            0.75rem | 11 px |
| `--d-micro`        |       11 px |   10 px |    12 px |          0.6875rem | 10 px |
| `--d-tiny`         |       10 px |    9 px |    11 px |           0.625rem |  9 px |
| `--d-page-fs`      |       15 px |   14 px |    16 px |          0.9375rem |     - |
| `--d-badge-xs-fs`  |       11 px |   10 px |    12 px |          0.6875rem | 10 px |
| `--d-badge-sm-fs`  |       12 px |   11 px |    13 px |            0.75rem | 11 px |
| `--d-badge-md-fs`  |       13 px |   12 px |    14 px |          0.8125rem | 12 px |
| `--d-panel-title`  |       18 px |   16 px |    20 px |           1.125rem |     - |
| `--d-density-hint` |       12 px |   11 px |    13 px |            0.75rem | 11 px |

The rem column is for comfortable. Convert each density block independently
with `px / 16`. For example, compact `--d-body: 12px` becomes `0.75rem`, and
spacious `--d-body: 14px` becomes `0.875rem`.

The floor column is the minimum computed size. It only matters when the
Pequeno preset combines with compact density or with a small browser default.
At the standard preset every floor is equal to or below the current value, so
the standard rendering is unchanged.

### 4.2 Hardcoded font sizes

| File                                     | Current          | Target                            | Note                          |
| ---------------------------------------- | ---------------- | --------------------------------- | ----------------------------- |
| `static/styles.css` `body`               | `15px`           | `0.9375rem`                       | Preserve 15px at standard.    |
| `static/styles.css` `.login-input`       | `14px`           | `0.875rem`                        | Preserve 14px at standard.    |
| `lib/aurora.ts` `eyebrow`                | `11`             | `"0.6875rem"`                     | Numeric px in a style object. |
| `lib/aurora.ts` `hero`                   | `22`             | `"1.375rem"`                      | Same.                         |
| `lib/aurora.ts` `kpiLabel`               | `11`             | `"0.6875rem"`                     | Same.                         |
| `lib/aurora.ts` `kpiValue`               | `30`             | `"1.875rem"`                      | Same.                         |
| `lib/aurora.ts` `bandLabel`              | `11`             | `"0.6875rem"`                     | Same.                         |
| `lib/aurora.ts` `bandValue`              | `18`             | `"1.125rem"`                      | Same.                         |
| `lib/aurora.ts` `tag`                    | `13`             | `"0.8125rem"`                     | Same.                         |
| `components/login/BrandHeader.tsx`       | `24`             | `"1.5rem"`                        | Inline numeric style.         |
| `components/chart/ChartSummary.tsx`      | `22`             | `"1.375rem"`                      | Donut center value.           |
| `components/header/SyncDetailsModal.tsx` | `14`             | `"0.875rem"`                      | Inline numeric style.         |
| `components/header/SyncHoverCard.tsx`    | `19`             | `"1.1875rem"`                     | Inline numeric style.         |
| `components/loading/SplashCard.tsx`      | `12`, `20`, `11` | `0.75rem`, `1.25rem`, `0.6875rem` | Fallbacks inside `var()`.     |

The target values preserve the current standard rendering. They only add
font-size scaling, not density awareness, except where a token already
exists.

### 4.3 Non-text sizes intentionally not converted

Do not convert spacing, radii, borders, shadows, icon sizes, control sizes,
or fixed widths to rem as part of this plan. The setting is a text-size
preference, not a UI zoom. Converting those values would change density and
layout behavior and would blur the distinction between the two settings.

The chart is the exception: its row, bar, label, count, axis, and text
offsets must follow the font scale because SVG text and SVG geometry are
visually coupled.

### 4.4 Chart geometry inventory

`components/chart/geometry.ts` currently has:

| Constant  | Compact | Comfortable | Spacious |
| --------- | ------: | ----------: | -------: |
| `ROW_H`   |   18 px |       22 px |    26 px |
| `BAR_H`   |   12 px |       15 px |    18 px |
| `LABEL_W` |  180 px |      200 px |   220 px |
| `COUNT_W` |   56 px |       56 px |    56 px |
| `AXIS_H`  |   26 px |       26 px |    26 px |

The SVG also has fixed text offsets:

- `ChartRow` label and count baseline: `y + 14`.
- Axis tick baseline: `plot bottom + 18`.
- Label and count padding: `8px` between the text and the bar or plot edge.
- Hover target inset: `y - 4`.

The first two baselines must scale with the font preset. The label padding
and the hover inset can stay fixed because they are not text; the label
character budget accounts for the padding.

## 5. Research and standards

### 5.1 WCAG 2.2 SC 1.4.4 Resize Text

Requirement: except for captions and images of text, text can be resized
without assistive technology up to 200 percent without loss of content or
functionality.

Implications:

- Text must not be locked to px sizes that ignore browser text settings.
- A page-level control that changes text size is a valid usability feature,
  but it does not replace browser zoom. The app must still survive 200%
  browser zoom.
- Avoid `maximum-scale=1` or `user-scalable=no` in the viewport. The current
  viewport does not set either, and must stay that way.
- The test is loss of content or functionality, not merely "the page still
  loads". Clipped labels, overlapping chart text, and controls pushed off
  screen are failures.

References:

- https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html
- https://www.w3.org/WAI/WCAG22/Techniques/general/G178
- https://www.w3.org/WAI/WCAG22/Techniques/failures/F69

### 5.2 WCAG 2.2 SC 1.4.10 Reflow

Requirement: content can be presented without loss of information or
functionality, and without requiring scrolling in two dimensions for
vertical scrolling content at a width equivalent to 320 CSS pixels.

Implications:

- The primary flows must remain usable at 320 CSS pixels wide.
- Data tables are allowed to scroll horizontally when the content is a
  two-dimensional data relationship. The table already does this and should
  keep doing it.
- Fixed-width panels and modals must use viewport caps such as
  `min(560px, 96vw)` and must not push controls off screen.
- A font-size setting increases the chance of overflow. The visual audit must
  include 320px width at the Muito grande preset.

Reference:

- https://www.w3.org/WAI/WCAG22/Understanding/reflow.html

### 5.3 WCAG 2.2 SC 1.4.12 Text Spacing

Requirement: no loss of content or functionality when the user sets line
height to at least 1.5 times the font size, paragraph spacing to at least
2 times the font size, letter spacing to at least 0.12 times the font size,
and word spacing to at least 0.16 times the font size, without changing other
styles.

Implications:

- Avoid fixed-height text containers. Prefer `min-height` and natural line
  boxes.
- The body already uses `line-height: 1.6`, which is above the 1.5 minimum.
- Badges, chips, and table cells must grow with their text instead of
  clipping it.
- Test with a text-spacing bookmarklet or browser extension after the
  implementation.

Reference:

- https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html

### 5.4 rem, em, and the browser default

`rem` is relative to the root element's computed font size. `em` is relative
to the parent element's computed font size. `px` is an absolute CSS unit and
does not follow the browser's default text size.

If the root uses `font-size: 100%`, it resolves to the browser's configured
default, typically 16px. A preset can then use a percentage of that default:

```css
:root {
  font-size: 100%;
}
[data-font-size="large"] {
  font-size: 112.5%;
}
```

With a 16px browser default this is 18px. With a 20px browser default it is
22.5px. The app preference composes with the user's browser preference
instead of overriding it.

Using `font-size: 16px` on the root would break that composition. Using
`zoom` or `transform: scale()` would scale layout and can blur text, break
hit testing, and create scrollbar problems.

References:

- https://developer.mozilla.org/en-US/docs/Web/CSS/length
- https://developer.mozilla.org/en-US/docs/Web/CSS/font-size

### 5.5 Design-system practice

Common approaches in design systems:

- A rem type scale with a root font-size setting is the most common
  accessible pattern. It keeps one token source and lets the browser default
  participate.
- A separate "density" control usually changes spacing, not the root font
  size. Keeping density and font size separate avoids a combinatorial mess of
  "compact but large" labels.
- Four presets are enough for a preference control. More presets increase
  test combinations without adding much value.
- The default preset should be the current design, so existing users see no
  change until they choose otherwise.

### 5.6 Conclusion

The root font-size plus rem approach is the only option that satisfies all of
these at once:

- One token source for the whole UI.
- Composition with the browser default text size.
- Orthogonality with density.
- No layout zoom side effects.
- A standard preset that is pixel identical to today.
- A clear path to scale SVG geometry with the same numeric scale.

## 6. Options considered

| Option                         | Description                                                    | Pros                                                                                                        | Cons                                                                                                                                            | Decision                       |
| ------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| A. CSS `zoom`                  | Set `zoom` on the app shell.                                   | One line.                                                                                                   | Scales layout, not just text; browser support and text rendering vary; can blur and break hit testing; scrollbars and fixed overlays misbehave. | Rejected.                      |
| B. `transform: scale()`        | Scale the shell with a transform.                              | Visual zoom.                                                                                                | Does not reflow; text can blur; fixed positioning and overlays break; accessibility tree and hit testing mismatch.                              | Rejected.                      |
| C. Root font-size + rem tokens | Convert type tokens to rem, set root percentage from a preset. | Composes with browser default; one token source; density stays orthogonal; standard can be pixel identical. | Requires a one-time token conversion and chart geometry work.                                                                                   | Recommended.                   |
| D. Body font-size + em         | Set body size and express components in em.                    | Text scales.                                                                                                | Nested `em` compounds unpredictably; every component must be audited; body override still fights the browser default.                           | Rejected.                      |
| E. JS scale per component      | Multiply every inline font size by a scale.                    | No CSS conversion.                                                                                          | Hundreds of inline styles, SSR and hydration complexity, easy to miss values, no single source.                                                 | Rejected.                      |
| F. Fixed px presets            | Swap the px token blocks per preset.                           | Simple CSS.                                                                                                 | Ignores the browser default; still fails text-only zoom; duplicates three density blocks into twelve.                                           | Rejected.                      |
| G. Browser zoom only           | Tell users to use browser zoom.                                | No code.                                                                                                    | Not an app setting; scales spacing and panels; no persistence; poor discoverability.                                                            | Rejected as the only solution. |

## 7. Recommended design

### 7.1 Presets

| Key        | Label        | Hint                           |  Scale | Root font-size | Root px at 16px default |
| ---------- | ------------ | ------------------------------ | -----: | -------------: | ----------------------: |
| `small`    | Pequeno      | 93,75% · mais conteúdo na tela | 0.9375 |         93.75% |                   15 px |
| `standard` | Padrão       | 100% · equilíbrio padrão       |      1 |           100% |                   16 px |
| `large`    | Grande       | 112,5% · leitura confortável   |  1.125 |         112.5% |                   18 px |
| `xlarge`   | Muito grande | 125% · máxima legibilidade     |   1.25 |           125% |                   20 px |

`standard` is the default. A stored or tampered value that is not one of
these four falls back to `standard`.

The percentages are chosen so the root sizes are familiar: 15, 16, 18, and
20px at the common 16px browser default. The top preset is 125%, not 200%.
The setting is a reading preference; browser zoom remains the 200% path
required by WCAG 1.4.4.

### 7.2 Orthogonality with density

Density supplies the baseline type scale and spacing. Font size multiplies
the baseline. Effective body size at a 16px browser default:

| Density     | Pequeno | Padrão |  Grande | Muito grande |
| ----------- | ------: | -----: | ------: | -----------: |
| Compacto    | 11.25px |   12px |  13.5px |         15px |
| Confortável | 12.19px |   13px | 14.63px |      16.25px |
| Amplo       | 13.13px |   14px | 15.75px |       17.5px |

This is why the two controls stay separate. "Compacto + Grande" is a valid
combination: tight spacing with comfortable text. Merging the controls would
force users to choose between density and readability.

### 7.3 Root font-size and token conversion

Add a text-size block near the top of `static/styles.css`:

```css
/* Text size preference. Percentages keep the browser's own default text
   size in the calculation; every type token below is rem. */
:root {
  font-size: 100%;
}
[data-font-size="small"] {
  font-size: 93.75%;
}
[data-font-size="standard"] {
  font-size: 100%;
}
[data-font-size="large"] {
  font-size: 112.5%;
}
[data-font-size="xlarge"] {
  font-size: 125%;
}
```

Add legibility floors to the comfortable block. They are inherited by the
compact and spacious blocks:

```css
:root,
[data-density="comfortable"] {
  /* The Pequeno preset must not push informational text below the
     readability floor established by the readability pass. */
  --d-floor-small: 11px;
  --d-floor-caption: 11px;
  --d-floor-micro: 10px;
  --d-floor-tiny: 9px;
  --d-floor-badge-xs: 10px;
  --d-floor-badge-sm: 11px;
  --d-floor-badge-md: 12px;
}
```

Convert the comfortable type tokens:

```css
:root,
[data-density="comfortable"] {
  --d-hero: 1.1875rem;
  --d-display: 1.6875rem;
  --d-band-num: 1.25rem;
  --d-dialog-title: 1.3125rem;
  --d-arrow: 1rem;
  --d-lead: 0.875rem;
  --d-body: 0.8125rem;
  --d-small: max(0.75rem, var(--d-floor-small));
  --d-caption: max(0.75rem, var(--d-floor-caption));
  --d-micro: max(0.6875rem, var(--d-floor-micro));
  --d-tiny: max(0.625rem, var(--d-floor-tiny));
  --d-page-fs: 0.9375rem;
  --d-badge-xs-fs: max(0.6875rem, var(--d-floor-badge-xs));
  --d-badge-sm-fs: max(0.75rem, var(--d-floor-badge-sm));
  --d-badge-md-fs: max(0.8125rem, var(--d-floor-badge-md));
  --d-panel-title: 1.125rem;
  --d-density-hint: max(0.75rem, var(--d-floor-caption));
}
```

Convert the compact block with its own px-to-rem values, for example:

```css
[data-density="compact"] {
  --d-body: 0.75rem;
  --d-small: max(0.6875rem, var(--d-floor-small));
  --d-caption: max(0.6875rem, var(--d-floor-caption));
  --d-micro: max(0.625rem, var(--d-floor-micro));
  --d-tiny: max(0.5625rem, var(--d-floor-tiny));
  --d-page-fs: 0.875rem;
  --d-badge-xs-fs: max(0.625rem, var(--d-floor-badge-xs));
  --d-badge-sm-fs: max(0.6875rem, var(--d-floor-badge-sm));
  --d-badge-md-fs: max(0.75rem, var(--d-floor-badge-md));
  --d-panel-title: 1rem;
  --d-density-hint: max(0.6875rem, var(--d-floor-caption));
}
```

Convert the spacious block the same way. The exact rem values are in the
inventory table in section 4.1.

Why `max()`: at the standard preset every floor is at or below the current
size, so nothing changes. At Pequeno, compact small text stops at 11px,
micro at 10px, and tiny at 9px instead of dropping below the floor. At
Grande and Muito grande the rem value wins and the text grows normally.

Keep a comment in the CSS and in `FONT_SIZE_PRESETS` that the percentages
and scales must stay in sync.

### 7.4 Body and login input

Keep the body base at its current 15px behavior, expressed in rem:

```css
body {
  font-family: var(--font-sans);
  font-size: 0.9375rem;
  line-height: 1.6;
}
```

The dashboard shell already sets `font-size: var(--d-page-fs)`, so its base
continues to follow density. The body value mainly affects login, splash, and
any surface that inherits directly from body. Keeping it at 0.9375rem avoids
an unrelated density change.

Convert the login input:

```css
.login-input {
  font-size: 0.875rem;
}
```

Both values scale with the root font-size because they are rem.

### 7.5 Data model

Add to `context/settings/presets.ts`:

```ts
export type FontSize = "small" | "standard" | "large" | "xlarge";

export const FONT_SIZE_PRESETS: Record<
  FontSize,
  { label: string; hint: string; scale: number }
> = {
  small: {
    label: "Pequeno",
    hint: "93,75% · mais conteúdo na tela",
    scale: 0.9375,
  },
  standard: {
    label: "Padrão",
    hint: "100% · equilíbrio padrão",
    scale: 1,
  },
  large: {
    label: "Grande",
    hint: "112,5% · leitura confortável",
    scale: 1.125,
  },
  xlarge: {
    label: "Muito grande",
    hint: "125% · máxima legibilidade",
    scale: 1.25,
  },
};

export interface SettingsState {
  theme: Theme;
  accentColor: AccentColor;
  density: Density;
  fontSize: FontSize;
  defaultFilters: Partial<FilterState>;
  defaultLocation: string;
  reduceMotion: boolean;
  disableBlur: boolean;
}

export const DEFAULTS: SettingsState = {
  theme: "dark",
  accentColor: "aurora",
  density: "comfortable",
  fontSize: "standard",
  defaultFilters: {},
  defaultLocation: "ALL",
  reduceMotion: false,
  disableBlur: false,
};
```

The `scale` field is used by the chart. The CSS percentages are the rendering
source; the comment above both definitions should say they must stay in sync.

### 7.6 Persistence and validation

`context/settings/storage.ts` already validates every field. Add `fontSize`
to the import and the validation block:

```ts
const fontSize: FontSize = raw.fontSize === "small" ||
    raw.fontSize === "large" || raw.fontSize === "xlarge"
  ? raw.fontSize
  : DEFAULTS.fontSize;
```

Then include it explicitly after the spread:

```ts
return {
  ...DEFAULTS,
  ...raw,
  theme,
  accentColor,
  density,
  fontSize,
  defaultLocation,
  reduceMotion: typeof raw.reduceMotion === "boolean"
    ? raw.reduceMotion
    : DEFAULTS.reduceMotion,
  disableBlur: typeof raw.disableBlur === "boolean"
    ? raw.disableBlur
    : DEFAULTS.disableBlur,
  defaultFilters: sanitizeFilterPatch(raw.defaultFilters),
};
```

Properties:

- Missing `fontSize` in an existing stored blob becomes `standard`.
- Unknown values become `standard`.
- Other fields keep their own validation; one bad field never resets the
  whole blob.
- The storage key and shape stay backward compatible. No version bump and no
  migration.
- `saveSettings` is unchanged; it already serializes the whole state.

### 7.7 DOM application

Add to `context/settings/appliers.ts`:

```ts
// Applies the font-size preset via dataset.fontSize (falls back to
// standard); persisted via save, not here.
export function applyFontSize(f: FontSize) {
  const key: FontSize = f === "small" || f === "large" || f === "xlarge"
    ? f
    : "standard";
  // The attribute switches the root percentage; every type token is rem,
  // so the whole UI rescales at once while density keeps its rhythm.
  document.documentElement.dataset.fontSize = key;
}
```

`context/SettingsContext.tsx` changes:

- Import `applyFontSize`.
- Import and re-export `FONT_SIZE_PRESETS` and the `FontSize` type.
- Add `setFontSize: (f: FontSize) => void` to `Ctx`.
- Add a no-op default in `createContext`.
- Call `applyFontSize(s.fontSize)` in the mount effect, after
  `applyDensity`.
- Add the setter:

```ts
const setFontSize = useCallback((f: FontSize) => {
  applyFontSize(f);
  patch({ fontSize: f });
}, [patch]);
```

- Include `setFontSize` in the provider value.

The mount effect becomes:

```ts
useEffect(() => {
  const s = loadSettings();
  latest.current = s;
  setSettings(s);
  applyTheme(s.theme);
  applyAccent(s.accentColor);
  applyDensity(s.density);
  applyFontSize(s.fontSize);
  applyMotion(s.reduceMotion);
  applyBlur(s.disableBlur);
}, []);
```

### 7.8 Pre-hydration restore

Extend the `INIT` string in `routes/_app.tsx`:

```js
var fs = s.fontSize;
fs = (fs === "small" || fs === "standard" || fs === "large" ||
    fs === "xlarge")
  ? fs
  : "standard";
document.documentElement.dataset.fontSize = fs;
```

Place it next to the density restore. Update the comment above `INIT` to
mention font size. The inline script stays static and must not interpolate
request data.

Why this is needed:

- It applies the saved size before the first paint.
- It prevents a visible jump from 100% to the saved size after hydration.
- It keeps the no-JS fallback at the browser default of 100%, which is safe.

The script duplicates the four-value validation because it cannot import the
TypeScript module. Keep the list short and in sync with `FontSize`. This is
the same pattern already used for theme and density.

### 7.9 Settings UI

Add `components/settings/FontSizePicker.tsx`, modeled on `DensityPicker`:

- Section title: `Tamanho do texto`.
- A grid of four buttons. Use
  `gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))"` so it is two
  columns in the 420px panel and one column on very narrow screens.
- Each button shows:
  - An `Aa` glyph sized with the preset scale, `fontSize:`${p.scale}em``.
  - The preset label in `var(--d-small)`.
  - The hint in `var(--d-density-hint)`.
  - A `Recomendado` badge on `standard`, in `var(--d-caption)`.
  - A 2px accent underline when selected, matching `DensityPicker`.
- Each button uses `type="button"`, `aria-pressed={isA}`, and the existing
  `animate-theme` press class when it is the active press target.
- Keep the same border, radius, background, and shadow treatment as
  `DensityPicker` so the two controls read as a family.

Illustrative structure:

```tsx
<button
  type="button"
  key={value}
  onClick={() => onFontSize(value)}
  className={isAnim ? "animate-theme" : ""}
  aria-pressed={isA}
  style={{
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "var(--d-pill-gap)",
    padding: "var(--d-density-pad)",
    borderRadius: "var(--d-opt-radius)",
    border: isA ? "2px solid var(--accent)" : "2px solid var(--border)",
    background: "var(--bg-elevated)",
    cursor: "pointer",
    transition: "all .2s var(--ease-std)",
    boxShadow: isA ? "0 0 12px var(--glow)" : "none",
  }}
>
  <span
    aria-hidden="true"
    style={{
      fontSize: `${p.scale}em`,
      fontWeight: 700,
      lineHeight: 1,
      color: isA ? "var(--accent)" : "var(--text-secondary)",
    }}
  >
    Aa
  </span>
  <span
    style={{
      fontSize: "var(--d-small)",
      fontWeight: isA ? 700 : 500,
      color: isA ? "var(--accent)" : "var(--text-secondary)",
    }}
  >
    {p.label}
  </span>
  <span
    style={{
      fontSize: "var(--d-density-hint)",
      lineHeight: 1.4,
      color: "var(--text-muted)",
      textAlign: "center",
    }}
  >
    {p.hint}
  </span>
  <div style={{ minHeight: 18, display: "flex", alignItems: "center" }}>
    {value === "standard" && (
      <span
        style={{
          fontSize: "var(--d-caption)",
          fontWeight: 800,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--accent)",
          background: "color-mix(in srgb,var(--accent) 12%,transparent)",
          border: "1px solid color-mix(in srgb,var(--accent) 30%,transparent)",
          borderRadius: "var(--d-pill-sm-radius)",
          padding: "var(--d-count-pad)",
        }}
      >
        Recomendado
      </span>
    )}
  </div>
  {isA && (
    <div
      style={{
        width: 20,
        height: 2,
        borderRadius: 1,
        background: "var(--accent)",
      }}
    />
  )}
</button>;
```

`components/settings/AppearanceSection.tsx` changes:

- Add `activeFontSize: FontSize | null` and
  `onFontSize: (f: FontSize) => void` to `Props`.
- Import `FontSizePicker`.
- Render it after `DensityPicker` and before `AccentPicker`. Density sets the
  baseline rhythm; font size multiplies it, so the order communicates the
  relationship.
- Add a sample sentence to the existing preview box so the user can judge
  body text, not only chips:

```tsx
<div
  style={{
    fontSize: "var(--d-body)",
    color: "var(--text-secondary)",
    lineHeight: 1.6,
    marginBottom: "var(--d-opt-gap)",
  }}
>
  Exemplo de leitura: conformidade, criticidade e rastreabilidade.
</div>;
```

`components/SettingsPanel.tsx` changes:

- Import the `FontSize` type.
- Destructure `setFontSize` from `useSettings()`.
- Add `activeFontSize` state, mirroring `activeDensity`.
- Add `handleFontSize` with the same 350ms press animation.
- Pass `activeFontSize` and `onFontSize` to `AppearanceSection`.

The picker is keyboard accessible by construction: native buttons, visible
focus from the browser, `aria-pressed` for selection, and a section title that
provides context. No `aria-live` announcement is required because the whole
page visibly changes and the pressed state is announced.

### 7.10 Chart hardening

The chart is the only component where the font-size setting can cause
overlap. Add a pure geometry helper to `components/chart/geometry.ts`:

```ts
export const TEXT_DY = 14;
export const AXIS_TEXT_DY = 18;

export interface ChartGeometry {
  ROW_H: number;
  BAR_H: number;
  LABEL_W: number;
  COUNT_W: number;
  AXIS_H: number;
  TEXT_DY: number;
  AXIS_TEXT_DY: number;
  LABEL_CHARS: number;
}

// chartGeometry: density geometry scaled by the user font-size preset.
// Row and bar heights follow the font scale. The label column grows more
// slowly (capped at 1.15x) so the plot keeps usable width, and the label
// character budget shrinks when the font outgrows the column.
export function chartGeometry(
  density: DensityKey,
  scale: number,
): ChartGeometry {
  const g = GEO[density] ?? GEO.comfortable;
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const labelW = Math.round(g.LABEL_W * Math.min(s, 1.15));
  const widthRatio = labelW / g.LABEL_W;
  return {
    ROW_H: Math.round(g.ROW_H * s),
    BAR_H: Math.round(g.BAR_H * s),
    LABEL_W: labelW,
    COUNT_W: Math.max(COUNT_W, Math.round(COUNT_W * s)),
    AXIS_H: Math.round(AXIS_H * s),
    TEXT_DY: Math.round(TEXT_DY * s),
    AXIS_TEXT_DY: Math.round(AXIS_TEXT_DY * s),
    LABEL_CHARS: Math.max(8, Math.floor(26 * widthRatio / s)),
  };
}
```

The base 26 matches the current `truncateLabel` default, so the standard
preset keeps the current truncation. At Muito grande the label column grows
15% while the font grows 25%, so the character budget drops to about 23. The
full name remains in the `<title>` element and in the table filter.

Update `layoutChart` to accept the scaled count column:

```ts
export function layoutChart(
  available: number,
  labelW: number,
  countW = COUNT_W,
): ChartLayout {
  const plotW = Math.max(MIN_PLOT_W, available - labelW - countW);
  return { plotW, width: labelW + plotW + countW };
}
```

Update `chartHeight` to accept the scaled axis height:

```ts
export function chartHeight(
  rowCount: number,
  rowH: number,
  axisH = AXIS_H,
): number {
  return TOP + rowCount * rowH + axisH;
}
```

`components/ComplianceChartInner.tsx` changes:

- Import `FONT_SIZE_PRESETS` next to `useSettings`.
- Remove the now-unused `GEO` import from this file; the geometry helper
  owns the density lookup.
- Compute:

```ts
const scale = FONT_SIZE_PRESETS[settings.fontSize]?.scale ?? 1;
const geo = chartGeometry(settings.density, scale);
const {
  ROW_H,
  BAR_H,
  LABEL_W,
  COUNT_W: countW,
  AXIS_H,
  TEXT_DY,
  AXIS_TEXT_DY,
  LABEL_CHARS,
} = geo;
const height = chartHeight(data.length, ROW_H, AXIS_H);
const { plotW, width } = layoutChart(available, LABEL_W, countW);
```

- Use `AXIS_TEXT_DY` for the tick baseline instead of the literal `18`.
- Pass `labelW={LABEL_W}`, `barH={BAR_H}`, `rowH={ROW_H}`, and
  `plotW={plotW}` to `ChartRow` as today.
- Pass `maxLabelChars={LABEL_CHARS}` and `textDy={TEXT_DY}` to `ChartRow`.

`components/chart/ChartRow.tsx` changes:

- Add `maxLabelChars: number` and `textDy: number` to `Props`.
- Use `y + textDy` for both the label baseline and the count baseline.
- Call `truncateLabel(d.name, maxLabelChars)`.
- Keep the full name in `<title>` and in `aria-label`.

At 125% with a 16px browser default, the geometry becomes:

| Density     | ROW_H | BAR_H | LABEL_W | COUNT_W | AXIS_H | TEXT_DY | AXIS_TEXT_DY | LABEL_CHARS |
| ----------- | ----: | ----: | ------: | ------: | -----: | ------: | -----------: | ----------: |
| Compacto    |    23 |    15 |     207 |      70 |     33 |      18 |           23 |          23 |
| Confortável |    28 |    19 |     230 |      70 |     33 |      18 |           23 |          23 |
| Amplo       |    33 |    23 |     253 |      70 |     33 |      18 |           23 |          23 |

At 100% the values are the current geometry and the label budget is 26.

The donut in `ChartSummary` needs less work because its text scales inside a
fixed 132px SVG. Convert the numeric 22 to `1.375rem` and audit the center
label at Muito grande. If it overflows in visual QA, reduce the center value
to `var(--d-band-num)` or enlarge the donut; do not scale the SVG and the
rem text together, which would double-scale the glyphs.

`ChartTooltip` is HTML, so its `var(--d-body)` text scales automatically. The
`maxWidth: 260` can stay; it wraps and remains within the viewport because
`clampTooltip` measures the rendered size.

### 7.11 Hardcoded size cleanup

Apply the conversions in section 4.2:

- `lib/aurora.ts`: change the seven `fontSize` numbers to rem strings. The
  object type stays `as const`; Preact accepts string font sizes.
- `components/login/BrandHeader.tsx`: `24` to `"1.5rem"`.
- `components/chart/ChartSummary.tsx`: `22` to `"1.375rem"`.
- `components/header/SyncDetailsModal.tsx`: `14` to `"0.875rem"`.
- `components/header/SyncHoverCard.tsx`: `19` to `"1.1875rem"`.
- `components/loading/SplashCard.tsx`: update the three `var()` fallbacks to
  rem values.
- `static/styles.css`: update `body` and `.login-input` as shown in 7.4.

Search for leftovers after the change:

```bash
rg -n --glob '*.tsx' --glob '*.ts' 'fontSize:\s*[0-9]'
rg -n --glob '*.css' 'font-size:\s*[0-9]+px'
```

The only allowed numeric font sizes after this work are SVG user-unit values
that are intentionally part of a fixed drawing, and they must be documented
as such.

### 7.12 What does not change

- Density presets, spacing tokens, radii, borders, shadows, and control
  sizes.
- Theme, accent, reduced-motion, and blur behavior.
- The settings storage key and the rest of the settings schema.
- The table's horizontal scroll behavior.
- PDF/XLSX export metrics.
- Server routes, database schema, and authentication.

## 8. File-by-file implementation plan

Do the work in this order so each step is independently verifiable.

### Step 0: Land the readability pass

Commit the existing readability changes first. The token values in this plan
depend on that pass. Verify `deno task test` before starting the font-size
work.

### Step 1: Convert all UI type sizes to rem

Files:

- `static/styles.css`
- `lib/aurora.ts`
- `components/login/BrandHeader.tsx`
- `components/chart/ChartSummary.tsx`
- `components/header/SyncDetailsModal.tsx`
- `components/header/SyncHoverCard.tsx`
- `components/loading/SplashCard.tsx`

Changes:

- Add the root `font-size: 100%` and the four `[data-font-size]` rules.
- Add the floor variables to the comfortable block.
- Convert all 17 type tokens in all three density blocks to rem.
- Convert `body` and `.login-input` to rem.
- Apply the rem conversions from section 4.2 to `AURORA_TYPE`, `ChartSummary`,
  and the remaining inline numeric sizes.
- Update the `SplashCard` fallbacks.
- Update the comments to explain that type tokens are rem and spacing tokens
  stay px.

Verification:

- Standard preset at a 16px browser default is pixel identical.
- `rg` finds no raw px font sizes in the CSS or inline styles.
- The page renders normally with no `data-font-size` attribute because the
  root defaults to 100%.
- Header, login, sync card, and splash look unchanged at standard.

### Step 2: Add the settings data and appliers

Files:

- `context/settings/presets.ts`
- `context/settings/storage.ts`
- `context/settings/appliers.ts`
- `context/SettingsContext.tsx`
- `routes/_app.tsx`

Changes:

- Add `FontSize`, `FONT_SIZE_PRESETS`, `SettingsState.fontSize`, and
  `DEFAULTS.fontSize`.
- Validate `fontSize` in `loadSettings`.
- Add `applyFontSize`.
- Add the context setter, mount application, exports, and default no-op.
- Add the pre-hydration restore in `INIT`.

Verification:

- The setting can be changed from a unit test or a temporary console hook.
- A reload restores it before hydration.
- An invalid stored value falls back to standard.

### Step 3: Harden the chart

Files:

- `components/chart/geometry.ts`
- `components/chart/ChartRow.tsx`
- `components/ComplianceChartInner.tsx`

Changes:

- Add `chartGeometry`, `TEXT_DY`, `AXIS_TEXT_DY`, and the scaled
  `layoutChart` and `chartHeight` parameters.
- Pass the scaled geometry and label budget through `ComplianceChartInner`
  and `ChartRow`.

Verification:

- All four presets x three densities render without overlapping labels.
- Long category names truncate with an ellipsis and keep the full name in
  the tooltip.
- The chart height grows at larger presets instead of clipping rows.
- The two-column layout still fits at 125% on a 1440px viewport.

### Step 4: Add the picker UI

Files:

- `components/settings/FontSizePicker.tsx` (new)
- `components/settings/AppearanceSection.tsx`
- `components/SettingsPanel.tsx`

Changes:

- Build the four-option picker.
- Wire the active press state and the context setter.
- Add the sample sentence to the preview.
- Place the picker after density and before accent.

Verification:

- Keyboard navigation works.
- `aria-pressed` reflects the selected preset.
- The preview and the rest of the panel change immediately.
- The panel scrolls at Muito grande on a short viewport.

### Step 5: Tests, docs, and visual audit

Files:

- `context/settings/storage_test.ts` (new)
- `context/settings/appliers_test.ts` (new)
- `context/settings/presets_test.ts` (new)
- `context/settings_test.ts`
- `components/chart/geometry_test.ts`
- `docs/ARCHITECTURE.md`
- `docs/USO.md`

Changes:

- Add the tests in section 9.1.
- Update the runtime line in `docs/ARCHITECTURE.md` to mention font size.
- Add "tamanho do texto" to the settings list in `docs/USO.md`.
- Run the manual matrix in section 9.2.

## 9. Testing plan

### 9.1 Automated tests

`context/settings/storage_test.ts`:

- Missing `fontSize` returns `standard`.
- A valid `fontSize` is preserved.
- An unknown `fontSize` falls back to `standard`.
- An invalid `fontSize` does not reset `theme`, `density`, or other fields.
- A malformed JSON blob still returns `DEFAULTS`.

`context/settings/appliers_test.ts`:

- `applyFontSize("large")` writes `data-font-size="large"` on the document
  element.
- An invalid runtime value falls back to `standard`.
- The function does not throw when called repeatedly.

`context/settings_test.ts`:

- Extend the mount helper to accept an initial storage map.
- Mounting with a stored `fontSize: "large"` hydrates the setting and applies
  the dataset.
- `setFontSize("xlarge")` updates the context, persists the value, and
  applies the dataset.
- `setFontSize` and `setDensity` in the same tick both land, because both use
  the `latest` ref and the single `patch`.
- `resetFilterDefaults` keeps `fontSize` untouched, alongside theme and
  density.

`components/chart/geometry_test.ts`:

- `chartGeometry(density, 1)` equals the current `GEO` values for `ROW_H`,
  `BAR_H`, and `LABEL_W`, and returns `LABEL_CHARS = 26`.
- `chartGeometry(density, 1.25)` grows rows and bars, caps `LABEL_W` at
  1.15x, grows `COUNT_W`, and reduces `LABEL_CHARS`.
- `chartGeometry` falls back to scale 1 for `0`, negative, `NaN`, and
  `Infinity`.
- `layoutChart` uses the passed count width.
- `chartHeight` uses the passed axis height.
- Existing layout tests continue to pass with the default `COUNT_W` and
  `AXIS_H`.

`context/settings/presets_test.ts` (new):

- The four preset keys are exactly `small`, `standard`, `large`, `xlarge`.
- The scales are exactly `0.9375`, `1`, `1.125`, and `1.25`.
- The default is `standard`.

Run:

```bash
deno task test
```

The full suite is currently 650 passing tests and takes about three minutes.
The pre-existing rate-limit test in `lib/server/fracttal/adaptive-rate_test.ts`
holds for five minutes; do not treat a longer wall clock as a failure.

Targeted checks for changed files:

```bash
deno fmt --check <changed files>
deno lint <changed files>
deno check main.ts routes/api/*.ts routes/api/*/*.ts routes/api/*/*/*.ts \
  routes/auth/*/*.ts routes/auth/*/*/*.ts scripts/*.ts
```

The full `deno task check` currently stops at `deno fmt --check` on 14
pre-existing unformatted files unrelated to this work. Keep that failure
separate from the font-size change and do not reformat unrelated files.

### 9.2 Manual visual matrix

Capture a baseline before Step 1 and compare it after Step 1 at the standard
preset, with `deno task dev` running. The repository already has a CDP
screenshot helper:

```bash
deno run -A scripts/browser-capture.ts http://localhost:5173/ \
  /tmp/opencode/font-size-baseline.png --mode shot
```

Capture at least the dashboard, settings panel, login, and barrier modal.
After Step 1, capture the same screens and confirm pixel identity at 100%.
Then run the full preset matrix.

Run the key screens at all four presets and all three densities. At minimum,
cover dark, light, and amoled once per preset.

Screens:

- Login and splash.
- Dashboard header, KPI grid, status band, and compliance chart.
- Filter bar and table, including the columns menu and pagination.
- Barrier modal: details, contingency, history, edit, and Fracttal raw data.
- Settings panel: appearance, filters, account, and admin.
- Sync hover card and sync details modal.
- Export menu and export progress.
- Error boundary and empty states.

Viewports:

- 320px wide (reflow check).
- 768px wide (tablet and one-column chart).
- 1024px, 1440px, and 1920px wide.

Browser text defaults:

- 12px, 16px, 20px, and 24px, using the browser's font-size setting.

Zoom and text spacing:

- 200% browser zoom on the dashboard, table, settings, and barrier modal.
- 400% browser zoom at 1280px wide for the reflow check.
- Text-spacing bookmarklet with the 1.4.12 values.

Data and state:

- Missing `barrier-settings`.
- Invalid `fontSize` in `barrier-settings`.
- Storage unavailable or private mode.
- Reload after changing the preset.
- Change preset while the settings panel is open, then close and reopen.
- Change preset while a modal is open.
- Change preset while the sync hover card is open.

Expected results:

- No clipped, overlapping, or hidden text.
- No horizontal page scroll at 320px except the data table.
- Chart rows stay aligned; labels truncate with an ellipsis.
- Buttons, inputs, badges, and chips grow with their text.
- The fixed settings panel and modals stay within the viewport.
- The selected preset survives reload.
- Standard is visually identical to the build before the change.

### 9.3 Accessibility checks

- Tab through the picker and confirm focus is visible and the order is
  logical.
- Confirm `aria-pressed` changes on selection.
- Confirm the section title is announced with the group.
- Confirm the page remains usable at 200% browser zoom.
- Confirm the page remains usable with text spacing overrides.
- Spot-check with a screen reader that the picker labels are read as
  "Pequeno", "Padrão", "Grande", and "Muito grande".
- Confirm the font-size setting does not change color contrast.
- Confirm the chart's full category name is still available in the tooltip
  and accessible name when the visible label is truncated.

### 9.4 Performance checks

- Changing the preset triggers one layout pass. This is expected and
  acceptable for a settings action.
- The chart re-renders once per preset change; row memoization still avoids
  re-rendering on hover.
- No new network requests, fonts, or assets.
- CSS `max()` and rem values have no measurable runtime cost.

## 10. Rollout and migration

### 10.1 Data migration

None. The new field is additive in the existing `barrier-settings` JSON blob:

```json
{
  "theme": "dark",
  "accentColor": "aurora",
  "density": "comfortable",
  "fontSize": "standard",
  "defaultFilters": {},
  "defaultLocation": "ALL",
  "reduceMotion": false,
  "disableBlur": false
}
```

Existing users load `standard` because the field is missing. Invalid values
also load `standard`. This is an additive field in the existing
`barrier-settings` key, not a new key, and it stores no personal data. There
is no database migration and no server change.

### 10.2 Suggested commit sequence

1. `Convert all UI type sizes to rem`
2. `Add font-size preference to settings`
3. `Scale chart geometry with the font-size preference`
4. `Add font-size picker to appearance settings`
5. `Document and test the font-size setting`

Each step should build and pass the relevant tests. Step 1 is safe because
the standard preset is pixel identical. Step 2 has no user-facing UI until
step 4, so it can be verified from the console.

### 10.3 Rollback

- To hide the feature, remove the picker from `AppearanceSection`. The stored
  field is ignored by the UI, and the rest of the settings keep working.
- To disable the rendering, remove the `[data-font-size]` rules and the
  `INIT` line. The root falls back to 100%.
- To revert the chart scaling, pass `scale = 1` in `ComplianceChartInner`.
- No database rollback is needed.

### 10.4 Communication

Add a short release note: "Agora você pode ajustar o tamanho do texto em
Configurações > Aparência. A densidade continua controlando o espaçamento."
Update `docs/USO.md` section 6 with the same information.

## 11. Risks and mitigations

| Risk                                                   | Likelihood | Impact | Mitigation                                                                                                                    |
| ------------------------------------------------------ | ---------: | -----: | ----------------------------------------------------------------------------------------------------------------------------- |
| Text clips or overlaps at Muito grande.                |     Medium |   High | Visual matrix, chart geometry scaling, `min-height` instead of fixed heights, responsive grids.                               |
| Chart labels collide or truncate too aggressively.     |     Medium | Medium | Scale row/bar/label geometry, reduce the character budget, keep the full name in `<title>` and `aria-label`.                  |
| Fixed-width panels or modals overflow.                 |     Medium | Medium | Viewport caps, internal scroll, 320px and 200% zoom tests.                                                                    |
| Standard preset is not pixel identical.                |        Low |   High | Convert with exact px/16 values, use floors only where the standard value is above the floor, compare screenshots.            |
| Pequeno makes small text unreadable.                   |     Medium |   High | Floor variables for small, caption, micro, tiny, density hint, and badge sizes.                                               |
| Users confuse density with font size.                  |     Medium |    Low | Labels, hints, order, release note, and docs.                                                                                 |
| Browser default text size composition surprises users. |        Low | Medium | Test 12, 16, 20, and 24px defaults; document that the setting composes with the browser.                                      |
| `max()` is unsupported in an old browser.              |        Low | Medium | Target browsers support CSS `max()`; if the deployment target includes older engines, use a static floor per density instead. |
| Icons look small next to larger text.                  |     Medium |    Low | Audit alignment; icon scaling is a separate design change and out of scope.                                                   |
| The setting is mistaken for a WCAG 1.4.4 replacement.  |        Low | Medium | Document that browser zoom remains the 200% path; test zoom explicitly.                                                       |
| localStorage is unavailable.                           |        Low |    Low | The setting applies live but does not persist; this matches the existing settings behavior.                                   |
| Cross-tab changes are not synchronized.                |        Low |    Low | Existing settings do not listen to `storage` events; document as a known limitation or add a listener later.                  |
| The readability pass and the font-size pass conflict.  |        Low | Medium | Land the readability pass first; the font-size plan assumes its token values.                                                 |

## 12. Acceptance criteria

- [ ] Settings > Aparência shows a `Tamanho do texto` control with Pequeno,
      Padrão, Grande, and Muito grande.
- [ ] Padrão is selected by default and is pixel identical to the current
      build at a 16px browser default.
- [ ] Selecting a preset changes text immediately across the dashboard,
      settings, login, splash, modals, table, chart, and sync UI.
- [ ] The selection persists across reloads.
- [ ] The selection is applied before hydration; there is no visible font
      size jump on load.
- [ ] Missing or invalid stored values fall back to Padrão without resetting
      other settings.
- [ ] All four presets work with all three densities and all three themes.
- [ ] The chart rows, bars, labels, counts, and axis scale with the preset.
- [ ] Long chart labels truncate with an ellipsis and keep the full name in
      the tooltip and accessible name.
- [ ] No text is clipped or overlapping at Muito grande on the key screens.
- [ ] The page remains usable at 320px width and at 200% browser zoom.
- [ ] The text-spacing checks in WCAG 1.4.12 pass on the key screens.
- [ ] The picker is keyboard accessible and exposes `aria-pressed`.
- [ ] No raw px font sizes remain outside intentional SVG user-unit values.
- [ ] `deno task test` passes.
- [ ] Targeted `deno fmt --check`, `deno lint`, and `deno check` pass for the
      changed files.
- [ ] The pre-existing full `deno task check` formatting failure is
      documented and not attributed to this change.
- [ ] `docs/ARCHITECTURE.md` and `docs/USO.md` mention the setting.
- [ ] No database, API, or authentication changes are required.

## 13. Open questions

1. Should the app setting offer 200% instead of 125%?
   Recommendation: no for the first release. Four presets cover the reading
   preference, and browser zoom remains the 200% conformance path. Adding a
   fifth 200% preset would require a much larger layout audit.

2. Should Pequeno be offered at all?
   Recommendation: yes. It is useful on small laptops, and the floors keep
   the smallest informational text readable. If product prefers only
   standard and larger, remove `small` and adjust the preset table, CSS, and
   tests.

3. Should login and splash follow the setting?
   Recommendation: yes. The root font-size is global, and the setting should
   behave consistently across the website.

4. Should the preference sync across devices?
   Recommendation: no in this phase. The current settings model is
   browser-local. A future server-side user preference can reuse the same
   `FontSize` type and applier.

5. Should density and font size be merged into one control?
   Recommendation: no. They answer different questions: spacing rhythm
   versus text size.

6. Should icons scale with the text?
   Recommendation: no in this phase. Audit alignment and revisit if the
   visual mismatch is significant.

7. Should exports use the same preference?
   Recommendation: no. PDF and XLSX have their own print layouts and font
   metrics.

## 14. Appendix

### 14.1 Inventory commands

```bash
rg -n --glob '*.tsx' --glob '*.ts' 'fontSize:\s*[0-9]'
rg -n --glob '*.css' 'font-size:\s*[0-9]+px'
rg -n --glob '*.tsx' --glob '*.ts' 'fontSize:\s*"'
rg -n --glob '*.css' 'var\(--d-(hero|display|band-num|dialog-title|arrow|lead|body|small|caption|micro|tiny|page-fs|density-hint)'
```

### 14.2 Current type-scale values after the readability pass

Comfortable: 19, 27, 20, 21, 16, 14, 13, 12, 12, 11, 10, 15, 11, 12, 13,
18, 12.

Compact: 17, 23, 18, 19, 14, 13, 12, 11, 11, 10, 9, 14, 10, 11, 12, 16, 11.

Spacious: 21, 31, 22, 23, 18, 15, 14, 13, 13, 12, 11, 16, 12, 13, 14, 20,
13.

The order is hero, display, band-num, dialog-title, arrow, lead, body, small,
caption, micro, tiny, page-fs, badge-xs, badge-sm, badge-md, panel-title,
density-hint.

### 14.3 Glossary

- rem: a CSS length relative to the root element's font size.
- Root font-size: the computed font size of the `<html>` element.
- Density: the spacing and baseline type-scale preset.
- Font scale: the multiplier applied by the font-size preset.
- Floor: the minimum computed size for a small token.
- FOUC: flash of unstyled or incorrectly styled content before hydration.

### 14.4 References

- WCAG 2.2 SC 1.4.4 Resize Text:
  https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html
- WCAG technique G178, controls that change text size:
  https://www.w3.org/WAI/WCAG22/Techniques/general/G178
- WCAG failure F69, resized text clipped or obscured:
  https://www.w3.org/WAI/WCAG22/Techniques/failures/F69
- WCAG 2.2 SC 1.4.10 Reflow:
  https://www.w3.org/WAI/WCAG22/Understanding/reflow.html
- WCAG 2.2 SC 1.4.12 Text Spacing:
  https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html
- MDN CSS length units, including rem:
  https://developer.mozilla.org/en-US/docs/Web/CSS/length
- MDN font-size:
  https://developer.mozilla.org/en-US/docs/Web/CSS/font-size
