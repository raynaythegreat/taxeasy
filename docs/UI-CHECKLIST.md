# UI Pre-delivery Checklist

Apply this checklist to every PR that touches UI code.

## Visual

- [ ] No emoji icons — Lucide SVG only
- [ ] `cursor-pointer` on every clickable element
- [ ] No layout shift on hover (transitions use `transition-colors`, not `scale`)
- [ ] Light **and** dark mode verified at 375 / 768 / 1024 / 1440 px

## Accessibility

- [ ] Visible `focus-visible` ring on all interactive elements
- [ ] Text contrast >= 4.5:1 (axe DevTools or WAVE pass)
- [ ] `prefers-reduced-motion` respected for animations
- [ ] Tab order matches visual order; modals trap focus
- [ ] All `<button>` elements have an explicit `type` attribute
- [ ] Decorative SVGs have `aria-hidden="true"`
- [ ] Error/status messages have `role="alert"` + `aria-live`
- [ ] Currency inputs have `inputMode="decimal"`

## Loading & Error States

- [ ] Loading states shown for any async operation > 300 ms
- [ ] Error boundaries wrap top-level routes/features
- [ ] Empty states shown when lists have no data

## Tokens

- [ ] Colors use `--primary`, `--accent`, `--money-*` tokens — no ad-hoc hex in new code
- [ ] z-index values use `--z-*` scale variables
- [ ] Monetary values use `.tabular-nums` class

## Code Quality

- [ ] No `console.log` or debug statements
- [ ] No new `!important` overrides without comment
- [ ] `pnpm lint` errors not increased from baseline
