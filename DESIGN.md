# Calm Utility (Fuzz style `calm-utility`)

Interfaces that disappear. Detail that doesn't. Source: Fuzz `apply_style(calm-utility, tailwind)`, condensed.

## Tokens
| Token | Value | Use |
|---|---|---|
| bg / neutral | #FAFAFA | page background |
| surface | #FFFFFF | cards, panels |
| text / on-surface | #111111 | main text |
| muted | #6F6F6F | metadata, captions |
| line / outline | #E6E6E6 | decorative dividers only |
| outline-strong | #8D8D8D | input, checkbox, toggle borders |
| accent / primary | #5A5AC2 (hover #4C4CA5) | focus, selection, primary action only; text on it #FFFFFF |
| accent2 / secondary | #2E3A5E (hover #273150) | chips, secondary emphasis; text on it #FFFFFF |
| alert / error | #E5484D | errors only; text on it #000000 |

Radius: sm 5px, md 10px (default), lg 15px (cards), full 9999px. Spacing unit 4px: xs 4, sm 8, md 16, lg 24, xl 32; mobile margin 20px.
Shadow (single effect): `0 1px 2px rgba(0,0,0,.06),0 4px 12px rgba(0,0,0,.04)`.
Borders: buttons, cards, chips 1px solid #E6E6E6; inputs 1px solid #8D8D8D.

## Color themes
Colour is a second setting next to Sistema / Claro / Oscuro (Ajustes › Preferencias › Color): `<html data-color>`, from the httpOnly cookie `color`, per device. Seventeen colours: **Índigo** (default, the accent above, unchanged), Sakura (rosa), Matcha (verde), Yuzu (ámbar), Umi (turquesa), Ume (ciruela), Sumi (grafito), Sora (azul), Kon (azul marino), Fuji (lavanda), Budō (uva), Mori (bosque), Wakaba (lima), Kin (oliva dorado), Cha (café), Nezu (pizarra), Suna (arena). The setting is a six-column grid of 44 px swatches.

A colour changes ONLY the accent family: accent, accent-hover, accent2, accent2-hover, accent-soft and heat-1…4. Neutrals, alert red, habit colours, cream, shadows and `theme-color` never change. The mascot keeps indigo (tokens `--color-cat`, `--color-cat2`), the seal stays shu, and icons, Open Graph images and the manifest are untouched.

Accent, light / dark (accent-soft in light / dark). Contrast and distance rules are enforced by `tests/unit/theme-tokens.test.ts`: accent ≥ 4.5:1 on surface, paper and accent-soft; on-accent ≥ 4.5:1 on accent and hover; any two accents ≥ 6 apart and ≥ 10 from alert (OKLab ×100).

| Colour | Accent light | Accent dark | Soft light | Soft dark |
|---|---|---|---|---|
| Índigo | #5A5AC2 | #8C8CF0 | #EFEFF9 | #222238 |
| Sakura | #B93F78 | #F08DB5 | #FBEEF3 | #38222C |
| Matcha | #3A7A4B | #7CC792 | #EDF5EF | #1F3024 |
| Yuzu | #9A6200 | #E3B04B | #FAF1E0 | #352B18 |
| Umi | #0E7785 | #5CC4D1 | #E9F5F6 | #183034 |
| Ume | #8B3F86 | #D08BCB | #F7EEF6 | #332232 |
| Sumi | #3D3D45 | #C9C9D1 | #EFEFF1 | #2A2A2F |
| Sora | #2B6CAF | #76B0F2 | #F1F8FF | #141F2B |
| Kon | #23407A | #6B89C3 | #F3F7FE | #181E29 |
| Fuji | #8256C6 | #B8A9FF | #F8F5FE | #1E1C2B |
| Budō | #5B2E73 | #A277BB | #F9F5FD | #231A27 |
| Mori | #1F5A3D | #669A7D | #F3F8F5 | #17211B |
| Wakaba | #478000 | #B4D37F | #F4F9F1 | #1B2111 |
| Kin | #7A7400 | #B1AB5A | #F8F7EF | #201F10 |
| Cha | #6F4A2F | #B08B71 | #FAF6F3 | #241C17 |
| Nezu | #4A5D73 | #8B9EB4 | #F5F7FA | #1B1E23 |
| Suna | #7D6B55 | #BFAE98 | #F8F6F4 | #211E19 |

Source of truth is `src/styles/tokens.css`: each colour writes its values once per mode as `--pal-*` / `--pal-dark-*` on `[data-color="x"]`; three shared rules map them onto the tokens. Any element with `data-color="x"` scopes the accent to that colour (the swatches use it, no hex in components). The selected swatch is marked by a check and an ink ring, never colour alone.

## Typography
- Inter for headings, body and section labels; Geist Mono for numbers, @usuario and chips. Max two families.
- Headlines weight 600, tracking -0.02em (32px md on mobile). Body 15px/1.5, small 13px/1.45.
- Section labels Inter 13px, weight 600, no tracking. Mono labels 11–14px, tracking 0.04em. Sentence case everywhere.

## Components
- button-primary: accent fill, white label, radius 10, height 48.
- button-secondary: surface fill, flips to accent2 on hover.
- card: surface, radius 15, padding 16, 1px #E6E6E6.
- input: neutral fill, height 44, 1px #8D8D8D.
- chip: accent2 pill, Geist Mono 11px.
- Icons: Phosphor light (`@phosphor-icons/react`, weight "light"), 20px. No emoji, no second icon library.

## Motion
micro 120ms cubic-bezier(.2,0,0,1) (hover, press); standard 200ms cubic-bezier(.32,.72,0,1) (popovers); spatial 350ms (sheets). Honor prefers-reduced-motion. Motion only explains a change.

## Accessibility
WCAG 2.2 AA. Focus ring 2px solid #5A5AC2, 2px offset, on :focus-visible. Tap targets ≥ 44×44. Text ≥ 11px, body ≥ 12px. Never convey state by color alone.

## Never
- No all-caps labels.
- No more than 2 gradients per screen; only tonal accent/accent2/bg; no gradient text.
- No single word highlighted in a headline.
- No small label over a heading that only repeats it.
- No invented ratings, user counts, quotes or placeholder people.
- No raw hex, #000/#fff, stock Tailwind indigo/violet/slate in components: tokens only.
- No emoji as icons.
- No "Thanks!", "Sent", "You're in" without a real request behind it.
- No `transition: all`, no animated width/height/top/left, no animation without reduced-motion fallback.
- No 100vh heroes.
- Accent only for focus, selection and the primary action; never decoration, icons or headings.
- No looping or decorative animation.
- No cards inside cards.

## Copy voice
Plain, precise, friendly, brief. No hype, jargon or exclamations.
