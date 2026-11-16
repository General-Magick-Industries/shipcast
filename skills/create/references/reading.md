# Reading a product

**Goal: know the product better than a new hire after a week.** What it is, who it's for, every feature a
user can touch, what each screen looks like, the exact words it uses, its design system, and its stage.

## Start with the inventory

```
<toolkit> inventory <source>
```

`kind` tells you what you're working with:

| kind | Meaning | Do |
|---|---|---|
| `codebase` | An app or website's source | Follow **Code** below |
| `notes` | Docs, markdown, text — little or no code | Follow **Notes** below |
| `assets` | Mostly pictures | Ask the user what the product is; use the pictures as the visual base |
| `empty` | Nothing usable | Ask for a description, a link to the repo, or notes |

## Code

Read in this order and **take notes as you go** (features with the file that proves them, screen
descriptions, exact copy lines, colours, fonts, rules, stage facts):

1. **`readFirst`** — README, CLAUDE.md/AGENTS.md (they often state product rules and design rules
   outright), manifests (`package.json`, `pubspec.yaml`, `app.json`, `Info.plist`) for the real name,
   description, version and platforms.
2. **`designTokenFiles`** and the top `colors` / `fonts` — confirm which colour is primary, accent,
   background, text. Note **design rules** written in comments ("no red", "no shadows", "max two
   backgrounds"); they are binding.
3. **`copyFiles`** — the product's real words. Collect 10–20 lines worth quoting: headlines,
   onboarding, empty states, encouragements, button labels.
4. **Features** — for each folder in `features`, read the screen/page file and its main components
   until you can say in one sentence what the user does there and what it looks like.
5. **Docs/specs** (`docs`) — product specs, handoffs and design notes are gold: they state intent,
   audience and planned features. Only market what the code or docs say is real; treat roadmap items
   as "coming".
6. **Pictures** — pick candidates from `images` by path and size (mascots, heroes, empty states, app
   icon, screenshots). **Open the promising ones with Read** to see them before choosing.

Use Grep to answer specific questions ("where is the onboarding copy?", "what does the paywall say?")
instead of reading every file. Typical apps need 30–120 files read. Stop when you can fill the brief.

### Where things live, by stack

| Stack | Design tokens | Copy | Screens |
|---|---|---|---|
| **Flutter** | `lib/**/theme/*`, `tokens.dart`, `colors.dart`, `ThemeData(`; fonts in `pubspec.yaml`, `GoogleFonts.` | `*.arb`, `lib/**/copy.dart`, `assets/**/*.json` | `lib/features/*/presentation/`, `lib/**/screens/`, `*_screen.dart`, `*_page.dart` |
| **SwiftUI / UIKit** | `Assets.xcassets/*.colorset/Contents.json`, `Color+*.swift`, `Theme.swift`; fonts in `Info.plist` `UIAppFonts` | `Localizable.strings`, `*.xcstrings` | `*View.swift`, `*Screen.swift`, `*ViewController.swift` |
| **Android (Kotlin/Compose/XML)** | `res/values/colors.xml`, `ui/theme/Color.kt`, `Theme.kt`, `Type.kt` | `res/values/strings.xml` | `*Screen.kt` (Compose), `*Activity.kt`, `*Fragment.kt`, `res/layout/*.xml` |
| **React Native / Expo** | `tailwind.config.js` (NativeWind), `theme.ts`, `colors.ts`, `app.json` | inline JSX text, `i18n/`, `locales/*.json` | `app/` (Expo Router), `src/screens/`, `src/components/` |
| **Web (React/Next/Vue/Svelte)** | `tailwind.config.*`, CSS variables in `globals.css`/`:root`, `theme.*` | inline text, `messages/`, `locales/` | `app/**/page.tsx`, `pages/`, `src/routes/`, `components/` |
| **Backend-only / API / CLI** | none — use the docs site, logo, or propose a brand | README, docs, CLI help text | the API's endpoints, CLI commands, dashboards — show them as clean code/terminal cards |

**Translating code into a picture:** Flutter `Container(decoration: BoxDecoration(color:, borderRadius:))`,
Compose `Modifier.background().clip(RoundedCornerShape())`, SwiftUI `.background().cornerRadius()`,
and Tailwind `bg-… rounded-…` all mean the same card. Note layout (stack/row/grid), spacing, radius,
colours and the text on it — that's everything you need to rebuild the screen in HTML.

## Notes (no code)

Read every doc, note and description given. Extract: the product idea, who it's for, the problem, the
promised features, any names, tone, visuals described, and the stage (usually "coming soon"). Market
it as a concept or upcoming product — **never** as something people can use today unless the notes
say so. If there is no brand, propose one (see SKILL.md step 3) and confirm it.

## Description only (in chat)

Treat the user's words as the source. Ask 2–3 sharp questions only if the essentials are missing
(what it does, who it's for, its name). Propose a brand if needed.

## Before you write the brief, check yourself

- Can you name the product the way its own UI does? (If the code uses several names, pick the one in
  the UI and note the others.)
- Can you describe 3+ screens precisely enough to rebuild them?
- Do you have 5+ real lines of copy to quote?
- Do you know the stage (released / beta / TestFlight / coming soon) and platforms?
- Do you know the design rules?

If any answer is no, read more or ask.
