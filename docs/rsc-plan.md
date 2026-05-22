# Real RSC Implementation Plan

This document outlines how to add real React Server Components (RSC) to MatchaStack using the React Flight protocol, server references, and a proper server/client module split.

It is intentionally not a "temporary simplification" plan. The goal is to build the actual architecture needed for React-compatible RSC rather than a props-over-JSON approximation.

## Goals

- Use the React Flight protocol for server component payloads.
- Support a true server/client module split.
- Generate and consume the manifests needed by React for client references.
- Add server references and server actions later, on top of a working RSC document and navigation pipeline.
- Preserve the existing custom Vite + Express architecture where possible.
- Evolve the current SSR pipeline into an RSC + HTML shell pipeline instead of layering a fake RSC model on top of `__INITIAL_PROPS__`.

## Current Implementation

The current architecture now has the RSC document pipeline in place for every route in the toy app:

- [src/entry-rsc-server.tsx](/Users/kbiel/code/personal/MatchaStack/src/entry-rsc-server.tsx) owns the RSC route table and renders route trees to Flight payloads.
- [src/entry-rsc-document.tsx](/Users/kbiel/code/personal/MatchaStack/src/entry-rsc-document.tsx) renders the HTML shell from the same Flight payload used by the browser.
- [src/entry-client.tsx](/Users/kbiel/code/personal/MatchaStack/src/entry-client.tsx) decodes the embedded Flight stream and hydrates the resulting React tree.
- [lib/plugin.ts](/Users/kbiel/code/personal/MatchaStack/lib/plugin.ts) builds the client graph, RSC server graph, SSR-safe client chunks, and client reference manifests.
- [lib/commands/dev.ts](/Users/kbiel/code/personal/MatchaStack/lib/commands/dev.ts) and [lib/commands/serve.ts](/Users/kbiel/code/personal/MatchaStack/lib/commands/serve.ts) route document requests through the same RSC model in development and production.

What is missing is the core RSC contract:

- no Flight endpoint for client-side navigation yet
- no server reference manifest or action transport for later phases

## Architectural Target

The end state should look like this:

1. The app tree is split into:
   - server components
   - client components marked with `'use client'`
   - server functions marked with `'use server'`
2. The build produces:
   - a server bundle capable of evaluating RSC modules
   - a client bundle containing only browser code
   - a client reference manifest for React Flight
   - later, a server reference manifest for actions / server functions
3. The server responds to:
   - document requests with an HTML shell plus an RSC stream
   - client navigations with an RSC payload
   - later, action submissions with the standard server reference invocation flow
4. The browser:
   - hydrates the shell
   - consumes the Flight stream
   - resolves client references using the manifest
   - re-renders on navigation using fresh RSC payloads

## Core Design Decisions

### 1. Use directive-based boundaries

Match React conventions directly:

- `'use client'` at the file level marks a client component module.
- `'use server'` marks server function exports.

Do not introduce custom file suffixes as the primary boundary mechanism. Supporting `.client.tsx` and `.server.tsx` as optional conveniences is fine, but the protocol-facing system should treat directives as the source of truth.

### 2. Split SSR shell rendering from RSC rendering

Originally, `renderToString(<App ... />)` in the deleted `src/entry-server.tsx` performed the entire render.

With RSC, there are two related but distinct server tasks:

- render the server component tree to a Flight payload
- render the HTML shell that bootstraps the client app and consumes that payload

Those should become separate entry points with separate responsibilities.

### 3. Route modules are server-first

The old route model was props-centric:

- route component
- `getStaticProps`
- `getServerSideProps`

For real RSC, the primary abstraction is now route modules that render server components directly and fetch data inline on the server side. The loader compatibility layer was intentionally removed instead of preserved.

### 4. Manifests are first-class build artifacts

This is the central build problem.

We need to generate, persist, and load:

- client reference manifest: maps client module exports to browser chunks and React client reference metadata
- later, server reference manifest: maps callable server exports to invocation metadata used by actions / server functions

The server runtime should never guess about module IDs. It should always resolve through the manifests.

## Vertical Milestones

The milestones below are intentionally vertical. Each one should leave the repo in a usable, demonstrable state before the next one begins.

## Milestone 1: Single-Route RSC Document Render

Status: Complete.

### End state

One route can render through real Flight on a full document request, with a real client reference manifest and at least one `'use client'` island working end to end.

### What changes

1. Split the original server runtime into:
   - request context creation
   - RSC tree rendering
   - HTML shell rendering
