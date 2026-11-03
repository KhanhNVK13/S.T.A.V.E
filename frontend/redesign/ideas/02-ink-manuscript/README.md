# Idea 02 · Ink Manuscript (landing demo)

Static landing-page demo for the STAVE redesign. Ivory paper (SVG `feTurbulence` grain), hand-ruled staves, ink strokes that are drawn as you scroll, handwriting type, and a soft ink-bleed on hover. Mostly SVG + CSS; GSAP only drives scroll wiring. All text is English placeholder; no backend.

## Run

Open `index.html` in a browser (no build). Needs network for Google Fonts (Caveat, EB Garamond, IBM Plex Mono) and the pinned CDN scripts (GSAP 3.12.5 + ScrollTrigger). Sample data comes from `../../assets/shared.js` (`COMMITS`, `buildSong`, `drawRoll`).

Files: `index.html`, `ink.css`, `ink.js`.

## Journey (7 blocks, 100vh each, no pinning, no overlap)

01 intro · 02 the name (STAVE is written in one pen, then each letter opens into Source / Tracking / And / Version Control / Environment) · 03 history as a staff · 04 why keep every version (diff roll, blue = added, pink-red dashed = removed, amber = velocity) · 05 four pages: draft, commit, branch, merge · 06 tools (128 GM voices, drums, own sounds, .mid/WAV/MP3) · 07 call to action with the footer merged in.

## Motion personality: "ink settles on paper"

- Strokes (staves, notes, ties, page drawings) are drawn with `stroke-dashoffset`, **scrubbed** by one ScrollTrigger per block while it arrives (`top 88%` to `top 22%`).
- Text and pages rise in with opacity + translateY, ease-out, via a **separate** `toggleActions` trigger per block (reverse on leave-back reads as ease-in). Scrub and toggleActions never share a trigger.
- Block 01 draws itself on load (nothing to scrub yet). Block 02's letter-to-word step is a timed tween started by its own trigger after the scrubbed writing.
- Only transform/opacity are animated, apart from the required stroke-dashoffset. Paper grain is two static fixed layers (no blend modes). `ScrollTrigger.refresh()` runs after `document.fonts.ready` and on `load`. No three.js, so nothing to dispose.

## Modes

| Mode | When | Behaviour |
|---|---|---|
| `anim` | >= 900px, motion allowed | scrubbed ink + risers, scroll-snap `proximity` |
| `lite` | < 900px | final drawings shown, CSS fade-in only, blocks flow (`min-height: 100svh`) |
| `reduced` | `prefers-reduced-motion` or GSAP failed to load | final state immediately, no transitions |

No WebGL is used, so there is no WebGL fallback to need.

## Accessibility

Skip link, visible focus ring, named links, section index with `aria-current`, decorative SVG `aria-hidden`, informative SVG with labels. Text on paper: ink `#1d1a16` ~14:1, secondary `#4a4136` ~8:1, sepia `#7a4a2a` ~5.6:1 (computed, not tool-audited).

## Verification (Playwright + Chromium headless, installed outside the repo)

Checked: no `pageerror` at 1440x900 and 1280x720 (and 390px lite, reduced-motion); screenshot of every block at both sizes; no block content overflows its 100vh at either size; no horizontal scroll; frame-time probe while scrolling the whole page (420 rAF frames, ~16.7 ms avg, 0 frames over 17 ms).

Not checked / caveats: the sandbox blocks the CDNs and Google Fonts, so GSAP was served from a local copy of the same pinned version and screenshots use fallback fonts (real fonts change line breaks slightly). Headless software rendering pins rAF to 60Hz, so the frame probe says the page is not main-thread heavy, **not** that it is smooth on a real GPU. Hover ink-bleed, scroll-snap feel, contrast with real fonts and screen-reader output were not tested by hand. Sound is not involved in this demo.
