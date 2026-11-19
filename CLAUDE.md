# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Mașinuțe de Bâlci" — browser multiplayer top-down bumper-car arena, Romanian night-fair theme. npm workspaces monorepo: `shared/` (pure deterministic simulation), `client/` (Phaser 3 + Vite), `server/` (authoritative Colyseus 0.18). README and user-facing strings are in Romanian; code comments are in English. Requires Node ≥ 22.12. Architecture and UX patterns come from the sister project "Bombe și Petarde" (`E:\learn\petarde-bombe`): read it for reference, never modify it.

## Commands

Run from the repo root:

```bash
npm install
npm run dev          # client (http://localhost:5174) + server (:2568) together; dev:client / dev:server for one
npm test             # vitest for /shared, then the server room tests
npm run typecheck    # tsc for shared + client + server
npm run build        # client/dist (static) + server/dist/index.js (single esbuild bundle)
```

Single test file / test name:

```bash
npm test -w shared -- test/rng.test.ts
npm test -w shared -- -t "<test name substring>"
npm run test:watch -w shared
```

Server room tests boot a real server on port 2569 (not 2568, which is the dev/prod port, and not Bombe's ports).

## Architecture

### `/shared` — deterministic simulation (no Phaser, no DOM)
- Consumed as raw TypeScript (`exports` → `src/index.ts`); no build step.
- **Determinism is a hard rule**: no `Date.now()`, no `Math.random()`. Randomness goes through the seeded mulberry32 RNG whose state lives in the game state (`rng.ts`). Same seed + same inputs ⇒ byte-identical state.
- **Fixed-point**: every position, velocity, angle and timer in the state is an integer. `FP` sub-units per pixel; angles are integer steps with integer sin/cos tables (no `Math.sin`/`Math.cos`/`Math.sqrt` in the sim; use the integer helpers). Divisions are truncated explicitly. **Never use bitwise operators on fixed-point values** (`|0`, `>>`, `<<`, `~~` truncate to 32 bits); use `Math.trunc`/`Math.floor`. Bitwise is fine only for RNG/hash state that is a uint32 by design.
- Fixed tick: 30/s (`TICK_RATE`). The same `runTick`/`step()` runs in `LocalTransport`, in client-side prediction and on the server.
- State is flat (players as `Record<id, PlayerState>`, plain arrays) so it maps onto `@colyseus/schema`. A new state field must be added to the schema, the mirror and the client's state rebuild.
- Input per tick: `{ seq, steer, throttle, boost }` (`steer`/`throttle` integers in -100..100, boost latched until the next tick).

### Netcode (stage 4)
- Server is authoritative and sends patches at 30/s (every state carries its `tick`, and each player's last processed input `seq`).
- Per-player server input queue is bounded (~4); overflow drops the oldest (or consumes 2 per tick) so lag never accumulates; a missing input repeats the last one.
- Client predicts its own car (applies inputs at once, keeps them buffered), and on every server state rewinds to it, drops inputs with `seq ≤ lastSeq` and replays the rest with the same `step()`; residual error is smoothed visually. Other cars are interpolated ~100 ms in the past. `?lag=120&jitter=30` simulates latency.

### `/client` — rendering only
Scenes read state and send messages only through `GameTransport` (`LocalTransport` offline with bots, `ColyseusTransport` online). Textures are drawn from code; no assets from other games.

### `/server` — authoritative Colyseus 0.18 room
`@colyseus/core` + `ws-transport` + `schema` 5. Production: `node dist/index.js` (esbuild bundle, no `node_modules`), loopback `127.0.0.1:2568`.

### `/deploy` — Oracle VPS (Ubuntu, 1 GB RAM, SSH alias `oracle`), https://masinute-balci.duckdns.org
- Caddy on 443 proxies `/colyseus/*` to `127.0.0.1:2568`; systemd unit `masinute` with `MemoryMax=250M`; releases under `/opt/masinute/releases` with atomic `current` symlink, rollback, health check; `ssh -n` + `BatchMode`. No Docker, Redis or native deps.
- The VPS also runs the train game (`cabina-api`, `tren-api.duckdns.org`) and Bombe și Petarde (`bombe`, port 2567, `bombe-petarde.duckdns.org`): never touch them. **Never run anything on the VPS unless the user explicitly says so**; only prepare and dry-run (`push.ps1 -WhatIf`).

## Game rules
- Round arena with an edge; a car whose center leaves the ring is out for the round. After 45 s of fighting (countdown excluded) the ring shrinks down to a minimum radius of ~2 car diameters. Round time limit 90 s: then nobody gets +3.
- "3, 2, 1, START!" countdown every round (cars frozen).
- Boost with ~3 s cooldown.
- Scoring: last car on the ring +3; knocking someone out +1 to whoever last hit them within 3 s; leaving the ring on your own −1. If the last cars are eliminated on the same tick nobody gets +3 (+1/−1 still apply). Match of 3/5/7 rounds.
- Bots Ușor/Mediu/Greu: one code path, parameters in `BOT_PARAMS` (reaction, aggression, mistakes); a deterministic balance test checks Greu > Mediu > Ușor.

## Plan
0. Repo + monorepo + CLAUDE.md — done.
1. `/shared`: physics, ring, scoring, rounds, bots + tests (determinism, collisions).
2. Rendering + LocalTransport + keyboard/touch controls.
3. Menus and lobby (from Bombe și Petarde).
4. Colyseus server + ColyseusTransport with prediction/reconciliation; simulated lag test (100–150 ms), incl. convergence after a collision.
5. Deploy scripts (do not run on the VPS until told).
6. Podium, atmosphere, tuning.

Stop after each stage so the user can test.

## Git
- Commit only with the identity from git config. **No `Co-Authored-By` or any Claude attribution** in commits or PRs. Never change git config.
- Commit + push to `main` at the end of each stage. Never force push.
- `.gitattributes` normalizes text to LF (binaries excluded).

## TypeScript
Strict config in `tsconfig.base.json` with `noUnusedLocals`/`noUnusedParameters`, `verbatimModuleSyntax` (use `import type` for type-only imports) and `isolatedModules`.