2. Extend [lib/plugin.ts](/Users/kbiel/code/personal/MatchaStack/lib/plugin.ts) to:
   - detect `'use client'`
   - classify modules into server vs client graphs
   - emit a client reference manifest
3. Replace the `window.__INITIAL_PROPS__` bootstrap for that route with:
   - an HTML shell
   - an initial Flight payload
   - client-side Flight consumption in [src/entry-client.tsx](/Users/kbiel/code/personal/MatchaStack/src/entry-client.tsx)
4. Keep the rest of the app on the old SSR path while the first route proves the architecture.

### Why this is vertical

It exercises the real RSC protocol on a real page load without forcing the whole router, all routes, or server actions to land at once.

### Exit criteria

- one route renders via React Flight on initial document load
- one `'use client'` component resolves through the generated manifest
- no `__INITIAL_PROPS__` is required for that route
- dev and production builds can both render that route

## Milestone 2: Full-Document RSC for All Routes

Status: Complete for the current routes. The old loader path was removed rather than kept as a migration layer.

### End state

All document requests render through the new RSC document pipeline.

### What changes

1. Generalize the Milestone 1 runtime so every route can render as:
   - server-first route module
   - HTML shell plus Flight payload
2. Replace the old props route table with RSC route entries in [src/entry-rsc-server.tsx](/Users/kbiel/code/personal/MatchaStack/src/entry-rsc-server.tsx).
3. Move `/about` and `/user-profile` data reads into server components.
4. Expand module boundary checks so invalid server/client imports fail loudly across the app.

### Why this is vertical

After this step, a browser refresh on any route uses the real RSC render path, so the framework is already useful even before client navigation is migrated.

### Exit criteria

- all full document requests use Flight-backed rendering
- all routes can include `'use client'` islands
- the old props bootstrap path is no longer needed for initial document loads
- `_props.json`, `__matcha_props`, `__INITIAL_PROPS__`, and the old route loader files are gone from the runtime

## Milestone 3: RSC Client Navigation

### End state

Client-side navigation fetches Flight payloads instead of route props, so the app works as a genuine RSC app during both initial load and in-app navigation.

### What changes

1. Add an RSC navigation request path instead of the removed props navigation model.
2. Add a Flight endpoint for subrequests in:
   - [lib/commands/dev.ts](/Users/kbiel/code/personal/MatchaStack/lib/commands/dev.ts)
   - [lib/commands/serve.ts](/Users/kbiel/code/personal/MatchaStack/lib/commands/serve.ts)
3. Teach the client runtime to:
   - request the next route as Flight
   - apply the returned tree
   - preserve history and back/forward behavior
4. Keep route state in the Flight tree rather than rebuilding the old loader contract.

### Why this is vertical

This is the milestone where the app becomes workable as an RSC app in day-to-day usage, not just on refresh.

### Exit criteria

- client navigation uses Flight payloads
- back/forward works against the RSC router path
- navigation requests fetch and apply Flight payloads

## Milestone 4: Layouts and Route Model Hardening

### End state

The route model is hardened around server components, and shared layouts can participate naturally in the RSC tree.

### What changes

1. Introduce a clearer route module authoring surface for server components.
2. Introduce layout boundaries if the framework wants nested layouts.
3. Add focused diagnostics and tests around invalid server/client imports.
4. Simplify the public mental model around:
   - server components by default
   - client components via `'use client'`
   - no props JSON bootstrap path

### Why this is vertical

This is a product-quality milestone rather than just an internal refactor: the public framework surface becomes coherent and teachable.

### Exit criteria

- new routes can be authored as server-first modules
- no loader APIs are needed for the current route model
- layouts compose through the RSC tree

## Milestone 5: Server References and Actions

### End state

`'use server'` exports can be referenced from the client and invoked through the proper React server reference transport.

### What changes

1. Extend [lib/plugin.ts](/Users/kbiel/code/personal/MatchaStack/lib/plugin.ts) to discover `'use server'` exports and emit a server reference manifest.
2. Add runtime lookup and invocation support for server references.
3. Add action endpoints in:
   - [lib/commands/dev.ts](/Users/kbiel/code/personal/MatchaStack/lib/commands/dev.ts)
   - [lib/commands/serve.ts](/Users/kbiel/code/personal/MatchaStack/lib/commands/serve.ts)
4. Return action results in the format React expects, including updated Flight payloads when needed.

### Why this is vertical

