import type { AgentState } from '../shared/bridge-types';

export interface ResumeAction {
  agentId: string;
  action: 'resume' | 'fresh' | 'skip';
  command?: string;
}

/**
 * Pure function: given a list of agents, compute what to do on STOP→RUN.
 *
 * Case A (started + !exited): resume with --resume (includes done agents)
 * Case B (exited): skip — user terminated, resume on demand via click
 * Case C (!started): fresh start with --session-id + prompt
 */
export function computeResumeActions(agents: AgentState[]): ResumeAction[] {
  return agents.map((agent) => {
    // Archived agents always skip — checked BEFORE started/exited
    if (agent.archived) {
      return { agentId: agent.id, action: 'skip' as const };
    }
    if (agent.exited) {
      return { agentId: agent.id, action: 'skip' as const };
    }
    if (agent.started) {
      return {
        agentId: agent.id,
        action: 'resume' as const,
        command: `claude --verbose --resume ${agent.id}`,
      };
    }
    return {
      agentId: agent.id,
      action: 'fresh' as const,
      command: `claude --verbose --session-id ${agent.id} "read ${agent.homePath}/prompt.md and follow its instructions"`,
    };
  });
}
