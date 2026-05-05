# Alphorn Brand Guide

## Name

**Alphorn** — named after the traditional Swiss mountain horn. The logo depicts a stylized alphorn on a teal circle.

Alphorn is always written with a capital "A" and lowercase for the rest. Never "ALPHORN", "AlpHorn", or "alphorn" in prose.

## Logo

The logo is an alphorn instrument rendered in white with a black outline, set on a teal (#00897b) circle background.

| File | Purpose |
|------|---------|
| `public/logo.svg` | Primary logo (used in app, sidebar, auth pages) |
| `public/logo_full.svg` | Full logo with optional hat layer (source/editing) |
| `src/app/icon.png` | Favicon (48x48, auto-served by Next.js) |
| `src/app/apple-icon.png` | Apple touch icon (180x180, auto-served by Next.js) |

### Regenerating PNGs

When updating the logo SVG, regenerate the PNGs:

```sh
magick -background none public/logo.svg -resize 180x180 src/app/apple-icon.png
magick -background none public/logo.svg -resize 48x48 src/app/icon.png
```

### Usage in code

Use a plain `<img>` tag for the SVG logo — `next/image` does not handle the mm-unit SVG correctly:

```tsx
<img src="/logo.svg" alt="Alphorn" width={28} height={28} />
```

### Clear space and minimum size

- Maintain at least the logo's radius as clear space around it.
- Minimum display size: 24x24px.
- Do not crop, rotate, distort, or add effects to the logo.

## Colors

The primary brand color is **teal**, defined in OKLCH color space for perceptual uniformity.

### Primary palette

| Role | Light mode | Dark mode | Hex (approx) |
|------|-----------|-----------|---------------|
| Primary | `oklch(0.55 0.14 175)` | `oklch(0.72 0.14 175)` | #00897b / #4db6ac |
| Circle fill | — | — | #00897b |

### Semantic colors

| Role | Light | Dark |
|------|-------|------|
| Destructive | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` |
| Success | `oklch(0.52 0.17 155)` | `oklch(0.62 0.17 155)` |
| Warning | `oklch(0.65 0.16 60)` | `oklch(0.70 0.16 60)` |
| Info | `oklch(0.55 0.15 250)` | `oklch(0.65 0.15 250)` |

### Neutral surface colors

| Role | Light | Dark |
|------|-------|------|
| Background | `oklch(0.995 0 0)` | `oklch(0.10 0 0)` |
| Card | `oklch(1 0 0)` | `oklch(0.13 0 0)` |
| Muted | `oklch(0.965 0 0)` | `oklch(0.17 0 0)` |
| Border | `oklch(0.915 0 0)` | `oklch(1 0 0 / 8%)` |

All colors are defined as CSS custom properties in `src/app/globals.css`. Always reference them via Tailwind utilities (`bg-primary`, `text-destructive`, etc.) — never hardcode color values.

## Typography

| Role | Font | Variable |
|------|------|----------|
| Body / UI | Inter | `--font-inter` |
| Code / Mono | JetBrains Mono | `--font-jetbrains-mono` |

Both loaded via `next/font/google` in the root layout. Use Tailwind's `font-sans` and `font-mono` utilities.

## Iconography

All icons come from [Lucide](https://lucide.dev/) via `lucide-react`. Do not mix in other icon libraries. Use size `h-4 w-4` for inline/menu icons and `h-5 w-5` for standalone icons.

## UI components

All UI is built with [shadcn/ui](https://ui.shadcn.com/) (base-nova style, neutral base color). Components live in `src/components/ui/`. Add new ones with:

```sh
npx shadcn@latest add <component>
```

## Tone

Alphorn's interface is **clean, functional, and developer-focused**. Labels are short and direct. Avoid marketing language in the UI. Error messages should be actionable.
