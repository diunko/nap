import React, { useCallback, useRef, useState } from 'react';
import { useNapStore } from './session';
import type { CardViewMode } from './store';
import type { NavNode } from './nav-tree';
import { getDotStyle, getPhaseColor } from './dot-style';

// ── Agent dot (role color + status shape) ──

function AgentDot({ node, size = 8 }: { node: NavNode; size?: number }) {
  // Read agent metadata from the node's children or the cached JSON
  // For now, derive from convention: role is in the agent name (e.g., 001-test-arch-routing)
  const role = extractRole(node);
  const status = extractAgentStatus(node);

  const style = getDotStyle({
    role,
    running: status === 'run',
    done: status === 'done',
    exited: status === 'exited',
    archived: status === 'archived',
  });

  const hollow = style.shape === 'hollow';
  const dashed = style.shape === 'dashed-check';
  const actualSize = hollow ? size - 1 : size;

  return (
    <span
      data-testid="agent-dot"
      title={`${node.displayName} (${role})`}
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

// Extract role — from metadata if available, fallback to directory name convention
function extractRole(node: NavNode): string {
  if (node.metadata?.role) return node.metadata.role as string;
  const stripped = node.name.replace(/^\d+-/, '');
  if (stripped.startsWith('test-arch')) return 'test-arch';
  if (stripped.startsWith('fs-eng')) return 'fs-eng';
  if (stripped.startsWith('test-eng')) return 'test-eng';
  if (stripped.startsWith('architect')) return 'architect';
  if (stripped.startsWith('guardian')) return 'guardian';
  return 'fs-eng'; // default
}

// Extract agent status from .agent.nap.json metadata on the NavNode
function extractAgentStatus(node: NavNode): string {
  const m = node.metadata;
  if (!m) return 'done';
  if (m.exited) return 'exited';
  if (m.started && !m.exited) return 'run';
  // started=false, exited=false → created but not started → done or waiting
  // For display purposes, treat as 'done' (the default completed state)
  return 'done';
}

// ── File row ──

function FileRow({ node, indent }: { node: NavNode; indent: number }) {
  const openDoc = useNapStore((s) => s.openDoc);
  const isMain = node.name.includes('.nap.md') && !node.name.includes('.spec') && !node.name.includes('.stories') && !node.name.includes('.test');
  const isMd = node.name.endsWith('.md');

  return (
    <div
      data-testid="file-entry"
      style={{
        padding: `1px 0 1px ${indent}px`,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        cursor: isMd ? 'pointer' : 'default',
        borderRadius: 3,
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (isMd) {
          console.log(`[sidebar] fileClick ${node.name}`);
          openDoc(node.path);
        }
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.03)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ color: 'var(--nap-text-muted)', flexShrink: 0, width: 10, textAlign: 'center', fontSize: 12 }}>*</span>
      <span
        style={{
          flex: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: isMain ? 'var(--nap-text)' : isMd ? 'var(--nap-link)' : 'var(--nap-text-secondary)',
          fontWeight: isMain ? 600 : 'normal',
        }}
      >
        {node.name}
      </span>
    </div>
  );
}

// ── Directory row ──

function DirRow({ node, indent }: { node: NavNode; indent: number }) {
  return (
    <div style={{ padding: `1px 0 1px ${indent}px`, display: 'flex', alignItems: 'center', gap: 6, borderRadius: 3 }}>
      <span style={{ color: 'var(--nap-text-muted)', flexShrink: 0, width: 10, textAlign: 'center', fontSize: 12 }}>*</span>
      <span style={{ color: 'var(--nap-text-secondary)' }}>{node.displayName}/</span>
    </div>
  );
}

// ── Recursive tree renderer ──

function NodeTree({ nodes, indent, maxDepth, depth = 0 }: { nodes: NavNode[]; indent: number; maxDepth?: number; depth?: number }) {
  return (
    <>
      {nodes.map((node, i) => {
        if (node.type === 'file') {
          return <FileRow key={`f-${i}`} node={node} indent={indent} />;
        }
        if (node.type === 'agent') {
          return <AgentRow key={`a-${i}`} node={node} indent={indent} />;
        }
        // Section or directory
        const canExpand = maxDepth === undefined || depth < maxDepth;
        return (
          <div key={`d-${i}`}>
            <DirRow node={node} indent={indent} />
            {canExpand && node.children && node.children.length > 0 && (
              <NodeTree nodes={node.children} indent={indent + 16} maxDepth={maxDepth} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </>
  );
}

// ── Agent row ──

function AgentRow({ node, indent }: { node: NavNode; indent: number }) {
  const role = extractRole(node);
  const status = extractAgentStatus(node);
  const statusColor = role === 'test-arch' ? '#f59e0b' : role === 'fs-eng' ? '#22c55e' : role === 'test-eng' ? '#6b7280' : '#3b82f6';

  return (
    <div
      data-testid="browser-agent"
      style={{
        padding: `1px 0 1px ${indent}px`,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        borderRadius: 3,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.03)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ flexShrink: 0, width: 10, display: 'flex', justifyContent: 'center' }}>
        <AgentDot node={node} size={8} />
      </span>
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--nap-text-secondary)' }}>
        {node.displayName}/
      </span>
      <span style={{ color: statusColor, fontSize: 12, flexShrink: 0 }}>
        {status}
      </span>
    </div>
  );
}

// ── Napkin card ──

function NapkinCard({ napkin, isFocused, viewMode }: { napkin: NavNode; isFocused: boolean; viewMode: CardViewMode }) {
  const expandCard = useNapStore((s) => s.expandCard);
  const showExtended = isFocused && viewMode === 'extended';

  // Find agents in children (type === 'section' with name === 'agents')
  const agentsSection = napkin.children?.find((c) => c.type === 'section' && c.name === 'agents');
  const agents = agentsSection?.children?.filter((c) => c.type === 'agent') ?? [];
  // Files and other sections (exclude agents section)
  const entries = napkin.children?.filter((c) => !(c.type === 'section' && c.name === 'agents')) ?? [];

  return (
    <div
      data-testid="napkin-card"
      style={{
        padding: '0 12px 0 9px',
        cursor: 'pointer',
        background: isFocused ? 'var(--nap-bg-tertiary)' : 'transparent',
        borderLeft: isFocused ? '3px solid var(--nap-accent)' : '3px solid transparent',
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => { if (!isFocused) e.currentTarget.style.background = 'var(--nap-bg-hover)'; }}
      onMouseLeave={(e) => { if (!isFocused) e.currentTarget.style.background = 'transparent'; }}
    >
      {/* Header */}
      <div
        onClick={() => expandCard(napkin.name)}
        style={{ display: 'flex', alignItems: 'center', padding: '3px 0', gap: 6, userSelect: 'none' }}
      >
        <span style={{ color: 'var(--nap-text-muted)', flexShrink: 0 }}>*</span>
        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: isFocused ? 'var(--nap-text)' : 'var(--nap-text-secondary)' }}>
          {napkin.displayName}
        </span>
        <span style={{ display: 'flex', gap: 3, flexShrink: 0, margin: '0 2px' }}>
          {agents.map((a, i) => <AgentDot key={i} node={a} />)}
        </span>
        <span style={{ color: getPhaseColor(napkin.status ?? 'backlog'), fontSize: 12, flexShrink: 0 }}>
          {napkin.status ?? 'backlog'}
        </span>
      </div>

      {/* Body */}
      {isFocused && (
        <div style={{ padding: '0 0 4px 0' }}>
          <NodeTree nodes={entries} indent={16} maxDepth={showExtended ? undefined : 1} />
          {agents.map((agent, i) => (
            <div key={`ag-${i}`}>
              <AgentRow node={agent} indent={16} />
              {showExtended && agent.children && agent.children.length > 0 && (
                <NodeTree nodes={agent.children} indent={32} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sidebar ──

export function Sidebar() {
  const navSections = useNapStore((s) => s.navSections);
  const focusedCardSlug = useNapStore((s) => s.focusedCardSlug);
  const cardViewMode = useNapStore((s) => s.cardViewMode);
  const sidebarVisible = useNapStore((s) => s.sidebarVisible);
  const [showAll, setShowAll] = useState(false);

  // Resizable width
  const [width, setWidth] = useState(240);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(240);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      // Nav is on right, drag handle on left edge — dragging left increases width
      const delta = startX.current - ev.clientX;
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

  if (!sidebarVisible) return null;

  // Extract napkins from the nav tree
  const napkinsSection = navSections.find((s) => s.name.startsWith('30-napkins'));
  const napkins = napkinsSection?.children ?? [];

  const visibleNapkins = showAll ? napkins : napkins.slice(0, napkins.length > 0 ? napkins.length : 0);

  console.log(`[sidebar] render — ${napkins.map((n) => `${n.displayName} (${n.status ?? 'backlog'})`).join(', ') || 'empty'}`);

  return (
    <div
      data-testid="sidebar"
      style={{
        width,
        minWidth: 180,
        height: '100%',
        background: 'var(--nap-bg-secondary)',
        borderLeft: '1px solid var(--nap-border)',
        fontFamily: "'Menlo', 'Monaco', 'Consolas', monospace",
        fontSize: 13,
        lineHeight: 1.55,
        color: 'var(--nap-text-secondary)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Drag handle — left edge */}
      <div
        onMouseDown={onMouseDown}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 4,
          height: '100%',
          cursor: 'col-resize',
          zIndex: 10,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--nap-text-muted)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      />

      {/* Card list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0', scrollBehavior: 'smooth' }}>
        {napkins.length === 0 && (
          <div style={{ padding: '16px 12px', color: 'var(--nap-text-dim)', fontSize: 11 }}>
            Clone a .nap repo in the terminal to get started.
          </div>
        )}

        {visibleNapkins.map((napkin) => (
          <NapkinCard
            key={napkin.name}
            napkin={napkin}
            isFocused={focusedCardSlug === napkin.name}
            viewMode={cardViewMode}
          />
        ))}

        {napkins.length > 1 && !showAll && (
          <div
            onClick={() => setShowAll(true)}
            style={{ padding: '4px 12px 4px 21px', color: 'var(--nap-text-dim)', fontSize: 12, cursor: 'pointer', userSelect: 'none' }}
          >
            show others
          </div>
        )}
      </div>
    </div>
  );
}
