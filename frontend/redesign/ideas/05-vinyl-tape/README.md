# Idea 05 · Vinyl and Tape (landing demo)

Static landing page for STAVE. Metaphor: turntable, vinyl and cassette tape. Open `index.html` directly (no build step, no backend).

- **Stack:** plain HTML/CSS/JS, SVG graphics (three.js was not needed). GSAP 3.12.5 + ScrollTrigger from cdnjs (pinned). `../../assets/shared.js` supplies the sample commits, song and `drawRoll`/`thumb`/`rng`.
- **Journey (7 blocks, 100vh each, CSS scroll-snap):** 01 intro · 02 the name (STAVE label splits into five discs that open into words) · 03 history (commits as sleeves in a crate, diff piano roll) · 04 why save versions · 05 how it works (draft → commit → branch → merge on tape) · 06 tools · 07 CTA on a record sleeve with the footer merged into it.
- **Motion personality:** "weighted analog". Platters spin up, the tonearm drops and walks inward as you scroll, cassette reels follow scroll velocity (and rewind when scrolling up). Entrances ease out, exits ease in; only `transform`/`opacity` move; no block overlaps or slides. Scrub (rail arm/progress) and callback-driven entrances are on separate triggers.
- **Diff colours unchanged:** blue = added, dashed pink = removed, amber = velocity changed.
- **Accessibility:** skip link, visible focus, named controls, `prefers-reduced-motion` shows the finished state immediately.
- **Lite path:** under 900px (or reduced motion, or GSAP failing to load) the page is static, single column, no snap. There is no WebGL dependency.

## Verified (Playwright, headless Chromium, GSAP served from a local copy because the sandbox blocks the CDN)
- Screenshots of all 7 blocks at 1440x900 and 1280x720; no content overflow vertically in any block.
- Zero `pageerror` on desktop, reduced-motion, GSAP-blocked and 390px runs.
- Reduced motion and GSAP-blocked: nothing left at opacity 0. 390px: no horizontal overflow.
- Frame timing while scrolling through all blocks: ~16.7 ms average (60fps cap), p95 16.8 ms at both sizes; one 100 ms outlier at 1280x720.

## Not verified
- Real GPU smoothness (headless software rendering only), actual fonts (Google Fonts were blocked, so fallback fonts were shown), real CDN loading, Safari/Firefox, touch devices, screen-reader output, and a formal contrast audit (colours were chosen to be above 4.5:1 by calculation, not measured by a tool). There is no audio in this demo.
