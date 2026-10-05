# movie-nite

## Purpose
A web app for the FFF movie-night group to pick tonight's film: viewers nominate films found through TMDB, and a weighted, editable wheel picks what to watch through the night.
A static single-page app (React, TypeScript, Vite) hosted on GitHub Pages, with no backend.

## Commands
<!-- covers: package.json, .github/workflows/*.yml; verified: 2026-10-05 -->
- Run tests: `npm test`
- Lint: `npm run lint`
- Dev server: `npm run dev` (serves at http://localhost:5173/movie-nite/)
- Build: `npm run build`
- Full check (what CI runs): `npm ci && npm run lint && npm test && npm run build`

## Layout
<!-- covers: src/**, .github/workflows/*.yml -->
- `src/`: the React app: `src/main.tsx` builds the store on the `localStorage` persistence and mounts `src/App.tsx`; `src/assets/` holds the TMDB logo; `src/test/setup.ts` is the Vitest setup
- `src/state/`: the serializable app state (`src/state/model.ts` pure rules, `src/state/persistence.ts` the `Persistence` interface and its `localStorage` and in-memory versions, `src/state/store.ts` the Zustand store and React hook); only `src/state/persistence.ts` touches `localStorage`
- `src/tmdb/`: the TMDB client (injectable `fetch`, `TmdbAuthError` on 401)
- `src/wheel/`: the pure wheel rules, no React or storage: `src/wheel/layout.ts` (default layout and slice arcs), `src/wheel/draw.ts` (weighted draw and rest rotation), `src/wheel/reveal.ts` (finish window, runtime and synopsis text), `src/wheel/wedges.ts` (slices resolved to names, colours and nominations), plus `src/wheel/reducedMotion.ts` (the one browser check, `prefers-reduced-motion`, guarded for jsdom)
- `src/components/`: token prompt, night setup, nomination search, the wheel (`src/components/Wheel.tsx`), the spin (`src/components/WheelPanel.tsx`) and the reveal (`src/components/Reveal.tsx`)
- `.github/workflows/`: `.github/workflows/ci.yml` runs lint, test and build on pull requests and pushes to `main`, and deploys to GitHub Pages on pushes to `main`

## Conventions
- Branches are `<type>/<issue>-<slug>`; every change goes through a PR that says `Closes #<issue>`; merges are squash-only.

## Gotchas
- Vite's `base` is `/movie-nite/`, so local URLs and the live site are under that path (http://localhost:5173/movie-nite/, not the root).
- Node 22 is pinned in `.nvmrc`; CI uses it, so a newer local Node can hide a CI failure.
- Deploys happen only after a merge to `main` (the `github-pages` environment accepts only the default branch), so a live-site check can't be done before merge; check PRs locally with `npm run build` and `npm run preview`, and write live-site checks in plans as post-merge follow-ups.
