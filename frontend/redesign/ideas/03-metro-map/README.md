# Idea 03 · Metro Map

Landing-page demo for STAVE. Flat SVG metro map: each branch is a line, each commit is a station, a merge is an interchange. The map draws itself as you scroll and a small train rides along it. No WebGL.

## Run

Open `index.html` in a browser (no build step). Needs network for GSAP 3.12.5 (cdnjs, pinned) and Google Fonts. Data comes from `../../assets/shared.js` (`buildSong`, `COMMITS`, `drawRoll`, `staffGraph`, `staffThumb`). All text is English placeholder copy.

## The seven blocks (each 100vh, scroll-snapped)

| # | Block | Notes |
|---|---|---|
| 01 | Welcome | Hero and call to action |
| 02 | The name | Five lines S, T, A, V, E fan out of one trunk, then stations unfold into the terminus words. The full phrase is never written out visually; only a screen-reader sentence states it |
| 03 | History | Click a station (a commit) to see the diff against the previous one, with `staffGraph` and `drawRoll` |
| 04 | Why save versions | Filename chaos vs. one line, three benefits |
| 05 | How it works | Draft, commit, branch, merge |
| 06 | Toolbox | 128 GM instruments, drums, custom sounds, `.mid`/WAV/MP3 export |
| 07 | Call to action + footer | Footer is merged into this block |

## Motion

One personality: calm and deliberate. Entrances fade and drift up 28px with ease-out (power3.out, 0.7s); exits fade and drift up 14px with ease-in (power2.in, 0.28s). Blocks never slide or overlap. A single scrubbed tween (scrub only) drives the map and train; block reveals use `onToggle` only, so `scrub` and `toggleActions` are never mixed on a trigger. `ScrollTrigger.refresh()` runs after fonts load.

Known deviation: the line draw-on uses `stroke-dashoffset`, which is not transform/opacity. It is a paint-only change on 3 SVG paths with no layout; the strict alternative (masked reveal) was not worth the complexity here. No shader or three.js is used, so there is nothing to dispose.

## Accessibility and fallbacks

- Skip link, visible focus ring, every link/button has a name, section rail has `aria-current`.
- `prefers-reduced-motion`: no GSAP, no snap, everything shown in its final state (map fully drawn).
- Under 900px wide, or if GSAP fails to load: static layout, no map, no animation, stacked blocks with a simple rail.
- Diff colors unchanged: blue = added, pink-red dashed = removed, amber = velocity changed.

## Verification (Playwright, headless Chromium, not committed)

Checked: all seven blocks screenshotted at 1440x900 and 1280x720; no `pageerror`; no horizontal overflow at 800px; no block taller than the viewport at 1280x720; station click updates the diff; reduced-motion, compact and no-GSAP paths render with all content visible; frame times while scrolling the whole page over 6s.

Not checked: real-GPU smoothness (the headless run is software-rendered, so frame numbers only show there is no obvious main-thread jank), cross-browser behavior (Chromium only), contrast measured by tool (colors were chosen to meet 4.5:1 but not machine-audited), screen-reader output, and the live CDN (GSAP was served from the identical npm 3.12.5 build because the sandbox blocks the CDN). Google Fonts were also blocked, so screenshots use fallback fonts.
