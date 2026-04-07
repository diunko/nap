import type { NapModel } from './model';
import type { PtySpawner } from './pty-spawner';
import type { NapkinStatus } from '../shared/bridge-types';
import { resolveByName } from './name-resolver';
import { enqueue } from './message-queue';

const VALID_PHASES = ['backlog', 'todo', 'doing', 'review', 'done'] as const;

export function createRequestHandler(
  model: NapModel,
  ptySpawner: PtySpawner,
): (msg: unknown) => Promise<unknown> {
  return async (msg: unknown) => {
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
        const allAgents = model.getAllAgents();
        const resolved = resolveByName(allAgents, name);
        if (!resolved.ok) {
          throw new Error(resolved.error);
        }
        enqueue(resolved.agent.id, message);
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
        return { id: reqId, lines: [] };
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

      default:
        throw new Error(`unknown request type: ${type}`);
    }
  };
}
