import { useEffect, useRef } from 'react';
import { useTerminalStore } from '../store';
import type { CardViewMode } from '../store';
import {
  MOCK_ARCHITECTS,
  MOCK_NAPKINS,
  dotColor,
  isDotHollow,
  isDotPulsing,
  type MockAgent,
  type MockArchitect,
  type MockNapkin,
  type AgentStatus,
} from '../mock-data';

// ── Dot component ──

function StatusDot({ status, size = 7 }: { status: AgentStatus; size?: number }) {
  const hollow = isDotHollow(status);
  const pulsing = isDotPulsing(status);
  const color = dotColor(status);
  const actualSize = hollow ? size - 1 : size;

  return (
    <span
      style={{
        width: actualSize,
        height: actualSize,
        borderRadius: '50%',
        display: 'inline-block',
        flexShrink: 0,
        background: hollow ? 'transparent' : color,
        border: hollow ? `1.5px solid ${color}` : 'none',
        animation: pulsing ? 'pulse 2s ease-in-out infinite' : 'none',
      }}
    />
  );
}

// ── Architect Card ──

function ArchitectCard({
  architect,
  isFocused,
  viewMode,
  onToggle,
  onClickAgent,
}: {
  architect: MockArchitect;
  isFocused: boolean;
  viewMode: CardViewMode;
  onToggle: () => void;
  onClickAgent?: (terminalId: string) => void;
}) {
  const labelColor =
    architect.status === 'run'
      ? '#22c55e'
      : architect.status === 'done'
        ? '#3b82f6'
        : '#6b7280';

  const showExtended = isFocused && viewMode === 'extended';
  const files: { name: string; path: string; indent?: number }[] | undefined =
    showExtended ? architect.extendedFiles : architect.artifacts;

  return (
    <div
      style={{
        padding: isFocused ? '0 12px 0 9px' : '0 12px',
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
      {/* Header */}
      <div
        onClick={onToggle}
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
          <StatusDot status={architect.status} />
        </span>
        <span style={{ color: labelColor, fontSize: 12, flexShrink: 0 }}>
          {architect.label}
        </span>
      </div>

      {/* Body */}
      {isFocused && files && (
        <div style={{ padding: '0 0 4px 0' }}>
          {files.map((file, i) => (
            <div
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                window.electronAPI.openFilePath(file.path);
              }}
              style={{
                padding: `1px 0 1px ${(file.indent ?? 0) === 2 ? 32 : 16}px`,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                borderRadius: 3,
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')
              }
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
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
                  color: '#9cdcfe',
                }}
              >
                {file.name}
              </span>
              {showExtended && (
                <span
                  className="file-actions"
                  style={{ display: 'flex', gap: 8, flexShrink: 0 }}
                >
                  <span
                    style={{ color: '#6b7280', fontSize: 12, cursor: 'pointer', padding: '0 2px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(file.path);
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
                      window.electronAPI.openFilePath(file.path);
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#e5e5e5')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
                  >
                    &#x2197;
                  </span>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Napkin Card ──

function NapkinCard({
  napkin,
  isFocused,
  viewMode,
  onToggle,
  onClickAgent,
}: {
  napkin: MockNapkin;
  isFocused: boolean;
  viewMode: CardViewMode;
  onToggle: () => void;
  onClickAgent: (agent: MockAgent) => void;
}) {
  const phaseColor =
    napkin.phase === 'doing'
      ? '#22c55e'
      : napkin.phase === 'review'
        ? '#3b82f6'
        : '#6b7280';

  const showExtended = isFocused && viewMode === 'extended';

  return (
    <div
      data-testid="napkin-card"
      style={{
        padding: isFocused ? '0 12px 0 9px' : '0 12px',
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
        onClick={onToggle}
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
          {napkin.name}
        </span>
        <span style={{ display: 'flex', gap: 3, flexShrink: 0, margin: '0 2px' }}>
          {napkin.agents.map((a, i) => (
            <StatusDot key={i} status={a.status} />
          ))}
        </span>
        <span style={{ color: phaseColor, fontSize: 12, flexShrink: 0 }}>
          {napkin.phase}
        </span>
      </div>

      {/* Body — focused/extended view */}
      {isFocused && (
        <div style={{ padding: '0 0 4px 0' }}>
          {/* Artifacts */}
          {napkin.artifacts.map((artifact, i) => (
            <div
              key={`a-${i}`}
              onClick={(e) => {
                e.stopPropagation();
                window.electronAPI.openFilePath(artifact.path);
              }}
              style={{
                padding: '1px 0 1px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                borderRadius: 3,
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')
              }
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
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
                  color: '#9cdcfe',
                }}
              >
                {showExtended ? `${napkin.slug}.${artifact.name.replace('.md', '')}.md` : artifact.name}
              </span>
              {showExtended && (
                <span style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <span
                    style={{ color: '#6b7280', fontSize: 12, cursor: 'pointer', padding: '0 2px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(artifact.path);
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
                      window.electronAPI.openFilePath(artifact.path);
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#e5e5e5')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
                  >
                    &#x2197;
                  </span>
                </span>
              )}
            </div>
          ))}

          {/* Agents */}
          {napkin.agents.map((agent, i) => (
            <div key={`ag-${i}`}>
              <div
                data-testid="browser-agent"
                onClick={(e) => {
                  e.stopPropagation();
                  onClickAgent(agent);
                }}
                style={{
                  padding: '1px 0 1px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  borderRadius: 3,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')
                }
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
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
                    color: '#cccccc',
                  }}
                >
                  {agent.name}/
                </span>
                <StatusDot status={agent.status} size={8} />
                <span style={{ color: '#6b7280', fontSize: 12, flexShrink: 0 }}>
                  {agent.status}
                </span>
              </div>

              {/* Extended view: virtual entries under each agent */}
              {showExtended && (
                <>
                  <div
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
                      if (agent.terminalId) {
                        onClickAgent(agent);
                      }
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ color: '#6b7280', fontStyle: 'italic', fontSize: 12 }}>
                      [terminal]
                    </span>
                  </div>
                  <div
                    style={{
                      padding: '1px 0 1px 32px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      borderRadius: 3,
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ color: '#6b7280', fontStyle: 'italic', fontSize: 12 }}>
                      [diff]
                    </span>
                  </div>
                  <div
                    style={{
                      padding: '1px 0 1px 32px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      borderRadius: 3,
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ color: '#9cdcfe', fontSize: 12 }}>prompt.md</span>
                  </div>
                  {agent.status === 'done' && (
                    <div
                      style={{
                        padding: '1px 0 1px 32px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        borderRadius: 3,
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')
                      }
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ color: '#9cdcfe', fontSize: 12 }}>response.md</span>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}

          {/* Dim summary for collapsed agents in focused (not extended) view */}
          {!showExtended && napkin.agents.every((a) => a.status === 'exit') && (
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

// ── NapkinBrowser ──

export function NapkinBrowser() {
  const focusedCardSlug = useTerminalStore((s) => s.focusedCardSlug);
  const cardViewMode = useTerminalStore((s) => s.cardViewMode);
  const expandCard = useTerminalStore((s) => s.expandCard);
  const extendCard = useTerminalStore((s) => s.extendCard);
  const setActive = useTerminalStore((s) => s.setActive);
  const browserFilterText = useTerminalStore((s) => s.browserFilterText);
  const browserFilterVisible = useTerminalStore((s) => s.browserFilterVisible);
  const setBrowserFilter = useTerminalStore((s) => s.setBrowserFilter);
  const setBrowserFilterVisible = useTerminalStore((s) => s.setBrowserFilterVisible);
  const filterInputRef = useRef<HTMLInputElement>(null);

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

  // Cmd+E handler (extend focused card)
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

  const filteredNapkins = browserFilterText
    ? MOCK_NAPKINS.filter((n) =>
        n.name.toLowerCase().includes(browserFilterText.toLowerCase()),
      )
    : MOCK_NAPKINS;

  function handleClickAgent(agent: MockAgent) {
    if (agent.terminalId) {
      setActive(agent.terminalId);
    }
  }

  return (
    <div
      data-testid="napkin-browser"
      style={{
        width: 300,
        minWidth: 300,
        background: '#252526',
        borderRight: '1px solid #3c3c3c',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
        fontSize: 13,
        lineHeight: 1.55,
      }}
    >
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
        {MOCK_ARCHITECTS.map((arch) => (
          <ArchitectCard
            key={arch.slug}
            architect={arch}
            isFocused={focusedCardSlug === arch.slug}
            viewMode={cardViewMode}
            onToggle={() => expandCard(arch.slug)}
          />
        ))}

        {/* Separator */}
        <div
          style={{ height: 1, background: '#3c3c3c', margin: '6px 12px' }}
        />

        {/* Napkins */}
        {filteredNapkins.map((napkin) => (
          <NapkinCard
            key={napkin.slug}
            napkin={napkin}
            isFocused={focusedCardSlug === napkin.slug}
            viewMode={cardViewMode}
            onToggle={() => expandCard(napkin.slug)}
            onClickAgent={handleClickAgent}
          />
        ))}
      </div>
    </div>
  );
}
