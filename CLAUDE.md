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
npm run sim -- --bots usor,mediu,greu,greu --rounds 5 --seed abc -v   # headless bots-only match, prints rounds + standings
npm run balance -w shared -- --matches 40 --lineup usor,usor,mediu,mediu,greu,greu   # bot tournament stats per level
```

Single test file / test name:

```bash
npm test -w shared -- test/rng.test.ts
npm test -w shared -- -t "<test name substring>"
npm run test:watch -w shared
```

Server room tests boot a real server on port 2569 (not 2568, which is the dev/prod port, and not Bombe's ports).

Normal visits go intro → name → menu → lobby → game → back to the lobby. Test URL options (all but `?touch` skip the menus and start a local match at once): `?debug` (hitboxes, heading/velocity vectors, hit credit, each bot's intent/target/input, tick/FPS, own speed/boost/slide/seq), `?bots=1..5` (default 3), `?rounds=3|5|7`, `?seed=abc`, `?botlevel=usor|mediu|greu`, `?touch` / `?touch=0` (force the phone layout and touch controls, otherwise `(hover: none) and (pointer: coarse)`, see `client/src/device.ts`), `?tune` (driving-feel sliders, see below). In-game: `P` (or the touch "Pauză" button) pauses (local only), `Esc` (or "Ieși") opens the leave confirmation, `F` toggles fullscreen; after the match `Enter` (or a tap on the final panel) starts a new match in test mode, otherwise the host goes back to the lobby. `?room=CODE` (invite link) is joined from the menu after the name.

## Architecture

### `/shared` — deterministic simulation (no Phaser, no DOM)
- Consumed as raw TypeScript (`exports` → `src/index.ts`); no build step.
- **Determinism is a hard rule**: no `Date.now()`, no `Math.random()`. Randomness goes through the seeded mulberry32 RNG whose state lives in the game state (`rng.ts`). Same seed + same inputs ⇒ byte-identical state.
- **Fixed-point**: every position, velocity, angle and timer in the state is an integer. `FP` sub-units per pixel; angles are integer steps with integer sin/cos tables (no `Math.sin`/`Math.cos`/`Math.sqrt` in the sim; use the integer helpers). Divisions are truncated explicitly. **Never use bitwise operators on fixed-point values** (`|0`, `>>`, `<<`, `~~` truncate to 32 bits); use `Math.trunc`/`Math.floor`. Bitwise is fine only for RNG/hash state that is a uint32 by design.
- Fixed tick: 30/s (`TICK_RATE`). The same `runTick`/`step()` runs in `LocalTransport`, in client-side prediction and on the server.
- State is flat (players as `Record<id, PlayerState>`, plain arrays) so it maps onto `@colyseus/schema`. A new state field must be added to the schema, the mirror and the client's state rebuild.
- Input per tick: `{ seq, steer, throttle, boost }` (`steer`/`throttle` integers in -100..100, boost latched until the next tick).
- `tuning.ts`: the driving-feel numbers physics reads at run time (`TUNING`, defaults `DEFAULT_TUNING` from `constants.ts`). **Only the local `?tune` panel may change `TUNING`** (client and server must step with identical numbers); a test asserts the defaults. `applyGameTuning` runs at every game start (GameScene): back to `DEFAULT_TUNING`, then the saved values only for a local game with `?tune` (`test/tuning.test.ts`). To adopt tuned values, change the constants in `constants.ts` and re-run the balance test.
- Modules: `fixed.ts` (angle steps `ANGLE_STEPS` = 1024, literal quarter-wave sine table scaled by `TRIG_ONE`, `isin`/`icos`/`iatan2`/`isqrt`/`idiv` (never returns -0, so states survive JSON unchanged), `hash32`/`percent` for bot rolls); `constants.ts` (all tuning: speeds, grip, boost, mass, ring, timings, scoring); `physics.ts` (`driveCar`: steer/throttle/boost/friction/grip, lower grip for `slideTicks` after being hit; `collide`: disc–disc impulse with mass (boosting = heavier) and restitution, positional separation, knockout credit via `lastHitBy`/`lastHitTick`; `isOutside`); `sim.ts` (`applyInput`, `step`, countdown, ring shrink `ringRadiusAt`, eliminations and scoring, round end: one left = win +3, none left = draw, 90 s = timeout); `match.ts` (lobby/round/match lifecycle as in Bombe: `createGameState`, `addPlayer`, `addBot`, `startMatch`, `startRound` (seeded rotation of the spawn circle), `leavePlayer`, `backToLobby`, standings); `bot.ts`; `runner.ts` (`runTick` = inputs + bot decisions + `step`, `skipBotRound`); `protocol.ts` (wire contract, `INPUT_QUEUE_MAX`).
- Players are always iterated with `sortedPlayers` (slot order) and collision pairs in that order: never depend on object key order.
- **Bots** (`BOT_PARAMS` per level: decision interval, aggression, edge margin + lookahead, boost range/alignment, escape boost, mistakes, aim noise). `botThink` is pure (rolls are hashes of `state.rng`, round, decision index, slot; it never advances the RNG), `botAct` returns an input only on decision ticks and the held input carries the bot in between. Retune against `test/balance.test.ts` and `npm run balance`.
- `test/sourceRules.test.ts` greps the source for banned APIs (`Date.now`, `Math.random`, float trig, `**`) and for bitwise operators outside `rng.ts`/`fixed.ts`/`roomCode.ts`. Tests build races with `makeRace` in `test/helpers.ts` (cars placed exactly, first fighting tick next).

### Netcode (stage 4)
- Server is authoritative and sends patches at 30/s (every state carries its `tick`, and each player's last processed input `seq`).
- Per-player server input queue is bounded (~4); overflow drops the oldest (or consumes 2 per tick) so lag never accumulates; a missing input repeats the last one.
- Client predicts its own car (applies inputs at once, keeps them buffered), and on every server state rewinds to it, drops inputs with `seq ≤ lastSeq` and replays the rest with the same `step()`; residual error is smoothed visually. Other cars are interpolated ~100 ms in the past. `?lag=120&jitter=30` simulates latency.

### `/client` — rendering only
- Scenes read state and send messages only through `GameTransport` (`client/src/net/GameTransport.ts`): `setInput(DriveInput)` every frame (the transport samples it once per simulation tick, numbers it with `seq` and latches boost presses), `send(RoomMessage)` for lobby actions, `onEvents`, `tickProgress()` (0..1 toward the next tick, for interpolation). `LocalTransport` runs `runTick` with a fixed-step accumulator at 30/s (max 250 ms catch-up). `ColyseusTransport` comes in stage 4.
- Input (`client/src/input`): `InputSource.poll({ heading })` returns a `DriveInput` or null when unused; `CombinedInput` lets the first active source drive and any source boost. `KeyboardInput`: arrows/WASD (left/right steer, up gas, down brake/reverse), Space boost. `TouchInput` (HTML over the canvas, pointer events per finger): analog joystick (steers toward the joystick's direction relative to the car's heading, throttle proportional to the push, slow while turning around) and a boost button whose fill shows the cooldown; left-handed mode swaps them (`settings.ts`).
- Layout (`render/layout.ts`): 1 simulation pixel = 1 canvas pixel, arena centered at `ARENA_CX/CY`; desktop has the HUD panel on the right, touch has a `SIDE_W` thumb zone on each side (scores on the joystick side, round info on the boost side). Phones play sideways (`ui/orientation.ts`).
- Rendering: textures are drawn at startup with the 2D canvas API (`render/textures.ts`: diamond-plate floor, rubber rim, cars, glow/spark); `render/Arena.ts` (floor, chasing rim bulbs, darkened lost floor + red edge while the ring shrinks), `render/CarView.ts` (car, shadow, flickering antenna spark, name tag, local boost ring, fall-off animation), `render/Hud.ts`, `render/fx.ts` (particle bursts with a global cap; "Efecte reduse" = fewer particles, steady bulbs, no camera shake). `GameScene` interpolates poses (and the ring) between the last two ticks with `tickProgress()`.
- `debug/TunePanel.ts` (`?tune`, local games only): sliders applied live via `setTuning`, saved in localStorage (`masinute.tune`), "Copiază valorile" copies them as `constants.ts` lines; on wide screens the canvas makes room for it (`body.tuning`).
- `localStorage` goes through `client/src/storage.ts` (keys prefixed `masinute.`, failures ignored).
- Scenes (ported from Bombe și Petarde): `IntroScene` → `NameScene` (saved nickname, "Salut, X!") → `MenuScene` (Creează joc / Intră la un prieten with `ui/CodeInput.ts` 6 boxes / Joacă offline cu boți; online shows "Disponibil în curând" until stage 4, see `net/rooms.ts` `onlineEnabled`) → `LobbyScene` (code + Web Share/copy link when online, 6 rows, host tag, rounds, default bot level, ±Bot, per-bot level tag, Start) → `GameScene` (back to the lobby when the state returns to `lobby`). Menu/lobby screens are HTML (`ui/dom.ts` `mountScreen`, canvas switches to ENVELOP behind them and back to FIT in the game) over `ui/backdrop.ts` (night fair: Ferris wheel, tents, chasing garlands; steady with "Efecte reduse"). Styles: `style.css` (page, touch controls, tune panel, rotate prompt) + `screens.css` (screens, dialogs, toasts, chrome).
- UI layers: `ui/dialog.ts` (modal), `ui/Toasts.ts` + `ui/presence.ts` (joined/left/host toasts per transport), `ui/ConnectionBanner.ts`, `ui/settingsDialog.ts` (Efecte reduse, Mod stângaci, Vibrații; desktop menu has a corner effects toggle), `ui/chrome.ts` (fullscreen icon, `body.chrome-left` when left-handed in game), `ui/fullscreen.ts` (first tap in lobby/game goes fullscreen on phones), `ui/installHint.ts` (iPhone: add to home screen), `device-apis.ts` (wake lock in lobby/game), `ui/TextButton.ts` (canvas buttons in the game HUD).
- Phaser key captures are game-wide: `GameScene` calls `keyboard.clearCaptures()` on shutdown, otherwise WASD/Space could not be typed in the menus.

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
1. `/shared`: physics, ring, scoring, rounds, bots + tests (determinism, collisions) — done.
2. Rendering + LocalTransport + keyboard/touch controls — done.
3. Menus and lobby (from Bombe și Petarde) — done.
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
