# MatchaStack

A learning project: building a React metaframework from scratch.

## Roadmap

| # | Pattern | Status |
|---|---------|--------|
| 1 | SSG | Done |
| 2 | Hydration | Done |
| 3 | getStaticProps | Done |
| 4 | SSR + Loaders | - |
| 5 | RSC | - |
| 6 | Server Functions | - |

## RSC Progress

- Milestone 1 complete: `/` renders through a Flight-backed document pipeline with a generated client reference manifest and a hydrated `'use client'` counter island.
- Remaining RSC work: expand the document pipeline beyond `/`, replace props-based client navigation with Flight, then add server references/actions.

## Usage

```bash
npm run build
```
