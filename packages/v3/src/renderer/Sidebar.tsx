import React from 'react';
import { useNapStore } from './store';
import type { NapkinState, AgentState, NapkinStatus } from '../shared/bridge-types';

// ── Dot colors by role ──

const ROLE_COLORS: Record<string, string> = {
  'test-arch': '#f59e0b',
  'fs-eng': '#22c55e',
  architect: '#3b82f6',
};

const PHASE_COLORS: Record<NapkinStatus, string> = {
  done: '#6b7280',
  review: '#3b82f6',
  doing: '#22c55e',
  todo: '#a3a3a3',
  backlog: '#525252',
};

function dotColor(agent: AgentState): string {
  if (agent.exited) return '#6b7280';
  return ROLE_COLORS[agent.role] ?? '#a3a3a3';
}

// ── Agent dot ──

function AgentDot({ agent }: { agent: AgentState }) {
  const color = dotColor(agent);
  const hollow = agent.exited;
  const setActiveTerminal = useNapStore((s) => s.setActiveTerminal);

  return (
    <span
      data-testid="agent-dot"
      title={`${agent.name} (${agent.role})`}
      onClick={(e) => {
        e.stopPropagation();
        if (agent.running) setActiveTerminal(agent.id);
      }}
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: hollow ? 'transparent' : color,
        border: `2px solid ${color}`,
        marginRight: 4,
        cursor: agent.running ? 'pointer' : 'default',
      }}
    />
  );
}

// ── Napkin card (collapsed) ──

function NapkinCard({ napkin }: { napkin: NapkinState }) {
  const setActiveTerminal = useNapStore((s) => s.setActiveTerminal);
  const firstRunning = napkin.agents.find((a) => a.running);

  return (
    <div
      data-testid="napkin-card"
      onClick={() => firstRunning && setActiveTerminal(firstRunning.id)}
      style={{
        padding: '6px 10px',
        borderBottom: '1px solid #333',
        cursor: firstRunning ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#888' }}>*</span>
        <span style={{ flex: 1 }}>{napkin.slug}</span>
        <span style={{ color: PHASE_COLORS[napkin.status], fontSize: 11 }}>
          {napkin.status}
        </span>
      </div>
      {napkin.agents.length > 0 && (
        <div style={{ marginTop: 4, paddingLeft: 16 }}>
          {napkin.agents.map((a) => (
            <AgentDot key={a.name} agent={a} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Architect card (pinned at top) ──

function ArchitectCard({ architect }: { architect: AgentState }) {
  const setActiveTerminal = useNapStore((s) => s.setActiveTerminal);

  return (
    <div
      data-testid="architect-card"
      onClick={() => architect.running && setActiveTerminal(architect.id)}
      style={{
        padding: '6px 10px',
        borderBottom: '1px solid #444',
        backgroundColor: '#252525',
        cursor: architect.running ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#3b82f6' }}>*</span>
        <span>{architect.name}</span>
        <span style={{ color: '#666', fontSize: 11 }}>architect</span>
      </div>
    </div>
  );
}

// ── Sidebar ──

export function Sidebar() {
  const { napkins, architects } = useNapStore();

  return (
    <div
      data-testid="sidebar"
      style={{
        width: 260,
        height: '100%',
        borderRight: '1px solid #333',
        fontFamily: 'monospace',
        fontSize: 13,
        color: '#ccc',
        overflowY: 'auto',
        backgroundColor: '#1a1a1a',
      }}
    >
      {architects.map((a) => (
        <ArchitectCard key={a.name} architect={a} />
      ))}
      {napkins.map((n) => (
        <NapkinCard key={n.slug} napkin={n} />
      ))}
    </div>
  );
}
