# STAVE redesign (design prototype)

A new design for STAVE, fully separate from the current frontend. UI only: all data is placeholder and nothing calls a backend.

## Run

Open `index.html` in a browser (no server needed). Network access is needed for the Google Fonts (Unbounded, Onest, Be Vietnam Pro).

| Page | Content |
|---|---|
| `index.html` | Landing page: sticky-and-reveal blocks (each block stays put while the next covers it), scroll-driven STAVE name, commit history, guide |
| `login.html` | Sign in / sign up |
| `projects.html` | My projects |
| `explore.html` | Explore (public) |
| `rankings.html` | Rankings (public) |
| `project.html` | Project overview, branch graph, history on a staff |
| `compare.html` | Compare two commits note by note |
| `merge.html` | Resolve conflicts bar by bar |
| `editor.html` | Editor: draw/erase notes, play, edit velocity, commit dialog |
| `settings.html` | Settings, theme choice |
| `help.html` | Glossary and shortcuts |

## Remove

1. Delete the `frontend/redesign/` folder.
2. Revert the two config lines (they exist because `react-lab/` has `.tsx` files that the frontend's `tsc` and ESLint would otherwise scan):
   - `frontend/tsconfig.json`: remove `"redesign",` from `exclude`.
   - `frontend/eslint.config.mjs`: remove `"redesign/**",` from `globalIgnores`.

Nothing else references this folder.

## Notes

- Design idea: a song's history is a musical staff (each commit is a note, each branch a staff, a merge is a tie).
- The system is modelled on Figma's marketing DESIGN.md (awesome-design-md): white and ink, pill buttons, light display type (Onest 340), pastel color blocks.
- Diff colors: blue = added, pink-red = removed, amber = velocity changed (also distinguishable for color-blind users). Color tokens live at the top of `assets/styles.css`.
- The STAVE wordmark uses Unbounded 800 as a type-only logo.
- `assets/shared.js` holds the sample data and the piano roll and branch graph drawing functions.
- Motion follows Emil Kowalski's animation rules: transform and opacity only, strong ease-out, under 300ms for UI. Landing blocks do not slide or overlap; four blocks pin in place and change their contents as you scroll.

## react-lab (optional)

React versions of the standard screens: **My projects, Explore, Rankings, Settings, Help**. Vite + React + Tailwind 4 + shadcn/ui + `motion`, using a tweakcn-format theme.

```bash
cd frontend/redesign/react-lab
npm ci && npm run dev
```

The editor and merge screens were not ported to React: they draw per-note SVG with their own keyboard and pointer handling and were verified as plain HTML.

## Landing palettes

`index.html?palette=c|b|a|g` switches the seven block colors (default `c`). Colors come from colorkit.co 7-color palettes; the script sorts them by luminance and assigns the lightest five to blocks 01, 02, 03, 05, 06 and the two darkest to blocks 04 and 07.
