# MatchaStack

A learning project: building a React metaframework from scratch.

## Roadmap

| # | Pattern | Status |
|---|---------|--------|
| 1 | SSG | Done |
| 2 | Hydration | Done |
| 3 | getStaticProps | Superseded |
| 4 | SSR + Loaders | Removed |
| 5 | RSC | In progress |
| 6 | Server Functions | - |

## RSC Progress

- Milestone 1 complete: `/` renders through a Flight-backed document pipeline with a generated client reference manifest and a hydrated `'use client'` counter island.
- Milestone 2 complete for the current routes: `/`, `/about`, and `/user-profile` all render as server components through the RSC document pipeline. Route data now lives inside server components instead of old loader APIs.
- Milestone 3 complete: same-origin client navigation fetches Flight payloads from `/__matcha_rsc`, applies the returned tree, and handles back/forward through the same RSC path.
- Remaining RSC work: add server references/actions and harden streaming, Suspense, and route diagnostics.

## Usage

```bash
npm run build
```
