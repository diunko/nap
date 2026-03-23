import { useState } from 'react';
import {
  useTerminalStore,
  dotColor,
  isDotHollow,
  isDotPulsing,
  terminalStatusToAgent,
  type NapkinEntry,
  type NapkinPhase,
  type AgentStatus,
  type NapkinAgentEntry,
  type TerminalMeta,
} from '../store';
import { StatusDot } from './NapkinBrowser';

const COLUMNS: { key: NapkinPhase; label: string }[] = [
  { key: 'backlog', label: 'BACKLOG' },
  { key: 'todo', label: 'TODO' },
  { key: 'doing', label: 'DOING' },
  { key: 'review', label: 'REVIEW' },
  { key: 'done', label: 'DONE' },
];

const KNOWN_BADGES = ['nap', 'spec', 'test', 'journeys'] as const;

function badgeFromFileName(name: string): string | null {
  // '0100-design-sprint.nap.md' → 'nap', '0100-design-sprint.spec.md' → 'spec', etc.
  for (const badge of KNOWN_BADGES) {
    if (name.endsWith(`.${badge}.md`)) return badge;
  }
  return null;
}

// ── Kanban Card ──

function KanbanCard({
  napkin,
  terminals,
  onNavigate,
}: {
  napkin: NapkinEntry;
  terminals: TerminalMeta[];
  onNavigate: (slug: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Extract agents from entries
  const agentEntries = napkin.entries.filter((e): e is NapkinAgentEntry => e.type === 'agent');

  // Derive agent statuses
  const napkinTerminals = terminals
    .filter((t) => t.napkinSlug === napkin.slug && t.role !== 'architect')
    .sort((a, b) => a.createdAt - b.createdAt);

  const agentStatuses: AgentStatus[] = agentEntries.map((_, i) =>
    napkinTerminals[i]
      ? terminalStatusToAgent(napkinTerminals[i].status)
      : ('exit' as AgentStatus),
  );
  // Extra terminals beyond filesystem agents
  for (let i = agentEntries.length; i < napkinTerminals.length; i++) {
    agentStatuses.push(terminalStatusToAgent(napkinTerminals[i].status));
  }

  // Badge presence — derive from file entries
  const presentBadges = new Set<string>();
  for (const entry of napkin.entries) {
    if (entry.type === 'file') {
      const badge = badgeFromFileName(entry.name);
      if (badge) presentBadges.add(badge);
    }
  }

  return (
    <div
      style={{
        background: '#37373d',
        borderRadius: 5,
        border: expanded ? '1px solid #007acc' : '1px solid transparent',
        overflow: 'hidden',
        transition: 'border-color 0.15s',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!expanded) (e.currentTarget as HTMLDivElement).style.borderColor = '#3c3c3c';
      }}
      onMouseLeave={(e) => {
        if (!expanded) (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent';
      }}
    >
      {/* Card header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: '7px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: 12,
            color: '#cccccc',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {napkin.slug}
        </span>
        <span style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          {agentStatuses.map((s, i) => (
            <StatusDot key={i} status={s} size={6} />
          ))}
        </span>
        <span
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(napkin.slug);
          }}
          style={{
            color: '#6b7280',
            fontSize: 13,
            cursor: 'pointer',
            padding: '0 2px',
            flexShrink: 0,
            transition: 'color 0.1s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#007acc')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
        >
          &rarr;
        </span>
      </div>

      {/* Card body (expanded) */}
      {expanded && (
        <div style={{ padding: '0 10px 8px 10px', fontSize: 12, lineHeight: 1.5 }}>
          <div style={{ height: 1, background: '#3c3c3c', margin: '0 0 5px 0' }} />

          {/* Napkin bullets */}
          {napkin.napkinBullets.map((bullet, i) => (
            <div key={`b-${i}`} style={{ color: '#cccccc', padding: '1px 0' }}>
              <span style={{ color: '#6b7280' }}>* </span>
              {bullet}
            </div>
          ))}

          {/* Artifact badges */}
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            {KNOWN_BADGES.map((badge) => (
              <span
                key={badge}
                style={{
                  fontSize: 10,
                  color: presentBadges.has(badge) ? '#9cdcfe' : '#6b7280',
                  background: presentBadges.has(badge)
                    ? 'rgba(156,220,254,0.08)'
                    : 'rgba(107,114,128,0.1)',
                  padding: '1px 5px',
                  borderRadius: 3,
                }}
              >
                {badge}
              </span>
            ))}
          </div>

          {/* Agent chips */}
          {agentStatuses.length > 0 && (
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginTop: 3,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              {agentEntries.map((agent, i) => (
                <span
                  key={`ac-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    fontSize: 11,
                    color: '#6b7280',
                  }}
                >
                  <StatusDot status={agentStatuses[i] || 'exit'} size={6} />
                  {agent.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Kanban Overlay ──

export function KanbanOverlay() {
  const kanbanVisible = useTerminalStore((s) => s.kanbanVisible);
  const napkins = useTerminalStore((s) => s.napkins);
  const terminals = useTerminalStore((s) => s.terminals);
  const toggleKanban = useTerminalStore((s) => s.toggleKanban);
  const expandCard = useTerminalStore((s) => s.expandCard);
  const setActive = useTerminalStore((s) => s.setActive);

  function handleNavigate(slug: string) {
    // 1. Dismiss kanban
    toggleKanban();

    // 2. Focus card in sidebar
    expandCard(slug);

    // 3. Switch terminal to best agent for this napkin
    const napkinTerminals = terminals
      .filter((t) => t.napkinSlug === slug && t.role !== 'architect')
      .sort((a, b) => a.createdAt - b.createdAt);

    // Best agent heuristic: running > done > exited
    const priority: Record<string, number> = { running: 0, done: 1, exited: 2 };
    const sorted = [...napkinTerminals].sort(
      (a, b) => (priority[a.status] ?? 3) - (priority[b.status] ?? 3),
    );
    if (sorted.length > 0) {
      setActive(sorted[0].id);
    } else {
      // No agent terminals — try architect
      const architect = terminals.find((t) => t.role === 'architect' && t.status === 'running');
      if (architect) setActive(architect.id);
    }
  }

  // Group napkins by phase
  const grouped: Record<NapkinPhase, NapkinEntry[]> = {
    backlog: [],
    todo: [],
    doing: [],
    review: [],
    done: [],
  };
  for (const n of napkins) {
    (grouped[n.status] || grouped.backlog).push(n);
  }

  return (
    <div
      data-testid="kanban-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: kanbanVisible ? '70vh' : 0,
        background: '#1a1a2e',
        borderBottom: kanbanVisible ? '2px solid #007acc' : 'none',
        overflow: 'hidden',
        transition: 'height 0.25s ease',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 24px',
          borderBottom: '1px solid #3c3c3c',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: '#e5e5e5' }}>
          project board
        </span>
        <span style={{ color: '#6b7280', fontSize: 12 }}>
          click card to expand &middot; &rarr; to navigate &middot; &#x2318;` to close
        </span>
      </div>

      {/* Board */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          gap: 1,
          background: '#3c3c3c',
          overflowX: 'auto',
          overflowY: 'hidden',
          minHeight: 0,
        }}
      >
        {COLUMNS.map((col) => (
          <div
            key={col.key}
            data-testid={`kanban-col-${col.key}`}
            style={{
              flex: 1,
              minWidth: 180,
              background: '#1a1a2e',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            {/* Column header */}
            <div
              style={{
                padding: '10px 14px',
                fontSize: 11,
                fontWeight: 600,
                color: '#6b7280',
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                borderBottom: '1px solid #3c3c3c',
                flexShrink: 0,
              }}
            >
              {col.label} ({grouped[col.key].length})
            </div>

            {/* Column body */}
            <div
              style={{
                padding: 8,
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                overflowY: 'auto',
                minHeight: 0,
              }}
            >
              {grouped[col.key].map((napkin) => (
                <KanbanCard
                  key={napkin.slug}
                  napkin={napkin}
                  terminals={terminals}
                  onNavigate={handleNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
