/**
 * GitHub-style full-width row list (repo list / trending pattern) — each
 * item always fills the container's horizontal width regardless of how many
 * items exist, so a page with 1-2 real records never looks like an empty
 * canvas the way a card grid does. Preferred over CARD_GRID_CLASS for
 * project listings — see CLAUDE.md 4.7.
 */
export const CARD_LIST_CLASS = 'flex flex-col gap-3';

/**
 * Fluid card grid — columns auto-fill based on available width instead of a
 * fixed sm/lg breakpoint cap. Kept for non-project grids (e.g. stat tiles)
 * where a card-island layout still makes sense. See CLAUDE.md 4.7.
 */
export const CARD_GRID_CLASS = 'grid gap-4 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]';
