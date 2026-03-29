* 0010 — monorepo setup
  * move current code into packages/v2/, scaffold packages/v3/
  * both build, both test, side by side

* what exists today
  * single-package repo: src/, tests/, one electron.vite.config.ts, one package.json
  * working build: npm run dev, npm run build, npm run typecheck
  * working tests: npm run test:small (vitest), npm run test:medium (playwright)
  * native modules: better-sqlite3, node-pty — require electron-rebuild

* end state
  * packages/v2/
    * everything that's in repo root today: src/, tests/, configs
    * package name: "nap-v2"
    * bin: `nap2` → out/cli/cli/nap.js
    * `npm run dev:v2` launches the app — identical to today's `npm run dev`
    * `npm run test:v2:small` and `npm run test:v2:medium` pass — same tests, same results
    * `npm run typecheck:v2` passes
    * `npx nap2 open .` launches v2 Electron app
  * packages/v3/
    * empty Electron app: window opens, dark background, nothing else
    * package name: "nap"
    * bin: `nap` → out/cli/cli/nap.js
    * electron-vite config, tsconfig, vitest config, playwright config
    * src/main/main.ts — minimal: createWindow, quit handler
    * src/renderer/index.tsx — minimal: renders "v3" text
    * src/cli/nap.ts — copy from v2 as starting point
      * `nap open` must launch the v3 Electron app (resolve its own package's electron + main.js)
    * src/shared/ — copy ndjson.ts, constants.ts, protocol.ts from v2
    * one vitest smoke test (e.g. ndjson round-trip)
    * one playwright smoke test (app launches, window appears)
    * native module setup: node-pty ready (needed for 0100)
    * `npm run dev:v3`, `npm run test:v3:small`, `npm run test:v3:medium` all work
    * `npx nap open .` launches v3 Electron app
  * root
    * package.json with npm workspaces: ["packages/v2", "packages/v3"]
    * shared deps hoisted to root where possible
    * electron-rebuild works for both packages

* what NOT to do
  * don't modify any v2 source code — only move files
  * don't add features to v3 — just the scaffold
  * don't break v2 tests — they must pass exactly as before
  * don't share src/ between v2 and v3 — v3 gets copies, not imports
    * they diverge immediately; shared imports create coupling

* done criteria
  * from repo root: `npm run dev:v2` opens the current app
  * from repo root: `npm run dev:v3` opens an empty Electron window
  * from repo root: `npx nap2 open .` launches v2 app
  * from repo root: `npx nap open .` launches v3 app
  * from repo root: `npm run test:v2:small` — all existing vitest tests pass
  * from repo root: `npm run test:v3:small` — smoke test passes
  * from repo root: `npm run typecheck:v2` and `npm run typecheck:v3` pass
  * git status clean after all the above
