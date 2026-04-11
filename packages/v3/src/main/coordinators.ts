import type { NapModel } from './model';
import type { PtySpawner } from './pty-spawner';
import { computeResumeActions } from './resume';

/** Threshold for fast-exit detection (same as v2 main.ts:191) */
const RESUME_FAIL_THRESHOLD_MS = 5000;

// Track resume spawn times so exit handlers can detect failed resumes
const resumeSpawnTimes = new Map<string, number>();

/**
 * STOP→RUN: compute resume decisions, spawn ptys, update model.
 */
export async function startAgents(model: NapModel, ptySpawner: PtySpawner): Promise<void> {
  // Skip agents belonging to archived napkins — they should not get PTYs
  const archivedNapkinIds = new Set(
    model.getNapkins().filter(n => n.status === 'archived').map(n => n.id),
  );
  const agents = model.getAllAgents().filter(a => !a.napkinId || !archivedNapkinIds.has(a.napkinId));
  const decisions = computeResumeActions(agents);

  for (const decision of decisions) {
    if (decision.action === 'skip') continue;
    // Skip agents whose ptys are already running (e.g., after nepic switch)
    if (ptySpawner.isRunning(decision.agentId)) continue;

    // Track resume spawn time for fast-exit detection
    if (decision.action === 'resume') {
      resumeSpawnTimes.set(decision.agentId, Date.now());
    }

    ptySpawner.spawn({
      id: decision.agentId,
      command: decision.command!,
      cwd: '',
    });

    // Register exit handler — fires when pty dies on its own (NOT on quit)
    ptySpawner.onExit(decision.agentId, async () => {
      const spawnTime = resumeSpawnTimes.get(decision.agentId);
      resumeSpawnTimes.delete(decision.agentId);

      // Resume failure detection: fast exit + was --resume + "No conversation found"
      if (
        decision.action === 'resume' &&
        spawnTime &&
        (Date.now() - spawnTime) < RESUME_FAIL_THRESHOLD_MS
      ) {
        // Check output buffer for the dead session message
        const output = (ptySpawner as any).getOutputBuffer?.(decision.agentId) ?? '';
        if (output.includes('No conversation found')) {
          await model.setAgentArchived(decision.agentId);
          return;
        }
      }

      return model.setAgentExitedById(decision.agentId);
    });

    model.setAgentRunning(decision.agentId, true);

    // Case C: write started=true to marker
    if (decision.action === 'fresh') {
      await model.setAgentStarted(decision.agentId);
    }
  }
}

/** Exposed for testing */
export { RESUME_FAIL_THRESHOLD_MS };

/**
 * RUN→STOP: save UI state, disconnect exit handlers, kill ptys.
 * No exited flags written — this is app quit, not agent death.
 */
export async function stopApp(
  model: NapModel,
  ptySpawner: PtySpawner,
  uiState?: { activeNepicId: string; activeTerminalId: string; sidebarVisible: boolean },
): Promise<void> {
  if (uiState) {
    await model.saveUiState(uiState);
  }

  // Clear exit handlers BEFORE killing — v3's answer to v2's appIsClosing flag
  ptySpawner.clearExitHandlers();
  ptySpawner.killAll();

  // Update model — all agents no longer running
  for (const agent of model.getAllAgents()) {
    if (agent.running) {
      model.setAgentRunning(agent.id, false);
    }
  }
}
