import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNapStore } from './store';
import type { CardViewMode } from './store';
import type { NapkinState, AgentState, NapkinStatus, Entry, FileEntry, DirEntry } from '../shared/bridge-types';
import { dotStyle, roleColor } from '../shared/dot-style';

// ── Phase colors ──

const PHASE_COLORS: Record<NapkinStatus, string> = {
  done: '#6b7280',
  review: '#3b82f6',
  doing: '#22c55e',
  todo: '#a3a3a3',
  backlog: '#525252',
  archived: '#3c3c3c',
};

// ── Agent dot (role color + status shape) ──

function AgentDot({ agent, size = 8 }: { agent: AgentState; size?: number }) {
  const setActiveTerminal = useNapStore((s) => s.setActiveTerminal);
  const style = dotStyle({
    role: agent.role,
    running: agent.running,
    done: agent.done,
    exited: agent.exited,
    archived: agent.archived,
  });

  const hollow = style.shape === 'hollow';
  const dashed = style.shape === 'dashed-check';
  const actualSize = hollow ? size - 1 : size;
  const clickable = agent.started || agent.archived;

  return (
    <span
      data-testid="agent-dot"
      title={`${agent.name} (${agent.role})`}
      onClick={(e) => {
        e.stopPropagation();
        if (clickable) setActiveTerminal(agent.id);
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: actualSize,
        height: actualSize,
        minWidth: actualSize,
        minHeight: actualSize,
        borderRadius: '50%',
        boxSizing: 'content-box',
        flexShrink: 0,
        backgroundColor: hollow || dashed ? 'transparent' : style.color,
        border: `2px ${dashed ? 'dashed' : 'solid'} ${hollow || dashed ? style.color : 'transparent'}`,
        marginRight: 4,
        verticalAlign: 'middle',
        cursor: clickable ? 'pointer' : 'default',
        animation: agent.pendingApproval
          ? 'blink 0.6s step-end infinite' : 'none',
      }}
    >
      {dashed && (
        <svg width="6" height="6" viewBox="0 0 6 6">
          <path d="M1 3.2 L2.3 4.5 L5 1.5" stroke={style.color} strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

// ── File row with hover controls (extended view) ──

function FileRow({
  file,
  indent,
  showControls,
}: {
  file: FileEntry;
  indent: number;
  showControls: boolean;
}) {
  return (
    <div
      data-testid="file-entry"
      style={{
        padding: `1px 0 1px ${indent}px`,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        cursor: 'pointer',
        borderRadius: 3,
      }}
      onClick={(e) => {
        e.stopPropagation();
        window.electronAPI?.openFilePath(file.absPath);
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
        const ctrl = e.currentTarget.querySelector<HTMLElement>('[data-file-controls]');
        if (ctrl) ctrl.style.visibility = 'visible';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        const ctrl = e.currentTarget.querySelector<HTMLElement>('[data-file-controls]');
        if (ctrl) ctrl.style.visibility = 'hidden';
      }}
    >
      <span
        style={{
          color: '#6b7280',
          flexShrink: 0,
          width: 10,
          textAlign: 'center',
          fontSize: 12,
        }}
      >
        *
      </span>
      <span
        style={{
          flex: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: file.isMain ? '#e5e5e5' : '#9cdcfe',
          fontWeight: file.isMain ? 600 : 'normal',
        }}
      >
        {file.name}
      </span>
      {showControls && (
        <span data-file-controls style={{ display: 'flex', gap: 8, flexShrink: 0, visibility: 'hidden' }}>
          <span
            style={{ color: '#6b7280', fontSize: 12, cursor: 'pointer', padding: '0 2px' }}
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(file.absPath);
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#e5e5e5')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
          >
            &#x2398;
          </span>
          <span
            style={{ color: '#6b7280', fontSize: 12, cursor: 'pointer', padding: '0 2px' }}
            onClick={(e) => {
              e.stopPropagation();
              window.electronAPI?.openFilePath(file.absPath);
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#e5e5e5')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
          >
            &#x2197;
          </span>
        </span>
      )}
    </div>
  );
}

// ── Recursive entry renderer ──

function EntryTree({
  entries,
  indent,
  showControls,
  maxDepth,
  currentDepth,
}: {
  entries: Entry[];
  indent: number;
  showControls: boolean;
  maxDepth?: number;
  currentDepth?: number;
}) {
  const depth = currentDepth ?? 0;

  // Sort: main file first, then files alphabetically, then dirs
  const sorted = [...entries].sort((a, b) => {
    if (a.type === 'file' && (a as FileEntry).isMain) return -1;
    if (b.type === 'file' && (b as FileEntry).isMain) return 1;
    if (a.type !== b.type) return a.type === 'file' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      {sorted.map((entry, i) => {
        if (entry.type === 'file') {
          return <FileRow key={`f-${i}`} file={entry} indent={indent} showControls={showControls} />;
        }

        const dir = entry as DirEntry;
        const canExpand = maxDepth === undefined || depth < maxDepth;

        return (
          <div key={`d-${i}`}>
            <div
              data-testid="dir-entry"
              style={{
                padding: `1px 0 1px ${indent}px`,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                borderRadius: 3,
              }}
            >
              <span style={{ color: '#6b7280', flexShrink: 0, width: 10, textAlign: 'center', fontSize: 12 }}>*</span>
              <span style={{ color: '#cccccc' }}>{dir.name}/</span>
            </div>
            {canExpand && dir.children.length > 0 && (
              <EntryTree
                entries={dir.children}
                indent={indent + 16}
                showControls={showControls}
                maxDepth={maxDepth}
                currentDepth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

// ── Napkin card ──

function NapkinCard({
  napkin,
  isFocused,
  viewMode,
}: {
  napkin: NapkinState;
  isFocused: boolean;
  viewMode: CardViewMode;
}) {
  const setActiveTerminal = useNapStore((s) => s.setActiveTerminal);
  const expandCard = useNapStore((s) => s.expandCard);
  const showExtended = isFocused && viewMode === 'extended';

  const clickTarget = napkin.agents.find((a) => a.running)
    || napkin.agents.find((a) => a.started);

  function handleCardClick() {
    expandCard(napkin.slug);
    if (clickTarget) setActiveTerminal(clickTarget.id);
  }

  return (
    <div
      data-testid="napkin-card"
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
      {/* Header — collapsed view (always visible) */}
      <div
        onClick={handleCardClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '3px 0',
          gap: 6,
          userSelect: 'none',
        }}
      >
        <span style={{ color: '#6b7280', flexShrink: 0 }}>*</span>
        <span
          style={{
            flex: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: isFocused ? '#e5e5e5' : '#cccccc',
          }}
        >
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

      {/* Body — focused/extended view */}
      {isFocused && (
        <div style={{ padding: '0 0 4px 0' }}>
          {/* File entries */}
          <EntryTree
            entries={napkin.entries}
            indent={16}
            showControls={showExtended}
            maxDepth={showExtended ? undefined : 0}
          />

          {/* Non-agent subdirs in extended only — already handled by EntryTree */}

          {/* Agents */}
          {napkin.agents.map((agent, i) => (
            <div key={`ag-${i}`}>
              <div
                data-testid="browser-agent"
                onClick={(e) => {
                  e.stopPropagation();
                  if (agent.started || agent.archived) setActiveTerminal(agent.id);
                }}
                style={{
                  padding: '1px 0 1px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: (agent.started || agent.archived) ? 'pointer' : 'default',
                  borderRadius: 3,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')
                }
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ flexShrink: 0, width: 10, display: 'flex', justifyContent: 'center' }}>
                  <AgentDot agent={agent} size={8} />
                </span>
                <span
                  style={{
                    flex: 1,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    color: '#cccccc',
                  }}
                >
                  {agent.name}/
                </span>
                <span style={{ color: roleColor(agent.role), fontSize: 12, flexShrink: 0 }}>
                  {agent.archived ? 'archived' : agent.exited ? 'exited' : agent.done ? 'done' : agent.running ? 'run' : 'wait'}
                </span>
              </div>

              {/* Extended view: [terminal] + agent files */}
              {showExtended && (
                <>
                  {(agent.started || agent.archived) && (
                    <div
                      data-testid="terminal-entry"
                      style={{
                        padding: '1px 0 1px 32px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        cursor: 'pointer',
                        borderRadius: 3,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveTerminal(agent.id);
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')
                      }
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ color: '#6b7280', flexShrink: 0, fontSize: 12 }}>*</span>
                      <span style={{ color: '#6b7280', fontStyle: 'italic', fontSize: 12 }}>
                        [terminal]
                      </span>
                    </div>
                  )}
                  {agent.entries.length > 0 && (
                    <EntryTree
                      entries={agent.entries}
                      indent={32}
                      showControls={true}
                    />
                  )}
                </>
              )}
            </div>
          ))}

          {/* Dim summary for all-exited agents in focused (not extended) */}
          {!showExtended && napkin.agents.length > 0 && napkin.agents.every((a) => a.exited) && (
            <div
              style={{
                padding: '2px 0 2px 18px',
                color: '#6b7280',
                fontSize: 11,
                cursor: 'default',
              }}
            >
              {napkin.agents.length} agent{napkin.agents.length > 1 ? 's' : ''} exited
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Architect card ──

function ArchitectCard({
  architect,
  isFocused,
  viewMode,
}: {
  architect: AgentState;
  isFocused: boolean;
  viewMode: CardViewMode;
}) {
  const setActiveTerminal = useNapStore((s) => s.setActiveTerminal);
  const expandCard = useNapStore((s) => s.expandCard);
  const showExtended = isFocused && viewMode === 'extended';

  const labelColor =
    architect.running ? '#22c55e'
    : architect.done ? '#3b82f6'
    : '#6b7280';

  const archClickable = architect.running || architect.started || architect.archived;

  function handleClick() {
    expandCard(architect.id);
    if (archClickable) setActiveTerminal(architect.id);
  }

  return (
    <div
      data-testid="architect-card"
      style={{
        padding: '0 12px 0 9px',
        cursor: archClickable ? 'pointer' : 'default',
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
      {/* Header */}
      <div
        onClick={handleClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '3px 0',
          gap: 6,
          userSelect: 'none',
        }}
      >
        <span style={{ color: '#6b7280', flexShrink: 0 }}>*</span>
        <span
          style={{
            flex: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: isFocused ? '#e5e5e5' : '#cccccc',
          }}
        >
          {architect.name}
        </span>
        <span style={{ display: 'flex', gap: 3, flexShrink: 0, margin: '0 2px' }}>
          <AgentDot agent={architect} />
        </span>
        <span style={{ color: labelColor, fontSize: 12, flexShrink: 0 }}>
          {architect.archived ? 'archived' : architect.running ? 'lead' : architect.done ? 'done' : 'exited'}
        </span>
      </div>

      {/* Body — focused/extended view (home dir file tree) */}
      {isFocused && architect.entries.length > 0 && (
        <div style={{ padding: '0 0 4px 0' }}>
          {/* [terminal] entry */}
          {(architect.started || architect.archived) && (
            <div
              data-testid="terminal-entry"
              style={{
                padding: '1px 0 1px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
              onClick={(e) => {
                e.stopPropagation();
                setActiveTerminal(architect.id);
              }}
            >
              <span style={{ color: '#6b7280', flexShrink: 0, fontSize: 12 }}>*</span>
              <span style={{ color: '#6b7280', fontStyle: 'italic', fontSize: 12 }}>
                [terminal]
              </span>
            </div>
          )}

          {/* Files (focused: one level, extended: all levels) */}
          <EntryTree
            entries={architect.entries}
            indent={16}
            showControls={showExtended}
            maxDepth={showExtended ? undefined : 0}
          />
        </div>
      )}
    </div>
  );
}

// ── Sidebar ──

export function Sidebar() {
  const napkins = useNapStore((s) => s.napkins);
  const architects = useNapStore((s) => s.architects);
  const activeTerminalId = useNapStore((s) => s.activeTerminalId);
  const focusedCardSlug = useNapStore((s) => s.focusedCardSlug);
  const cardViewMode = useNapStore((s) => s.cardViewMode);
  const sidebarVisible = useNapStore((s) => s.sidebarVisible);
  const browserFilterText = useNapStore((s) => s.browserFilterText);
  const browserFilterVisible = useNapStore((s) => s.browserFilterVisible);
  const setBrowserFilter = useNapStore((s) => s.setBrowserFilter);
  const setBrowserFilterVisible = useNapStore((s) => s.setBrowserFilterVisible);
  const extendCard = useNapStore((s) => s.extendCard);
  const filterInputRef = useRef<HTMLInputElement>(null);

  // ── Resizable width ──
  const [width, setWidth] = useState(300);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(300);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      setWidth(Math.max(180, Math.min(600, startWidth.current + delta)));
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [width]);

  // Cmd+K handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setBrowserFilterVisible(true);
        setTimeout(() => filterInputRef.current?.focus(), 0);
      }
      if (e.key === 'Escape' && browserFilterVisible) {
        e.preventDefault();
        setBrowserFilterVisible(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [browserFilterVisible, setBrowserFilterVisible]);

  // Cmd+E handler (toggle focused ↔ extended)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        extendCard();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [extendCard]);

  if (!sidebarVisible) return null;

  // Separate archived napkins from active ones
  const activeNapkins = napkins.filter((n) => n.status !== 'archived');
  const archivedCount = napkins.length - activeNapkins.length;

  const filteredNapkins = browserFilterText
    ? activeNapkins.filter((n) =>
        n.slug.toLowerCase().includes(browserFilterText.toLowerCase()),
      )
    : activeNapkins;

  return (
    <div
      data-testid="sidebar"
      style={{
        width,
        minWidth: 180,
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
        position: 'relative',
      }}
    >
      {/* Drag handle — right edge */}
      <div
        onMouseDown={onMouseDown}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: 4,
          height: '100%',
          cursor: 'col-resize',
          zIndex: 10,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#007acc')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      />
      {/* Filter bar */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #3c3c3c' }}>
        <input
          ref={filterInputRef}
          data-testid="browser-filter"
          type="text"
          value={browserFilterText}
          onChange={(e) => setBrowserFilter(e.target.value)}
          placeholder={browserFilterVisible ? 'Filter...' : '\u2318K  filter napkins...'}
          readOnly={!browserFilterVisible}
          onClick={() => {
            if (!browserFilterVisible) {
              setBrowserFilterVisible(true);
              setTimeout(() => filterInputRef.current?.focus(), 0);
            }
          }}
          style={{
            width: '100%',
            background: '#1e1e1e',
            border: browserFilterVisible ? '1px solid #007acc' : '1px solid #3c3c3c',
            color: browserFilterVisible ? '#cccccc' : '#6b7280',
            fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
            fontSize: 12,
            padding: '5px 10px',
            borderRadius: 4,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Card list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '6px 0',
          scrollBehavior: 'smooth',
        }}
      >
        {/* Architects pinned at top */}
        {architects.map((a) => (
          <ArchitectCard
            key={a.name}
            architect={a}
            isFocused={focusedCardSlug === a.id}
            viewMode={cardViewMode}
          />
        ))}

        {/* Separator */}
        {architects.length > 0 && (
          <div style={{ height: 1, background: '#3c3c3c', margin: '6px 12px' }} />
        )}

        {/* Napkins */}
        {filteredNapkins.map((n) => (
          <NapkinCard
            key={n.slug}
            napkin={n}
            isFocused={focusedCardSlug === n.slug}
            viewMode={cardViewMode}
          />
        ))}

        {/* Archived count */}
        {archivedCount > 0 && (
          <div
            style={{
              padding: '4px 12px 4px 21px',
              color: '#525252',
              fontSize: 12,
              cursor: 'default',
            }}
          >
            {archivedCount} archived
          </div>
        )}
      </div>
    </div>
  );
}
