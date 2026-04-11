import { useEffect, useState } from 'react';
import { useNapStore } from './store';
import type { NapkinState, AgentState, NapkinStatus } from '../shared/bridge-types';
import { dotStyle } from '../shared/dot-style';

type KanbanColumn = 'backlog' | 'doing' | 'done' | 'archived';

const COLUMNS: { key: KanbanColumn; label: string; statuses: NapkinStatus[] }[] = [
  { key: 'backlog', label: 'BACKLOG', statuses: ['backlog', 'todo'] },
  { key: 'doing', label: 'DOING', statuses: ['doing', 'review'] },
  { key: 'done', label: 'DONE', statuses: ['done'] },
  { key: 'archived', label: 'ARCHIVED', statuses: ['archived'] },
];

const KNOWN_BADGES = ['nap', 'spec', 'test', 'journeys'] as const;

function badgeFromFileName(name: string): string | null {
  for (const badge of KNOWN_BADGES) {
    if (name.endsWith(`.${badge}.md`)) return badge;
  }
  return null;
}

// ── Kanban dot — simplified dot for kanban cards ──

function KanbanDot({ agent, size = 6 }: { agent: AgentState; size?: number }) {
  const style = dotStyle({
    role: agent.role,
    running: agent.running,
    done: agent.done,
    exited: agent.exited,
  });

  const hollow = style.shape === 'hollow';
  const dashed = style.shape === 'dashed-check';
  const actualSize = hollow ? size - 1 : size;

  return (
    <span
      style={{
        display: 'inline-block',
        width: actualSize,
        height: actualSize,
        borderRadius: '50%',
        backgroundColor: hollow || dashed ? 'transparent' : style.color,
        border: `1.5px ${dashed ? 'dashed' : 'solid'} ${hollow || dashed ? style.color : 'transparent'}`,
        flexShrink: 0,
        animation: agent.pendingApproval ? 'blink 0.6s step-end infinite' : 'none',
      }}
    />
  );
}

// ── Napkin content rendering — indentation-aware ──

const MAX_CONTENT_LINES = 8;

interface ContentLine {
  level: number;  // 0-based indentation depth
  text: string;   // display text (trimmed)
}

export function parseContentLines(raw: string): ContentLine[] {
  if (!raw) return [];
  const lines: ContentLine[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    // Count leading spaces (2 spaces = 1 level)
    const stripped = line.replace(/^(\s*)/, '');
    const leadingSpaces = line.length - stripped.length;
    const level = Math.floor(leadingSpaces / 2);
    // Strip bullet marker if present
    const text = stripped.replace(/^\*\s*/, '');
    if (text) lines.push({ level, text });
  }
  return lines;
}

function NapkinContentLines({ content }: { content: string }) {
  const lines = parseContentLines(content);
  if (lines.length === 0) return null;

  const capped = lines.slice(0, MAX_CONTENT_LINES);
  const truncated = lines.length > MAX_CONTENT_LINES;

  return (
    <>
      {capped.map((line, i) => {
        if (line.level >= 2) {
          // Level 3+ → ellipsis
          return (
            <div key={`c-${i}`} style={{ color: '#4a4a5a', padding: '1px 0', paddingLeft: 16 }}>
              ...
            </div>
          );
        }
        return (
          <div
            key={`c-${i}`}
            style={{
              color: line.level === 0 ? '#cccccc' : '#8a8a9a',
              padding: '1px 0',
              paddingLeft: line.level * 10,
            }}
          >
            <span style={{ color: '#6b7280' }}>* </span>
            {line.text}
          </div>
        );
      })}
      {truncated && (
        <div style={{ color: '#4a4a5a', padding: '1px 0' }}>...</div>
      )}
    </>
  );
}

// ── Kanban Card ──

