# Design

## The HTML contract (the scripts depend on it)

- **One self-contained HTML file per post** (per slide for carousels).
- `<body>` holds **exactly one root: `<div id="canvas">`**, sized **exactly** to the format —
  `width:<W>px; height:<H>px; position:relative; overflow:hidden;` — with `html,body{margin:0}`.
- **px units only** for layout and type. No `vw`, `vh`, `%` heights, `rem` sizes, `position:fixed`.
- **CSS in one `<style>`** in `<head>`. Fonts: one `<link>` to `https://fonts.googleapis.com/css2?…`
  (max 2 families) or local font files via `@font-face`.
- **Pictures:** files you copied to `./assets/`, referenced relatively. Never hotlink random URLs.
- **No `<script>`.** Motion is CSS only (see motion.md). `<video>` is allowed for real recordings.
- **Still images have no animations.** (The renderer shows the end state, but don't rely on it.)

## The craft — what makes a post look professional

**One idea per post.** If you need "and", it's two posts.

**Hierarchy:** one dominant element (the headline *or* the product visual), one supporting line, the
brand mark. The eye should land in under a second.

**Type**
- Headline ≥ 80px at 1080 wide (≥ 96px on 9:16). Body ≥ 34px. Nothing under 26px.
- At most two font families — the product's own. Tight headline line-height (1.0–1.1), generous body (1.3–1.45).
- ≤ 25 words on a still image. ≤ 10 words per video scene. Cut, then cut again.
- No orphans: balance multi-line headlines (`text-wrap: balance`).

**Colour:** the brief's palette only. Strong contrast (WCAG AA: 4.5:1 for body text, 3:1 for headlines).
Obey the design rules (if "no red", there is no red — not even an error state).

**Layout:** a margin of at least the safe area plus 20px. An 8px spacing rhythm. Align to a few strong
edges. Leave real empty space — crowded posts read as ads and get skipped.

**The product is the hero.** Show it, don't describe it:
- **Recreate real screens** from the code: same colours, radii, spacing, icons and words. Put them in a
  clean device frame (CSS: rounded rectangle, 18–24px bezel, subtle notch) or as floating cards.
- **Zoom in on the moment that matters** — one card, one button, one result — larger than life.
- Use the product's **own illustrations, mascots and app icon** when they exist. They beat any generic
  shape or gradient.
- **Never show a picture larger than about 2× its source size** (the inventory lists every picture's
  pixel size). Look for a bigger version first (app icon sets, `@3x` files, design handoffs in `docs/`);
  if there is none, show it smaller or tell the user it will look soft.
- Real data in recreated UI must be plausible and harmless (no real users' names or emails).

**Brand mark:** the product name (and icon if there is one) on every post, small and consistent.

**Avoid the AI-template look:** no purple-blue gradient blobs unless that *is* the brand, no random
3D shapes, no stock-photo vibes, no centred-everything layouts by default, no glassmorphism for its own
sake, no fake browser chrome around mobile apps.

## Carousel specifics

Same grid, margins and type scale on every slide. Slide 1 = hook only (big, simple). Middle slides =
one point each, numbered if it's a list. Last slide = product name, one-line summary, call to action.
Use a small progress cue (e.g. "2/5") only if it helps.

## Copy on the visual

Specific beats clever. Use the product's real words where possible ("Biscuit sat on cue — +1 treat").
Verbs and outcomes, not adjectives. Respect the stage ("Coming soon to iPhone").
