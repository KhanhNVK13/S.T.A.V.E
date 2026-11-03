# Idea 04 · Synesthesia

Landing-page demo for STAVE. A liquid WebGL background changes colour with the pointer and the scroll position; every MIDI pitch maps to a hue. Static page, no build step, all placeholder data.

## Run

Open `index.html` in a browser. It needs network access for GSAP 3.12.5 (cdnjs, pinned) and Google Fonts; it also loads `../../assets/shared.js` for the sample song, commits and the piano-roll / branch-graph drawing functions.

Query flags for testing: `?lite=1` forces the CSS-gradient background, `?nogl=1` simulates no WebGL2.

## The seven blocks (100vh each, CSS scroll-snap, one scroll per block)

1. Introduction · 2. The name (letters explain themselves) · 3. History (commit list + diff piano roll) · 4. Why save versions · 5. Draft, commit, branch, merge · 6. Tools (128 GM instruments, drums, own sounds, export) · 7. Call to action with the footer merged in.

## Pitch to colour table

Decoration and background only. Add / remove / velocity labels in the diff keep their semantic colours (blue = added, dashed pink-red = removed, amber = velocity changed) and only appear on white cards.

| Pitch class | Hue | Octave 4 colour |
|---|---|---|
| C | 0° | `#e31c1c` |
| C♯ | 30° | `#e37f1c` |
| D | 60° | `#e3e31c` |
| D♯ | 90° | `#80e31c` |
| E | 120° | `#1ce31c` |
| F | 150° | `#1ce380` |
| F♯ | 180° | `#1ce3e3` |
| G | 210° | `#1c7fe3` |
| G♯ | 240° | `#1c1ce3` |
| A | 270° | `#7f1ce3` |
| A♯ | 300° | `#e31ce3` |
| B | 330° | `#e31c80` |

| Octave | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|
| Lightness | 38% | 44% | 50% | 56% | 62% |

Hue = pitch class × 30°, saturation 78 %. The shader gets four colours per block (bass + three chord notes of Am, F, C, G, C, ... from the sample song). The pointer is a pitch too: x picks the pitch class, y the octave, and the fluid near the cursor takes that colour. The scroll position moves the flow field and scroll speed stirs it.

## Technical notes

- **Shader**: fragment shader in **GLSL ES 3.00** (`#version 300 es`), raw WebGL2 with one full-screen triangle. three.js is not used, so there is no tone-mapping / colour-space step to configure: the shader writes display-referred sRGB and caps its own luminance (relative luminance <= 0.13 before a dark scrim) so white text stays above 4.5:1. Rendered at 0.5 × CSS resolution (the image is a blur anyway) and upscaled.
- **Sound preview**: button in the header, **off by default**. Nothing is created until the user presses it (Web Audio: a looping Am-F-C-G pad). While on, the notes recolour the background and the analyser RMS level brightens and speeds up the fluid. Pressing it again stops and closes the AudioContext.
- **Lite path**: under 900px, with `?lite=1`, without WebGL2, or after a lost context, the canvas is not used. Seven stacked CSS gradients (one per block, same chord colours) are cross-faded with opacity.
- **Motion personality: liquid.** Slow viscous ease-out entrances (`power3.out` / `expo.out`, about 1 s, 90 ms stagger), faster ease-in exits (reverse at 2.4x). Only transform / opacity and shader uniforms are animated. Blocks never overlap or slide. No trigger uses both `scrub` and `toggleActions` (none uses scrub). `ScrollTrigger.refresh()` runs after fonts load.
- **Accessibility**: `prefers-reduced-motion` shows the final state directly (no entrance, autoplay or pointer response; the shader renders one still frame). Skip link, visible focus rings, every button/link has a name, `aria-pressed` on toggles, polite live region for the sound state.
- **Cleanup**: `pagehide` stops audio, deletes the GL program and releases the context.

## Verified (Playwright + Chromium, SwiftShader software GL, GSAP served from a local npm copy of 3.12.5 because the sandbox blocks cdnjs)

- No `pageerror` / console errors at 1440×900, 1280×720, 390×844, no-WebGL and reduced-motion runs.
- Screenshots of all 7 blocks at 1440×900 and 1280×720; no block content overflows its 100vh at either size.
- Background-only luminance (content hidden): max relative luminance 0.05, i.e. white text >= 10:1 (secondary text #f0f0f6 >= 9:1).
- Interactions: pointer lights a pitch key, sound toggle starts/stops (analyser level > 0), commit list, range, step buttons and GM family buttons update, skip link is the first Tab stop, no unnamed controls.
- Reduced motion: 0 elements left at opacity < 1.

## Not verified

- **Real GPU frame rate.** Software GL averaged ~62 ms/frame on the full-page scroll at 1440×900 (not representative); the CSS-gradient path measured p95 16.8 ms. 60 fps on a real GPU is expected (4 octaves × 3 fbm at 0.5 scale) but unmeasured.
- **Audio you can hear** and how smooth the motion feels. Only the analyser level was read.
- Real Google Fonts rendering (blocked in the sandbox; system fallback fonts were used), real iOS/Android devices, Safari / Firefox.
- Diff-card text in the branch graph (from `staffGraph`) is small (~9–12 px effective) at 1440 wide.