function KanbanCard({
  napkin,
  onNavigate,
  onArchive,
  cmdHeld,
}: {
  napkin: NapkinState;
  onNavigate: (slug: string) => void;
  onArchive: (slug: string) => void;
  cmdHeld: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isDone = napkin.status === 'done';
  const isArchived = napkin.status === 'archived';

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
      data-testid="kanban-card"
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
        data-testid="kanban-card-header"
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
          {napkin.agents.map((a, i) => (
            <KanbanDot key={i} agent={a} />
          ))}
        </span>
        {/* Action zone — one arrow, meaning shifts with Cmd */}
        <span style={{ display: 'inline-flex', flexShrink: 0, alignItems: 'center', minWidth: 20, justifyContent: 'flex-end' }}>
          {isArchived ? (
            // Archived: ↑ always visible — single action, no need to hide
            <span
              data-testid="kanban-card-unarchive"
              title="Unarchive"
              onClick={(e) => {
                e.stopPropagation();
                onArchive(napkin.slug);
              }}
              style={{
                color: '#6b7280',
                fontSize: 13,
                cursor: 'pointer',
                padding: '0 2px',
                transition: 'color 0.1s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#007acc')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
            >
              &uarr;
            </span>
          ) : (
            // Active + Done: → normally, ↓ when Cmd held on done cards
            <span
              data-testid={isDone && cmdHeld ? 'kanban-card-archive' : 'kanban-card-navigate'}
              title={isDone && cmdHeld ? 'Archive' : undefined}
              onClick={(e) => {
                e.stopPropagation();
                if (isDone && cmdHeld) {
                  onArchive(napkin.slug);
                } else {
                  onNavigate(napkin.slug);
                }
              }}
              style={{
                color: '#6b7280',
                fontSize: 13,
                cursor: 'pointer',
                padding: '0 2px',
                transition: 'transform 0.15s, color 0.1s',
                display: 'inline-block',
                transform: isDone && cmdHeld ? 'rotate(90deg)' : 'none',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#007acc')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
            >
              &rarr;
            </span>
          )}
        </span>
      </div>

      {/* Card body (expanded) */}
      {expanded && (
        <div data-testid="kanban-card-body" style={{ padding: '0 10px 8px 10px', fontSize: 12, lineHeight: 1.5 }}>
          <div style={{ height: 1, background: '#3c3c3c', margin: '0 0 5px 0' }} />

          {/* Napkin content */}
          <NapkinContentLines content={napkin.napkinContent} />

          {/* Artifact badges */}
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            {KNOWN_BADGES.map((badge) => (
              <span
                key={badge}
                data-testid="kanban-badge"
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
          {napkin.agents.length > 0 && (
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginTop: 3,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              {napkin.agents.map((agent, i) => (
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
                  <KanbanDot agent={agent} size={6} />
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

// ── Best agent heuristic: running > done > exited ──

export function bestAgent(agents: AgentState[]): AgentState | null {
  const priority: Record<string, number> = { running: 3, done: 2, exited: 1 };

  function score(a: AgentState): number {
    if (a.running) return priority.running;
    if (a.done) return priority.done;
    if (a.exited) return priority.exited;
    return 0;
  }

  let best: AgentState | null = null;
  let bestScore = -1;

  for (const a of agents) {
    const s = score(a);
    if (s > bestScore) {
      bestScore = s;
      best = a;
    }
  }

  return best;
}

// ── Kanban Overlay ──

export function KanbanOverlay() {
  const kanbanVisible = useNapStore((s) => s.kanbanVisible);
  const napkins = useNapStore((s) => s.napkins);
  const architects = useNapStore((s) => s.architects);
  const toggleKanban = useNapStore((s) => s.toggleKanban);
  const focusCard = useNapStore((s) => s.focusCard);
  const setActive = useNapStore((s) => s.setActiveTerminal);

  // Track Cmd/Ctrl held — transforms done arrows to ↓, archived to ↑
  const [cmdHeld, setCmdHeld] = useState(false);
  useEffect(() => {
    if (!kanbanVisible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) setCmdHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) setCmdHeld(false);
    };
    const onBlur = () => setCmdHeld(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [kanbanVisible]);

  function handleNavigate(slug: string) {
    // 1. Dismiss kanban
    toggleKanban();

    // 2. Focus card in sidebar (forces sidebar visible)
    focusCard(slug);

    // 3. Switch terminal to best agent for this napkin
    const napkin = napkins.find((n) => n.slug === slug);
    if (!napkin) return;

    const napkinAgents = napkin.agents.filter((a) => a.role !== 'architect');
    const best = bestAgent(napkinAgents);

    if (best) {
      setActive(best.id);
    } else {
      // No agent terminals — try architect
      const architect = architects.find((a) => a.running);
      if (architect) setActive(architect.id);
    }
  }

  function handleArchive(slug: string) {
    const napkin = napkins.find((n) => n.slug === slug);
    if (!napkin) return;
    const newStatus = napkin.status === 'archived' ? 'done' : 'archived';
    window.electronAPI?.setNapkinStatus(slug, newStatus);
  }

  // Group napkins into display columns
  const grouped: Record<KanbanColumn, NapkinState[]> = {
    backlog: [],
    doing: [],
    done: [],
    archived: [],
  };
  for (const n of napkins) {
    const col = COLUMNS.find((c) => c.statuses.includes(n.status));
    (col ? grouped[col.key] : grouped.backlog).push(n);
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
          click card to expand &middot; &rarr; to navigate &middot; hold &#x2318; to archive &middot; &#x2318;` to close
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
              data-testid={`kanban-col-header-${col.key}`}
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
                  onNavigate={handleNavigate}
                  onArchive={handleArchive}
                  cmdHeld={cmdHeld}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
