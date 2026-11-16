# Motion (video formats)

The renderer **pauses every CSS animation and `<video>` and steps them frame by frame** (30 fps), so
motion is exact and smooth no matter how fast the machine is. You write a timeline in CSS; the script
films it.

## The timeline contract

- The whole video is `duration` seconds from `formats` (pass `--duration` to change it, max 60).
- **CSS `@keyframes` only**, each element with explicit `animation-duration` and `animation-delay`
  in seconds, `animation-fill-mode: both`, `animation-iteration-count: 1` (no `infinite`).
- Animate **`opacity` and `transform`** (translate, scale, rotate). Avoid animating layout properties.
- Ease out on entrances (`cubic-bezier(.2,.8,.2,1)`), ease in on exits. 0.3–0.7s per move.
- **Never an empty frame.** Something readable is always on screen.

## Structure that holds attention

| Time | Beat |
|---|---|
| 0–1.5s | **Hook** — readable by 0.5s. A question, a bold claim the product proves, or the product doing something surprising. |
| 1.5s–(end−3s) | **2–4 beats**, one idea each, ~2.5–4s per beat. Show the product working: screens changing, a tap, a result. |
| last 3s | **End card** — product name, icon, one line (call to action or "coming soon"). |

Keep text on screen at least 2s per line. Change something every 1–2s (a new card, a zoom, a highlight)
so the eye never rests too long.

## Showing the product move

- **Recreated UI:** build the screen in HTML and animate parts of it — a card sliding in, a progress
  ring filling, a button press (scale .96 then back), a toast appearing.
- **Real recordings:** place `<video src="assets/clip.mp4" muted playsinline data-start="2">` inside a
  device frame. `data-start` = the second on the timeline when it starts playing. The renderer seeks it
  frame-accurately. Trim long recordings first with ffmpeg
  (`ffmpeg -ss 3 -t 6 -i in.mov -an -vf scale=-2:1920 assets/clip.mp4`).
- **Camera moves:** slow scale on the device frame (1.0 → 1.06 over a beat) adds life cheaply.

## Review frames before exporting

```
<toolkit> check  <post.html> --format <id>
<toolkit> frames <post.html> --format <id> --out-dir <dir> --at 0.5,2,5,8,12,14.8
```

Look at the frames (`sheet` them into one image). Check the hook frame, each beat, and the end card.
Then export:

```
<toolkit> video <post.html> --format <id> --out <post.mp4>
```

Add `--audio <file>` only if the user gives you music they have the rights to. Without it the video is
silent — which is how most people watch anyway.
