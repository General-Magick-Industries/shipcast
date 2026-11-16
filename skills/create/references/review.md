# Review — the loop that makes the difference

**A post is not done when the HTML is written. It is done when you have looked at the render and it
passes this checklist.** Be the strict art director the team doesn't have time to be.

## The loop (per post, up to 3 rounds)

1. `check <post.html> --format <id>` → fix every **issue** (text outside the frame, inside a platform's
   safe area, cut off, broken picture, missing `#canvas`). Fix **warnings** (tiny text, font not loaded,
   too many words) unless you have a real reason.
2. `render <post.html> --format <id> --out <post.png>` (video: `frames` at the key moments).
3. **Read the PNG and look at it.** Go through the checklist. Write down what's wrong.
4. Fix the HTML. Go back to 1. Stop when everything passes.

Then `sheet` all posts into one image and look at the **set**: consistent brand, varied angles, no two
posts that look the same.

## Checklist — answer each honestly

**Truth**
- [ ] Every claim, feature name and number is in the brief with evidence.
- [ ] The stage is respected (no "download now" for an unreleased product).
- [ ] The product name is the one the product's UI uses.

**First second**
- [ ] One thing grabs the eye first, and it's the right thing.
- [ ] The hook is readable on a phone held at arm's length (squint test: still legible?).

**Brand**
- [ ] Colours and fonts are the product's (compare against the brief's hex values).
- [ ] The product's design rules are obeyed.
- [ ] The product is recognisable — real screens, real pictures, real words.

**Craft**
- [ ] Nothing touches an edge or sits in the platform's covered areas.
- [ ] Alignment is clean; spacing is even; nothing looks accidental.
- [ ] Text has strong contrast on its background (no text over busy picture areas without a scrim).
- [ ] No overlaps that hide content (e.g. a device frame covering a headline).
- [ ] ≤ 25 words on a still; no orphan words; no awkward line breaks.
- [ ] Recreated UI looks like the real app, not a generic template.

**Platform**
- [ ] Exact size from `formats`; caption follows the platform's style; hashtags ≤ `maxHashtags`.
- [ ] Video: hook by 0.5s, end card in the last 3s, never an empty frame, every line on screen ≥ 2s.

**Would the team post it?** If you hesitate, it's not done. Make it better.

## Common fixes

| Problem | Fix |
|---|---|
| Headline crowds the top | Move it below `safe.top + 20px`; reduce size one step; balance lines |
| Device frame covers text | Shrink or move the frame; give text its own zone |
| Looks generic | Replace shapes with a real screen/illustration from the product; quote real copy |
| Too much text | Cut to the hook + one line; move the rest to the caption |
| Low contrast over a picture | Add a solid or gradient scrim behind the text, or move the text off the picture |
| Font fell back | Fix the Google Fonts link/family name, or use `@font-face` with the product's font file |
