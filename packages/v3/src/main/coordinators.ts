import type { NapModel } from './model';
import type { PtySpawner } from './pty-spawner';
import { computeResumeActions } from './resume';

/**
 * STOP→RUN: compute resume decisions, spawn ptys, update model.
 */
export async function startAgents(model: NapModel, ptySpawner: PtySpawner): Promise<void> {
  const agents = model.getAllAgents();
  const decisions = computeResumeActions(agents);

  for (const decision of decisions) {
    if (decision.action === 'skip') continue;

    ptySpawner.spawn({
      id: decision.agentId,
      command: decision.command!,
      cwd: '',
    });

    // Register exit handler — fires when pty dies on its own (NOT on quit)
    ptySpawner.onExit(decision.agentId, () => {
      return model.setAgentExitedById(decision.agentId);
    });

    model.setAgentRunning(decision.agentId, true);

    // Case C: write started=true to marker
    if (decision.action === 'fresh') {
      await model.setAgentStarted(decision.agentId);
    }
  }
}

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
