# Platforms

**The numbers live in `formats` — always run it; never size or place from memory.**

```
<toolkit> formats            # all
<toolkit> formats <id>       # one
```

Each format gives `width`/`height`, `safe` (px from each edge the platform covers — **all text and
key visuals stay inside**), `kind` (image · carousel · video), `duration` for video, `slides` for
carousels, and the `vibe`, `caption` style and `maxHashtags`. Show the user the format's `why` when you
pick it for them.

| Format id | Use for |
|---|---|
| `instagram-feed` | Single image: a feature, a moment, an announcement |
| `instagram-carousel` | Guides, walkthroughs, "5 things…", before/after — gets saved and shared |
| `instagram-reel` | Short video: the product in motion, a quick demo, a launch |
| `tiktok-video` | Native-feeling short video: "watch this", POV, quick tip |
| `tiktok-photo` | Swipeable vertical slides: tips and steps |
| `linkedin-image` / `linkedin-square` | Announcements, the problem/solution story, team milestones |
| `linkedin-video` | Calm product walkthrough with captions |

## Hard rules learned in practice

- **Instagram allows at most 5 hashtags.** A 6th is dropped silently. LinkedIn: 3 is the norm.
- **Only the first line shows before "more" / "see more".** It must carry the hook on its own.
- **Instagram's profile grid crops feed posts to 3:4** — keep the headline and subject away from the
  top and bottom edges.
- **Video plays muted.** Every spoken idea must be on-screen text. Captions are part of the design.
- **Carousels:** slide 1 = hook (it's the cover), last slide = name + call to action, consistent layout.

## Captions — the structure that works

**Instagram:** Hook line → 2–4 short lines (benefit, how, proof from the product) → one call to action →
blank line → hashtags (≤5: 1–2 broad, 2–3 specific, 1 branded).

**TikTok:** One casual line like a person talking ("POV: your dog finally gets it 🐶") → 3–5 hashtags.

**LinkedIn:** A strong first line (a fact or a tension, not a greeting) → 3–6 short lines: the problem,
what the team built, what it means → a question or call to action → ≤3 hashtags. No emoji walls.

**Alt text** for every image: one plain sentence describing what's visible.

**Language:** write in the language the user asks for. If the product's audience is non-English (check
the brief), offer a version in that language.
