/**
 * Pipeline step factories — injectable dependencies, error classification.
 *
 * Each step wraps a dependency and classifies errors (FI-02, FI-06).
 * Production wiring happens in index.tsx. Tests inject mocks.
 */

import type { StepDef, StepResult } from './pipeline';
import type { NapConfig } from './url-config';
import { PROVIDERS, getTokenForProvider } from './url-config';
import type { LightningFsAdapter } from './fs-adapter';
import type { NapModel } from './model';
import type { Session } from './session';
import type { NapStoreApi } from './store';
import { DEFAULT_PLAYGROUND_YAML } from './playground';
import { globalTokens } from './chrome-storage';

// ── Injectable dependency types ──

export type CloneFn = (
  url: string,
  dir: string,
  lfs: any,
  auth?: { username: string; password: string },
) => Promise<void>;

export type FindRootFn = (
  adapter: LightningFsAdapter,
  hint?: string | null,
) => Promise<string | null>;

export type CreateSessionFn = (key: string, config: NapConfig) => Session;

export type FetchDiffFn = (
  owner: string,
  repo: string,
  prNum: number,
  pat?: string,
) => Promise<Record<string, Array<{ start: number; end: number }>> | null>;

// ── PipelineCtx shape (for typed step access) ──

export interface PipelineCtx {
  config: NapConfig;
  stateKey: string;
  session: Session | null;
  lfs: any;
  adapter: LightningFsAdapter | null;
  store: NapStoreApi | null;
  model: NapModel | null;
  nepicRoot: string | null;
  skipClone?: boolean;
}

// ── Step 1: Validate config ──

export function makeValidateStep(): StepDef {
  return {
    name: 'checking review link',
    run: async (ctx: PipelineCtx) => {
      if (!ctx.config) {
        return { ok: false, error: 'invalid review link', hint: 'ask the author for a review link with #nap-repo=...' };
      }
      if (!ctx.config.cloneUrl) {
        return { ok: false, error: 'invalid review link', hint: 'missing repository in the review link' };
      }
      return { ok: true };
    },
  };
}

// ── Step 2: Create session ──

export function makeSessionStep(createSessionFn: CreateSessionFn): StepDef {
  let session: Session | null = null;

  return {
    name: 'creating session',
    run: async (ctx: PipelineCtx) => {
      try {
        session = createSessionFn(ctx.stateKey, ctx.config);
        ctx.session = session;
        ctx.lfs = session.lfs;
        ctx.adapter = session.adapter;
        ctx.store = session.store;
        ctx.model = session.model;
        return { ok: true };
      } catch (e: any) {
        if (e.message?.includes('quota') || e.name === 'QuotaExceededError') {
          return { ok: false, error: 'storage full', hint: 'clear browser data or close other tabs' };
        }
        return { ok: false, error: 'session creation failed', hint: 'try reloading the panel' };
      }
    },
    cleanup: async () => {
      if (session) {
        session.model.destroy();
        session = null;
      }
    },
  };
}

// ── Step 3: Init filesystem ──

export function makeInitFsStep(): StepDef {
  return {
    name: 'setting up filesystem',
    run: async (ctx: PipelineCtx) => {
      try {
        const adapter = ctx.adapter!;
        try { await adapter.mkdir('/home', { recursive: true }); } catch { /* exists */ }
        try { await adapter.mkdir('/home/user', { recursive: true }); } catch { /* exists */ }

        // Seed playground.yaml if not present
        const playgroundExists = await adapter.exists('/home/user/playground.yaml');
        if (!playgroundExists) {
          await adapter.writeFile('/home/user/playground.yaml', DEFAULT_PLAYGROUND_YAML);
        }

        return { ok: true };
      } catch {
        return { ok: false, error: 'filesystem init failed', hint: 'try reloading the panel' };
      }
    },
  };
}

// ── Step 4: Check existing repos ──

export function makeCheckReposStep(findRootFn: FindRootFn): StepDef {
  return {
    name: 'checking for existing data',
    run: async (ctx: PipelineCtx) => {
      const root = await findRootFn(ctx.adapter!, ctx.config.nepicSlug);
      if (root) {
        ctx.nepicRoot = root;
        ctx.skipClone = true;
      }
      return { ok: true }; // Not finding repos is fine — we'll clone
    },
  };
}

// ── Step 5: Clone ──

