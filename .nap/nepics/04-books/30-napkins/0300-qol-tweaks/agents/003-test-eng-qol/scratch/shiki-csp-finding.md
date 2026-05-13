# Shiki CSP finding — test-eng investigation

## The symptom

Code blocks in rendered mode render flat grey (fallback `<pre class="nap-code-block">`). Shiki never produces `<pre class="shiki">` with inline color styles. No visible error — the catch in `initShiki()` swallowed it silently.

## Root cause

Electron's Content Security Policy in `index.html`:

```
script-src 'self' 'unsafe-inline'
```

Shiki loads Oniguruma — a regex engine compiled to WebAssembly. `WebAssembly.instantiate()` requires `'wasm-unsafe-eval'` in `script-src`. Without it, the browser refuses to compile the WASM module:

```
CompileError: WebAssembly.instantiate(): Refused to compile or instantiate
WebAssembly module because 'unsafe-eval' is not an allowed source of script
in the following Content Security Policy directive: "script-src 'self' 'unsafe-inline'"
```

The error path:
```
import('shiki')
  → createHighlighter()
    → createOnigurumaEngine()
      → getWasmInstance()
        → WebAssembly.instantiate()  ← CSP blocks here
```

The `catch {}` in `initShiki()` absorbed the CompileError. `shikiReady` stayed `false`. Every `renderMarkdown()` call hit the fallback path. The fallback styling (bg from CSS variable, no syntax colors) looked close enough to "working" that it wasn't immediately obvious.

## The fix

One token in `index.html`:

```diff
-script-src 'self' 'unsafe-inline'
+script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'
```

`'wasm-unsafe-eval'` is the narrow permission — allows WASM compilation but not `eval()` or `new Function()`. It's the standard approach for libraries that ship WASM (shiki, tree-sitter, oniguruma, etc.) in Electron apps.

Also added `console.warn` to the catch so future init failures are visible in DevTools.

## Why tests didn't catch it earlier

The fs-eng's small tests (vitest) run in Node.js where there's no CSP — `import('shiki')` works fine, `WebAssembly.instantiate()` succeeds, all assertions pass. The bug only manifests in the Electron renderer where CSP is enforced by Chromium.

This is exactly the gap medium tests fill: the integration between the library, the bundler output, and the runtime environment.

## Security note

`'wasm-unsafe-eval'` does NOT weaken the CSP in any meaningful way for this app:
- It only permits WebAssembly compilation, not JavaScript eval
- The renderer already has `contextIsolation: true` and `nodeIntegration: false`
- All code is local (no remote script loading)
- The WASM module (Oniguruma) is bundled in the app, not fetched at runtime

## Test coverage added

Small (vitest, 10 tests):
- `rendered-mode.test.ts`: SHIKI-01 through SHIKI-06 — init, known lang, unknown lang, no lang, source lines, theme switch
- `theme-system.test.ts`: SHIKI-07 — every theme has `shikiTheme` field

Medium (Playwright, 3 tests):
- `shiki-highlight.spec.ts`: end-to-end in Electron — shiki init + highlight, fallback, theme color change

The medium tests are what would have caught this bug. They verify `<pre class="shiki">` appears in the actual rendered DOM inside Electron.
