## 0010 — monorepo setup: spec

Constraints the implementer can't derive from the napkin alone.

### File moves (v2)

Move everything from repo root into `packages/v2/`. This includes:
- `src/`, `tests/`, `out/` (if present)
- `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.cli.json`, `tests/tsconfig.json`
- `vitest.config.ts` (if exists), `playwright.config.ts`
- `.env` files (if any)

Files that stay at root:
- `.git/`, `.gitignore`
- `.nap/` (project metadata, not app code)
- `node_modules/` (will be managed by workspaces)
- New root `package.json`

### Package names and bins

- `packages/v2/package.json`: name `"nap-v2"`, bin `{ "nap2": "out/cli/cli/nap.js" }`
- `packages/v3/package.json`: name `"nap"`, bin `{ "nap": "out/cli/cli/nap.js" }`

### CLI electron resolution (critical)

Current `nap open` hardcodes the electron path:
```js
const napAppPath = process.env['NAP_APP_PATH'] || path.join(os.homedir(), 'nap-app');
const electronBin = path.join(napAppPath, 'node_modules', '.bin', 'electron');
const mainScript = path.join(napAppPath, 'out', 'main', 'main.js');
```

For both v2 and v3, `nap open` must resolve electron and main.js **relative to its own package directory**, not from `~/nap-app/`. The CLI is at `out/cli/cli/nap.js`. Walk up from `__dirname` to find the package root, then resolve:
- `<package-root>/node_modules/.bin/electron`
- `<package-root>/out/main/main.js`

Keep `NAP_APP_PATH` env override working as a fallback.

### Root package.json

```json
{
  "private": true,
  "workspaces": ["packages/v2", "packages/v3"],
  "scripts": {
    "dev:v2": "npm run dev -w packages/v2",
    "dev:v3": "npm run dev -w packages/v3",
    "build:v2": "npm run build -w packages/v2",
    "build:v3": "npm run build -w packages/v3",
    "test:v2:small": "npm run test:small -w packages/v2",
    "test:v2:medium": "npm run test:medium -w packages/v2",
    "test:v3:small": "npm run test:small -w packages/v3",
    "test:v3:medium": "npm run test:medium -w packages/v3",
    "typecheck:v2": "npm run typecheck -w packages/v2",
    "typecheck:v3": "npm run typecheck -w packages/v3"
  }
}
```

### Dependency strategy

- `electron`, `electron-vite`, `@electron/rebuild` — each package's own devDependencies (electron-vite resolves configs relative to package root)
- `typescript`, `vitest`, `@playwright/test` — can hoist to root or keep per-package (engineer's call, whichever works)
- `react`, `zustand`, `xterm`, `node-pty`, `better-sqlite3` — per-package dependencies (they'll diverge)
- `postinstall` in each package: `electron-rebuild` (rebuilds native modules against that package's electron version)

### v3 scaffold

Minimal files to create in `packages/v3/`:

**src/main/main.ts** — just enough to open a window:
```
createWindow, dark background, quit on window-all-closed
```

**src/main/preload.ts** — empty contextBridge (or minimal with pty stubs)

**src/renderer/index.html** — standard electron-vite HTML entry

**src/renderer/index.tsx** — renders a div with "v3"

**src/shared/** — copy these files verbatim from v2:
- `ndjson.ts`
- `constants.ts`
- `protocol.ts`

**src/cli/nap.ts** — copy from v2, apply the electron resolution fix above

**electron.vite.config.ts** — same structure as v2 but without the copyTemplatesPlugin (no templates yet)

**tests/smoke.test.ts** — one vitest test (e.g. ndjson serialize/parse round-trip)

**tests/e2e/smoke.spec.ts** — one playwright test (app launches, window exists, quit)

### Config files for v3

Each needs to be created fresh (not symlinked):
- `tsconfig.json` — same compilerOptions as v2
- `tsconfig.cli.json` — same as v2
- `vitest.config.ts` — same as v2 (or minimal)
- `playwright.config.ts` — same structure as v2
- `package.json` — deps subset: electron, electron-vite, react, node-pty, xterm, vitest, playwright

### What not to do

- Don't modify any v2 source code beyond the package.json rename and CLI fix
- Don't create shared packages or import across v2/v3
- Don't set up path aliases or build tooling beyond what's needed to make configs resolve
- If electron-rebuild is finicky with workspaces, it's acceptable to run it from within each package dir