export function makeCloneStep(cloneFn: CloneFn, config: NapConfig): StepDef {
  const hostname = PROVIDERS[config.provider]?.hostname ?? config.provider;
  const repoName = config.cloneUrl.split('/').pop()?.replace(/\.git$/, '') ?? 'repo';

  const shared = {
    adapter: null as LightningFsAdapter | null,
    stagingDir: null as string | null,
    finalDir: null as string | null,
  };

  return {
    name: `cloning ${hostname}/${repoName}`,
    skip: (ctx: PipelineCtx) => !!ctx.skipClone,
    run: async (ctx: PipelineCtx) => {
      shared.adapter = ctx.adapter!;
      shared.stagingDir = `/home/user/.tmp-${repoName}`;
      shared.finalDir = null;
      const finalDir = `/home/user/${repoName}`;

      try {
        // Clean up any leftover staging dir from a previous attempt
        try { await ctx.adapter!.rm(shared.stagingDir, { recursive: true, force: true }); } catch { /* ok */ }
        try { await ctx.adapter!.mkdir(shared.stagingDir, { recursive: true }); } catch { /* exists */ }

        // Read auth token from global ref (chrome.storage.sync, not per-session store)
        const auth = getTokenForProvider(config.provider, {
          githubToken: globalTokens.githubToken,
          gitlabToken: globalTokens.gitlabToken,
        });

        await cloneFn(config.cloneUrl, shared.stagingDir, ctx.lfs, auth);

        // Atomic rename: staging → final
        await ctx.adapter!.mv(shared.stagingDir, finalDir);
        shared.stagingDir = null;
        shared.finalDir = finalDir;

        return { ok: true };
      } catch (e: any) {
        // Capture raw error for debugging (FX-P20 Playwright test reads this)
        if (typeof window !== 'undefined') {
          (window as any).__napPipelineRawError__ = e;
        }
        console.log('[clone-step] raw error:', e.name, e.message, 'statusCode:', e.statusCode, 'code:', e.code, 'ownKeys:', Object.getOwnPropertyNames(e));

        // FI-06: error classification owned by step
        // statusCode takes precedence over message matching (FX-S22)
        if (e.statusCode === 401 || e.data?.statusCode === 401) {
          const label = PROVIDERS[config.provider]?.label ?? config.provider;
          return { ok: false, error: 'authentication failed', hint: `enter your ${label} token in settings` };
        }
        if (e.statusCode === 404 || e.data?.statusCode === 404) {
          return { ok: false, error: 'repository not found', hint: 'check the review link' };
        }
        if (e.statusCode === 403 || e.data?.statusCode === 403) {
          const label = PROVIDERS[config.provider]?.label ?? config.provider;
          return { ok: false, error: 'authentication failed', hint: `enter your ${label} token in settings` };
        }
        return { ok: false, error: `can't reach ${hostname}`, hint: 'check your network or VPN' };
      }
    },
    cleanup: async () => {
      if (shared.stagingDir && shared.adapter) {
        try { await shared.adapter.rm(shared.stagingDir, { recursive: true, force: true }); } catch { /* ok */ }
      }
      if (shared.finalDir && shared.adapter) {
        try { await shared.adapter.rm(shared.finalDir, { recursive: true, force: true }); } catch { /* ok */ }
      }
      shared.stagingDir = null;
      shared.finalDir = null;
    },
  };
}

// ── Step 6: Scan repo ──

export function makeScanRepoStep(findRootFn: FindRootFn, config: NapConfig): StepDef {
  const repoName = config.cloneUrl.split('/').pop()?.replace(/\.git$/, '') ?? 'repo';

  return {
    name: 'scanning repository',
    skip: (ctx: PipelineCtx) => !!ctx.nepicRoot,
    run: async (ctx: PipelineCtx) => {
      const root = await findRootFn(ctx.adapter!, ctx.config.nepicSlug);
      if (!root) {
        return { ok: false, error: 'no .nap structure found', hint: `cloned ${repoName} but no .nap structure` };
      }
      ctx.nepicRoot = root;
      return { ok: true };
    },
  };
}

// ── Step 7: Load navigation ──

export function makeLoadNavStep(): StepDef {
  return {
    name: 'loading navigation',
    run: async (ctx: PipelineCtx) => {
      try {
        await ctx.model!.setNepicRoot(ctx.nepicRoot!);

        // Focus napkin from URL (deferred until nav is populated)
        // Only set if no card is currently focused — on return visit, the
        // persisted focusedCardSlug takes priority over the URL hint.
        // expandCard is a toggle, so calling it when already focused would
        // collapse the card (bug on return visit).
        if (ctx.config.napkinFocus) {
          const s = ctx.store!.getState();
          if (!s.focusedCardSlug) {
            s.expandCard(ctx.config.napkinFocus);
          }
        }
        return { ok: true };
      } catch {
        return { ok: false, error: 'failed to load navigation', hint: 'try reloading the panel' };
      }
    },
  };
}

// ── Step 8: Fetch PR diff ──

export function makeFetchDiffStep(fetchDiffFn: FetchDiffFn): StepDef {
  return {
    name: 'loading PR changes',
    skip: (ctx: PipelineCtx) => ctx.config.prNum <= 0,
    run: async (ctx: PipelineCtx) => {
      try {
        const s = ctx.store!.getState();
        // Already cached from persist hydration (return visit)
        if (s.prDiffRanges !== null) return { ok: true };

        const { mainOwner, mainRepo, prNum } = ctx.config;
        const ranges = await fetchDiffFn(mainOwner, mainRepo, prNum, globalTokens.githubToken || undefined);
        if (ranges) {
          ctx.store!.getState().setPrDiffRanges(ranges);
        }
        return { ok: true };
      } catch {
        return { ok: false, error: "can't read PR files", hint: 'check your GitHub token' };
      }
    },
  };
}
