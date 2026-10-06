# movie-nite

## Purpose
A web app for the FFF movie-night group to pick tonight's film: viewers nominate films found through TMDB, and a weighted, editable wheel picks what to watch through the night.
A static single-page app (React, TypeScript, Vite) hosted on GitHub Pages, with no backend.

## Commands
<!-- covers: package.json, .github/workflows/*.yml; verified: 2026-10-05 -->
- Run tests: `npm test`
- Lint: `npm run lint`
- Dev server: `npm run dev` (serves at http://localhost:5173/movie-nite/)
- Dev server on the network, for a phone: `npm run dev:lan` (see Gotchas)
- Build: `npm run build`
- Full check (what CI runs): `npm ci && npm run lint && npm test && npm run build`

## Layout
<!-- covers: src/**, public/**, .github/workflows/*.yml; verified: 2026-10-05 -->
- `src/`: the React app: `src/main.tsx` builds the store on the `localStorage` persistence and mounts `src/App.tsx`; `src/assets/` holds the TMDB logo and the Movie Nite logo set (`src/assets/logo/`: the six final SVGs, including the simplified square M-and-reel icon in light and dark, plus `src/assets/logo/old-iterations/`, the earlier designs kept for reference), which `src/assets/logo.test.ts` checks; `src/test/setup.ts` is the Vitest setup
- `public/`: files Vite serves as-is under the base path; `public/favicon.svg` is the site favicon, a copy of `src/assets/logo/logo-icon-light.svg` that `src/assets/logo.test.ts` keeps identical
- `src/state/`: the serializable app state (`src/state/model.ts` pure rules, including the night rules (who is on the wheel, recording a Watch or Too long, ending and restarting a night, and the wheel-editing actions that save the edited layout on `night.layout`), `src/state/persistence.ts` the `Persistence` interface and its `localStorage` and in-memory versions, `src/state/store.ts` the Zustand store and React hook, `src/state/id.ts` new ids that also work on plain-HTTP origins); only `src/state/persistence.ts` touches `localStorage`
- `src/tmdb/`: the TMDB client (injectable `fetch`, `TmdbAuthError` on 401)
- `src/wheel/`: the pure wheel rules, no React or storage: `src/wheel/layout.ts` (default layout and slice arcs), `src/wheel/draw.ts` (weighted draw and rest rotation), `src/wheel/reveal.ts` (finish window, runtime and synopsis text), `src/wheel/edit.ts` (the editable `WheelLayout`: even spread, weights, slice counts, wildcards, moving slices, viewers leaving and joining), `src/wheel/wedges.ts` (slices resolved to names, colours and nominations), plus `src/wheel/reducedMotion.ts` (the one browser check, `prefers-reduced-motion`, guarded for jsdom)
- `src/components/`: token prompt, night setup, nomination search and the reusable film search it is built on (`src/components/FilmSearch.tsx`), the Night over summary and Watch next session section (`src/components/NightOver.tsx`), the wheel editor (`src/components/WheelEditor.tsx`, with dnd-kit drag to reorder), the wheel (`src/components/Wheel.tsx`), the spin (`src/components/WheelPanel.tsx`) and the reveal (`src/components/Reveal.tsx`)
- `.github/workflows/`: `.github/workflows/ci.yml` runs lint, test and build on pull requests and pushes to `main`, and deploys to GitHub Pages on pushes to `main`

## Conventions
- Branches are `<type>/<issue>-<slug>`; every change goes through a PR that says `Closes #<issue>`; merges are squash-only.

## Gotchas
- Vite's `base` is `/movie-nite/`, so local URLs and the live site are under that path (http://localhost:5173/movie-nite/, not the root).
- Node 22 is pinned in `.nvmrc`; CI uses it, so a newer local Node can hide a CI failure.
- Deploys happen only after a merge to `main` (the `github-pages` environment accepts only the default branch), so a live-site check can't be done before merge; check PRs locally with `npm run build` and `npm run preview`, and write live-site checks in plans as post-merge follow-ups.
- On Windows, stop any running `npm run dev` before `npm ci`: the dev server locks a native file, so `npm ci` fails and leaves `node_modules` half-removed. If PowerShell blocks the npm script, run npm.cmd instead.
- Vite adds `base` to files in `public/` itself, so link them from `index.html` with a root path (`/favicon.svg`); `%BASE_URL%favicon.svg` doubles the prefix to `/movie-nite/movie-nite/favicon.svg`.
- To test from a phone, run `npm run dev:lan` and open the Network URL it prints (it ends in `/movie-nite/`); the phone must be on the same Wi-Fi, and Windows Firewall may need to allow Node. Over plain HTTP, browsers hide secure-origin-only APIs such as `crypto.randomUUID`, so use `src/state/id.ts` for ids and avoid such APIs.
