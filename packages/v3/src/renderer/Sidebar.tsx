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
  const isDone = agent.done;
  const hollow = agent.exited || isDone;
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
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: hollow ? 'transparent' : color,
        border: `2px ${isDone ? 'dashed' : 'solid'} ${hollow ? color : 'transparent'}`,
        marginRight: 4,
        verticalAlign: 'middle',
        cursor: agent.running ? 'pointer' : 'default',
      }}
    >
      {isDone && (
        <svg width="6" height="6" viewBox="0 0 6 6">
          <path d="M1 3.2 L2.3 4.5 L5 1.5" stroke={color} strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

// ── Napkin card (collapsed) ──

function NapkinCard({ napkin, isFocused }: { napkin: NapkinState; isFocused: boolean }) {
  const setActiveTerminal = useNapStore((s) => s.setActiveTerminal);
  const firstRunning = napkin.agents.find((a) => a.running);

  return (
    <div
      data-testid="napkin-card"
      onClick={() => firstRunning && setActiveTerminal(firstRunning.id)}
      style={{
        padding: '0 12px 0 9px',
        cursor: firstRunning ? 'pointer' : 'default',
        background: isFocused ? '#37373d' : 'transparent',
        borderLeft: isFocused ? '3px solid #007acc' : '3px solid transparent',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!isFocused) e.currentTarget.style.background = '#2a2d2e';
      }}
      onMouseLeave={(e) => {
        if (!isFocused) e.currentTarget.style.background = 'transparent';
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '3px 0',
        gap: 6,
        userSelect: 'none',
      }}>
        <span style={{ color: '#6b7280', flexShrink: 0 }}>*</span>
        <span style={{
          flex: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: isFocused ? '#e5e5e5' : '#cccccc',
        }}>
          {napkin.slug}
        </span>
        <span style={{ display: 'flex', gap: 3, flexShrink: 0, margin: '0 2px' }}>
          {napkin.agents.map((a) => (
            <AgentDot key={a.name} agent={a} />
          ))}
        </span>
        <span style={{ color: PHASE_COLORS[napkin.status], fontSize: 12, flexShrink: 0 }}>
          {napkin.status}
        </span>
      </div>
    </div>
  );
}

// ── Architect card (pinned at top) ──

function ArchitectCard({ architect, isFocused }: { architect: AgentState; isFocused: boolean }) {
  const setActiveTerminal = useNapStore((s) => s.setActiveTerminal);

  return (
    <div
      data-testid="architect-card"
      onClick={() => setActiveTerminal(architect.id)}
      style={{
        padding: '0 12px 0 9px',
        cursor: 'pointer',
        background: isFocused ? '#37373d' : 'transparent',
        borderLeft: isFocused ? '3px solid #007acc' : '3px solid transparent',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!isFocused) e.currentTarget.style.background = '#2a2d2e';
      }}
      onMouseLeave={(e) => {
        if (!isFocused) e.currentTarget.style.background = 'transparent';
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '3px 0',
        gap: 6,
        userSelect: 'none',
      }}>
        <span style={{ color: '#6b7280', flexShrink: 0 }}>*</span>
        <span style={{
          flex: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: isFocused ? '#e5e5e5' : '#cccccc',
        }}>
          {architect.name}
        </span>
        <span style={{ color: '#6b7280', fontSize: 12, flexShrink: 0 }}>
          architect
        </span>
      </div>
    </div>
  );
}

// ── Sidebar ──

export function Sidebar() {
  const { napkins, architects, activeTerminalId } = useNapStore();

  // Find which card owns the active terminal
  const activeArchitect = architects.find((a) => a.id === activeTerminalId);
  const activeNapkin = napkins.find((n) =>
    n.agents.some((a) => a.id === activeTerminalId),
  );

  return (
    <div
      data-testid="sidebar"
      style={{
        width: 300,
        minWidth: 300,
        height: '100%',
        background: '#252526',
        borderRight: '1px solid #3c3c3c',
        fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
        fontSize: 13,
        lineHeight: 1.55,
        color: '#cccccc',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {architects.map((a) => (
          <ArchitectCard
            key={a.name}
            architect={a}
            isFocused={a.id === activeTerminalId}
          />
        ))}
        {architects.length > 0 && (
          <div style={{ height: 1, background: '#3c3c3c', margin: '6px 12px' }} />
        )}
        {napkins.map((n) => (
          <NapkinCard
            key={n.slug}
            napkin={n}
            isFocused={activeNapkin?.slug === n.slug}
          />
        ))}
      </div>
    </div>
  );
}
