# The brief

Write it to `shipcast-output/<slug>/brief.md`. **Everything in it must be traceable to the source.**
Put the evidence (file path, doc, or "user said") next to every feature and fact.

```markdown
# <Product name> — brief

**One-liner:** <what it is and for whom, in one plain sentence>
**Audience:** <who uses it and why they care>
**Problem it solves:** <the pain, in the user's words>
**Stage:** <released on iOS & Android | TestFlight beta | coming soon | concept> — <evidence>
**Other names in the source (don't use):** <…>

## Features (strongest first)
1. **<Feature as the product names it>** — <benefit to the user> · _evidence: <file>_
2. …  (4–8)

## Screens worth showing
- **<Screen>** — <what it shows> · <layout, colours, radius, spacing, the exact text on it> · _<file>_
- …  (3–5)

## Brand
- Colours: primary <#hex>, accent <#hex>, background <#hex>, surface <#hex>, text <#hex>, other <…>
- Fonts: headings <font>, body <font> (Google Fonts name if available, else closest Google Font)
- Shape & style: <radius, borders vs shadows, illustration style, density, tone of visuals>
- Pictures to use: `<path>` — <what it shows> — <good for>

## Design rules (binding)
- <e.g. No red anywhere. No drop shadows. At most two background colours per screen.>

## Voice & real copy
- Tone: <…>
- Quotes (exact): "<…>", "<…>", …  (5–15)

## Do not claim
- <prices, user numbers, ratings, features not built, "available now" if not released, …>
```

**Quality bar:** a designer who has never seen the product could design an on-brand post from this
brief alone. If they couldn't, the brief isn't done.
