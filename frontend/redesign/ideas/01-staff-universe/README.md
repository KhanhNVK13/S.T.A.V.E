# Idea 01 · Staff Universe

Static landing-page demo. Dark space background; each commit is a star, each branch a constellation joined by thin staff lines. A camera flies between seven "galaxies" as you scroll. No backend, no build step: open `index.html` in a browser.

## Journey (7 blocks, 100vh each, one wheel step = one block)

1. Intro · 2. The name (five stars drift apart along a staff, open into S T A V E, then unfold into the full words) · 3. History (real star graph from `STAVE.COMMITS`; pick a commit and the roll shows its diff) · 4. Why keep every version · 5. How it works (draft, commit, branch, merge) · 6. Toolbox (128 GM instruments, drums, own sounds, .mid/WAV/MP3) · 7. "Create your first project" with the footer merged into the same block.

Diff colours are unchanged: blue = note added, dashed pink-red = note removed, amber = velocity changed.

## Files

- `index.html`, `css/universe.css`
- `js/universe3d.js` three.js scene: point-sprite dust, soft additive sprites standing in for bloom, Catmull-Rom camera path, `dispose()` on teardown
- `js/sky2d.js` Canvas 2D fallback (parallax stars + flat constellations)
- `js/main.js` ScrollTrigger wiring, entrances/exits, commit graph, wheel-step handler
- Reuses `../../assets/shared.js` (`COMMITS`, `buildSong`, `drawRoll`, `rng`)

CDN (pinned): GSAP 3.12.5 + ScrollTrigger (cdnjs), three@0.160.0 `build/three.min.js` (jsDelivr). three r150+ logs a deprecation warning for this classic build; it still ships in 0.160.0. Moving to an ES module import map would remove the warning.

## Motion rules ("Glide")

Slow, weighty drift. Entrances ease-out (`power2.out`, ~0.8s rise), exits ease-in (`power2.in`, ~0.3s), only `transform`/`opacity` (and shader uniforms) animated. Blocks never overlap or slide. One ScrollTrigger drives the camera (callback only); separate callback-only triggers drive entrances, so `scrub` and `toggleActions` are never mixed. `ScrollTrigger.refresh()` runs after `document.fonts.ready` and on `load`. If GSAP fails to load the page shows all content statically.

## Fallbacks and switches

- `prefers-reduced-motion`: no entrances, no flight; final state shown, sky jumps to the current block (static frame).
- Under 900px wide, no WebGL, or WebGL context loss: Canvas 2D sky, snapping off on narrow/short screens.
- Query switches for testing: `?mode=2d`, `?mode=3d`, `?q=low` (fewer particles), `?motion=off`.

## Verification (Playwright + Chromium, headless, software rendering)

Done: screenshots of all 7 blocks at 1440x900 and 1280x720 (WebGL path), plus 1440x900 for forced 2D, no-WebGL, reduced-motion and an 800px-wide viewport; zero `pageerror` in all runs; wheel stepping lands on 900/1800/…/5400 px; contrast sampled from screenshots with text hidden (86 text items, all >= 4.5:1 except three export chips, which are a measuring artefact from their own border; chip text is #dceeb1 on a dark panel, about 12:1).

Not verified: sound (the demo has none), real-GPU smoothness, real mouse/trackpad feel, real screen readers, Safari/Firefox. Frame timing here is software-rendered and noisy: WebGL path about 25 fps average (median 33 ms), Canvas 2D path 16.7 ms median but with multi-hundred-ms hitches in the later blocks that were reduced, not eliminated, by `will-change` and fewer animated nodes. This says nothing reliable about the 60 fps target on a GPU; measure on real hardware.

All text and data are English placeholders. Branch stars and the merge star in block 3 are decorative; only the six `COMMITS` are selectable.
