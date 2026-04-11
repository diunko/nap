import type * as net from 'net';
import type { NapModel } from './model';
import type { PtySpawner } from './pty-spawner';
import type { NapkinStatus } from '../shared/bridge-types';
import { resolveByName } from './name-resolver';
import { enqueue } from './message-queue';
import { LONG_LIVED } from './socket-server';
import { serialize } from '../shared/ndjson';

const VALID_PHASES = ['backlog', 'todo', 'doing', 'review', 'done', 'archived'] as const;

// ── Pending approvals registry ──
// Maps agentId → { resolve callback, connection }
// hook-permission-request adds an entry; permission-response resolves it.

interface PermissionResult {
  decision: string;
  message?: string;
  interrupt?: boolean;
}

interface PendingEntry {
  resolve: (result: PermissionResult) => void;
  conn: net.Socket;
  keepaliveTimer: ReturnType<typeof setInterval>;
}

const pendingRegistry = new Map<string, PendingEntry>();

/** Exported for tests — check registry state */
export function getPendingRegistry(): ReadonlyMap<string, PendingEntry> {
  return pendingRegistry;
}

export function createRequestHandler(
  model: NapModel,
  ptySpawner: PtySpawner,
): (msg: unknown, conn: net.Socket) => Promise<unknown> {
  return async (msg: unknown, conn: net.Socket) => {
    const req = msg as Record<string, unknown>;
    const reqId = req.id as number;
    const type = req.type as string;

    switch (type) {
      case 'create-napkin': {
        const slug = req.slug as string;
        const status = (req.status as NapkinStatus) || 'backlog';
        const nepicId = req.nepicId as string | undefined;
        const result = await model.createNapkin(slug, status, nepicId);
        return { ...result };
      }

      case 'create-agent': {
        const napkinSlug = req.napkinSlug as string;
        const name = req.name as string;
        const role = req.role as string;
        const nepicId = req.nepicId as string | undefined;
        const result = await model.createAgentStub(napkinSlug, name, role, nepicId);
        return { ...result };
      }

      case 'create-architect': {
        const name = req.name as string;
        const nepicId = req.nepicId as string | undefined;
        const result = await model.createArchitectStub(name, nepicId);
        return { ...result };
      }

      case 'create-nepic': {
        const slug = req.slug as string;
        const displayName = req.displayName as string;
        const result = await model.createNepic(slug, displayName);
        return { ...result };
      }

      case 'start': {
        const name = req.name as string;
        const prompt = (req.prompt as string) || null;
        const nepicId = req.nepicId as string | undefined;
        const result = await model.startAgentByName(name, prompt, ptySpawner, nepicId);
        return { ...result };
      }

      case 'done': {
        const sessionId = req.sessionId as string;
        model.setAgentDone(sessionId);
        return { id: reqId };
      }

      case 'stop': {
        const name = req.name as string;
        const allAgents = model.getAllAgents();
        const resolved = resolveByName(allAgents, name);
        if (!resolved.ok) {
          throw new Error(resolved.error);
        }
        const agent = resolved.agent;
        ptySpawner.kill(agent.id);
        await model.setAgentExitedById(agent.id);
        return { id: reqId };
      }

      case 'set-status': {
        const napkinSlug = req.napkinSlug as string;
        const status = req.status as string;
        if (!VALID_PHASES.includes(status as typeof VALID_PHASES[number])) {
          throw new Error(
            `unknown phase '${status}' — use: ${VALID_PHASES.join(', ')}`,
          );
        }
        await model.setNapkinStatus(napkinSlug, status);
        return { id: reqId };
      }

      case 'status': {
        const query = (req.query as { napkin?: string; agent?: string; nepic?: string }) || {};
        const result = model.getStatus(query);
        return { id: reqId, ...result };
      }

      case 'ps': {
        const tree = model.getAllAgentsTree();
        return { id: reqId, agents: tree };
      }

      case 'poke': {
        const name = req.name as string;
        const message = req.message as string;
        const esc = (req.esc as boolean) || false;
        const allAgents = model.getAllAgents();
        const resolved = resolveByName(allAgents, name);
        if (!resolved.ok) {
          throw new Error(resolved.error);
        }
        enqueue(resolved.agent.id, message, esc);
        return { id: reqId };
      }

      case 'key': {
        const name = req.name as string;
        const data = req.data as string;
        const allAgents = model.getAllAgents();
        const resolved = resolveByName(allAgents, name);
        if (!resolved.ok) {
          throw new Error(resolved.error);
        }
        ptySpawner.write(resolved.agent.id, data);
        return { id: reqId };
      }

      case 'peek': {
        return { id: reqId };
      }

      case 'log': {
        const name = req.name as string;
        const tail = (req.tail as number) || 20;
        const allAgents = model.getAllAgents();
        const resolved = resolveByName(allAgents, name);
        if (!resolved.ok) {
          throw new Error(resolved.error);
        }
        const raw = ptySpawner.getScrollback(resolved.agent.id);
        const allLines = raw.split('\n').filter(l => l.length > 0);
        const lines = allLines.slice(-tail);
        return { id: reqId, lines };
      }

      case 'nap-wait': {
        const name = req.name as string;
        const allAgents = model.getAllAgents();
        const resolved = resolveByName(allAgents, name);
        if (!resolved.ok) {
          throw new Error(resolved.error);
        }
        const agent = resolved.agent;
        let status = 'running';
        if (agent.exited) status = 'exited';
        else if (agent.done) status = 'done';
        return { id: reqId, status };
      }

      case 'hook-permission-request': {
        const agentId = req.agentId as string;
        const tool = req.tool as string;
        const command = req.command as string;
        const payload = (req.payload as object) || {};

        // Reject duplicate — agent already has a pending approval
        if (pendingRegistry.has(agentId)) {
          throw new Error(`agent '${agentId}' already has a pending approval`);
        }

        // Set model state
        model.setAgentPendingApproval(agentId, {
          tool,
          command,
          timestamp: Date.now(),
          payload,
        });

        // Poke guardian if present + running
        const guardian = model.findAgentByRole('guardian');
        if (guardian && guardian.running) {
          const agent = model.getAllAgents().find(a => a.id === agentId);
          const agentName = agent?.name ?? agentId;
          const napkinSlug = agent?.napkinId ?? 'unknown';
          const role = agent?.role ?? 'unknown';
          const taskPath = agent?.homePath ? agent.homePath + '/prompt.md' : 'unknown';
          const pokeMessage = `[permission-request from: ${agentName} | napkin: ${napkinSlug} | role: ${role}]\ntool: ${tool}\ncommand: ${command}\ntask: ${taskPath}`;
          enqueue(guardian.id, pokeMessage);
        }

        // Create long-lived Promise — hangs until permission-response resolves it
        const result = await new Promise<PermissionResult>((resolve) => {
          const keepaliveTimer = setInterval(() => {
            if (!conn.destroyed) {
              conn.write(serialize({ type: 'ping' }));
            }
          }, 60_000);

          pendingRegistry.set(agentId, { resolve, conn, keepaliveTimer });

          // Clean up if client disconnects before resolution
          conn.on('close', () => {
            const entry = pendingRegistry.get(agentId);
            if (entry) {
              clearInterval(entry.keepaliveTimer);
              pendingRegistry.delete(agentId);
              model.clearPendingApproval(agentId);
            }
          });
        });

        // Connection resolved — send decision back to the hook process
        conn.write(serialize(result));
        return LONG_LIVED;
      }

      case 'permission-list': {
        const entries: Array<{ agentId: string; name: string; tool: string; command: string; timestamp: number }> = [];
        for (const [agentId] of pendingRegistry) {
          const agent = model.getAllAgents().find(a => a.id === agentId);
          const approval = agent?.pendingApproval;
          entries.push({
            agentId,
            name: agent?.name ?? agentId,
            tool: approval?.tool ?? '',
            command: approval?.command ?? '',
            timestamp: approval?.timestamp ?? 0,
          });
        }
        return { id: reqId, pending: entries };
      }

      case 'permission-response': {
        let agentId = req.agentId as string;
        const decision = req.decision as string;
        const message = (req.message as string) || undefined;
        const interrupt = (req.interrupt as boolean) || false;

        // Try direct lookup (UUID), then resolve by name
        let entry = pendingRegistry.get(agentId);
        if (!entry) {
          const allAgents = model.getAllAgents();
          const resolved = resolveByName(allAgents, agentId);
          if (resolved.ok) {
            agentId = resolved.agent.id;
            entry = pendingRegistry.get(agentId);
          }
        }

        if (!entry) {
          throw new Error(`no pending approval for agent '${req.agentId as string}'`);
        }

        // Clean up
        clearInterval(entry.keepaliveTimer);
        pendingRegistry.delete(agentId);
        model.clearPendingApproval(agentId);

        // Resolve the hanging hook-permission-request Promise
        entry.resolve({ decision, message, interrupt: interrupt || undefined });

        return { id: reqId };
      }

      default:
        throw new Error(`unknown request type: ${type}`);
    }
  };
}