Actions become an additive capability on top of a working RSC app instead of a prerequisite for getting the main rendering model live.

### Exit criteria

- server reference manifest is generated and loaded correctly
- `'use server'` functions can be invoked from client components
- action requests can trigger the expected RSC updates

## Milestone 6: Hardening, Dev UX, and Production Cleanup

### End state

The RSC architecture is stable in dev and production, with tests covering the protocol boundaries and without legacy props infrastructure hanging around.

### What changes

1. Harden [lib/commands/dev.ts](/Users/kbiel/code/personal/MatchaStack/lib/commands/dev.ts) for:
   - HMR across server and client graphs
   - manifest invalidation
   - useful boundary diagnostics
2. Finalize [lib/commands/serve.ts](/Users/kbiel/code/personal/MatchaStack/lib/commands/serve.ts) around explicit manifest loading and RSC request handling.
3. Keep the removed props infrastructure from reappearing by testing the document and navigation contracts.
4. Add tests for:
   - module classification
   - client reference manifest generation
   - document render
   - Flight navigation
   - server reference invocation once actions exist

### Why this is vertical

This turns the implementation from "feature-complete in principle" into something maintainable enough to iterate on.

### Exit criteria

- dev mode and production mode follow the same RSC architecture
- protocol regressions are covered by tests
- legacy props transport is gone

## Concrete Repo Changes

These are the main files and modules likely to change first.

### Runtime

- [src/entry-rsc-server.tsx](/Users/kbiel/code/personal/MatchaStack/src/entry-rsc-server.tsx)
- [src/entry-rsc-document.tsx](/Users/kbiel/code/personal/MatchaStack/src/entry-rsc-document.tsx)
- [src/entry-client.tsx](/Users/kbiel/code/personal/MatchaStack/src/entry-client.tsx)

### Build / Framework internals

- [lib/plugin.ts](/Users/kbiel/code/personal/MatchaStack/lib/plugin.ts)
- [lib/commands/dev.ts](/Users/kbiel/code/personal/MatchaStack/lib/commands/dev.ts)
- [lib/commands/serve.ts](/Users/kbiel/code/personal/MatchaStack/lib/commands/serve.ts)

### New modules likely needed

- `lib/rsc/module-classifier.ts`
- `lib/rsc/client-manifest.ts`
- `lib/rsc/server-manifest.ts`
- `lib/rsc/request-context.ts`
- `lib/rsc/render-flight.ts`
- `lib/rsc/render-document.ts`
- `lib/rsc/server-references.ts`
- `lib/rsc/action-handler.ts`

The exact filenames can change, but these concerns should stay separated.

## Recommended Build Order Within Each Milestone

Inside each milestone, keep the work in this order:

1. establish the runtime contract for that slice
2. teach the build pipeline and manifests what the runtime needs
3. wire dev and production request handling
4. migrate one route or flow first
5. expand to the rest of the surface covered by that milestone

This keeps each milestone demonstrable early, instead of spending several phases building internal plumbing before anything user-visible works.

## Risks and Hard Parts

### Build graph correctness

The hardest technical problem is not rendering itself. It is producing correct module graphs and manifests while preserving a good dev experience.

### React runtime contract

Flight and server references are unforgiving about identifiers, manifests, and module resolution. The runtime must treat React's contract as the source of truth.

### Router rewrite

The current router is designed around fetching route props. A real RSC router path is materially different and should be treated as a first-class rewrite, not an incremental tweak.

### Action semantics

Once `'use server'` exists, request context, serialization, redirects, and error handling all become part of the public framework contract. That is why actions are intentionally moved later in this plan, after document render and navigation are already stable.

## Non-Goals

These items should not block the first end-to-end RSC implementation:

- advanced caching and revalidation
- partial prerendering
- sophisticated nested layout persistence optimizations
- custom data cache semantics beyond what React requires for correctness

Those are valuable follow-on features, but they should sit on top of a correct RSC core.

## Definition of Done

RSC should be considered implemented when all of the following are true:

- route trees can render real server components
- client components are referenced through the client manifest
- initial document requests render an HTML shell plus Flight payload
- client navigations fetch and apply Flight responses
- production and dev modes both use the same conceptual RSC architecture
- the legacy route-props bootstrap path is no longer required

If server actions are in scope for the release, also require:

- `'use server'` exports are callable through server references

## Immediate Next Step

- implement and visualize Flight-backed navigation
- explore reloads, Suspense behavior, streaming, and server action transport
