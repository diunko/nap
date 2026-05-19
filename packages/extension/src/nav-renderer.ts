/**
 * Nav renderer — card system DOM rendering for the nav sidebar.
 * Takes NavNode[] from parseNavTree, returns DOM elements matching mock-e design.
 *
 * Responsibilities:
 * - Napkin cards: collapsed/focused/extended with blue accent border
 * - Agent dots: color = role, shape = status (filled/dashed-check/hollow)
 * - File rows: * bullet + name, .md in link color, main file bold
 * - Agents flattened (skip agents/ dir, hoist children)
 * - Show-all toggle for non-focused napkins
 */

import { type NavNode } from './nav-tree';
import { getDotStyle, getPhaseColor, type DotStyle } from './dot-style';

export interface NavRendererCallbacks {
  onFileClick: (path: string, fileName: string) => void;
  onTerminalClick: () => void;
}

interface AgentMeta {
  role: string;
  running: boolean;
  done: boolean;
  exited: boolean;
  archived: boolean;
}

/** Read agent metadata from .agent.nap.json stored in NavNode tree. */
function extractAgentMeta(agentNode: NavNode, jsonCache: Map<string, Record<string, unknown>>): AgentMeta {
  const jsonPath = `${agentNode.path}/.agent.nap.json`;
  const data = jsonCache.get(jsonPath);
  return {
    role: (data?.role as string) ?? 'architect',
    running: !!(data?.started) && !(data?.exited),
    done: !!(data?.done),
    exited: !!(data?.exited),
    archived: !!(data?.archived),
  };
}

export class NavRenderer {
  private container: HTMLElement;
  private callbacks: NavRendererCallbacks;
  private focusedCardSlug: string | null = null;
  private showAll = false;
  private jsonCache = new Map<string, Record<string, unknown>>();
  private allNapkins: NavNode[] = [];
  private activeFilePath: string | null = null;

  constructor(container: HTMLElement, callbacks: NavRendererCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
  }

  /** Store JSON data for agent metadata lookup. */
  setJsonCache(cache: Map<string, Record<string, unknown>>): void {
    this.jsonCache = cache;
  }

  /** Set active file for highlighting in nav. */
  setActiveFile(path: string | null): void {
    this.activeFilePath = path;
    // Re-highlight without full re-render
    this.container.querySelectorAll('.file-row').forEach(row => {
      const rowPath = (row as HTMLElement).dataset.path;
      row.classList.toggle('active', rowPath === path);
    });
  }

  /** Render nav tree from sections. Expects the output of parseNavTree. */
  render(sections: NavNode[]): void {
    this.container.innerHTML = '';

    // Find the napkins section
    const napkinsSection = sections.find(s => s.name.startsWith('30-napkins'));
    this.allNapkins = napkinsSection?.children ?? [];

    if (this.allNapkins.length === 0) return;

    // Auto-focus first napkin if none focused
    if (!this.focusedCardSlug && this.allNapkins.length > 0) {
      this.focusedCardSlug = this.allNapkins[0].name;
    }

    // Render focused napkin card
    const focused = this.allNapkins.find(n => n.name === this.focusedCardSlug);
    if (focused) {
      this.container.appendChild(this.renderNapkinCard(focused, true));
    }

    // Separator + show-all toggle + other napkins
    if (this.allNapkins.length > 1) {
      this.container.appendChild(this.createSeparator());

      // Other napkins (collapsed, hidden by default)
      const otherCards = document.createElement('div');
      otherCards.id = 'other-napkins';
      otherCards.style.display = this.showAll ? '' : 'none';
      for (const napkin of this.allNapkins) {
        if (napkin.name === this.focusedCardSlug) continue;
        otherCards.appendChild(this.renderNapkinCard(napkin, false));
      }
      this.container.appendChild(otherCards);

      // Toggle
      const toggle = document.createElement('div');
      toggle.className = 'show-all-toggle';
      toggle.textContent = this.showAll ? 'hide others' : 'show all';
      toggle.addEventListener('click', () => {
        this.showAll = !this.showAll;
        otherCards.style.display = this.showAll ? '' : 'none';
        toggle.textContent = this.showAll ? 'hide others' : 'show all';
      });
      this.container.appendChild(toggle);
    }
  }

  private renderNapkinCard(napkin: NavNode, isFocused: boolean): HTMLElement {
    const card = document.createElement('div');
    card.className = 'napkin-card' + (isFocused ? ' focused' : '');
    card.id = `card-${napkin.name}`;

    // Header
    const header = this.renderCardHeader(napkin);
    header.addEventListener('click', () => {
      if (this.focusedCardSlug === napkin.name) {
        // Unfocus
        this.focusedCardSlug = null;
      } else {
        this.focusedCardSlug = napkin.name;
      }
      // Re-render all
      this.render(this.lastSections);
    });
    card.appendChild(header);

    // Body (only if focused)
    if (isFocused) {
      const body = this.renderCardBody(napkin);
      card.appendChild(body);
    }

    return card;
  }

  private lastSections: NavNode[] = [];

  /** Override render to cache sections for re-render on focus change. */
  renderWithCache(sections: NavNode[]): void {
    this.lastSections = sections;
    this.render(sections);
  }

  private renderCardHeader(napkin: NavNode): HTMLElement {
    const header = document.createElement('div');
    header.className = 'card-header';

    const bullet = document.createElement('span');
    bullet.className = 'bullet';
    bullet.textContent = '*';
    header.appendChild(bullet);

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = napkin.name;
    if (this.focusedCardSlug === napkin.name) {
      name.style.color = 'var(--nap-text)';
    }
    header.appendChild(name);

    // Agent dots in header
    const agents = this.collectAgents(napkin);
    if (agents.length > 0) {
      const dots = document.createElement('span');
      dots.className = 'dots';
      for (const agent of agents) {
        const meta = extractAgentMeta(agent, this.jsonCache);
        const style = getDotStyle(meta);
        dots.appendChild(this.createSmallDot(style));
      }
      header.appendChild(dots);
    }

    // Phase
    if (napkin.status) {
      const phase = document.createElement('span');
      phase.className = 'phase';
      phase.style.color = getPhaseColor(napkin.status);
      phase.textContent = napkin.status;
      header.appendChild(phase);
    }

    return header;
  }

  private renderCardBody(napkin: NavNode): HTMLElement {
    const body = document.createElement('div');
    body.className = 'card-body';

    if (!napkin.children) return body;

    // Separate files, dirs, and agents
    const files: NavNode[] = [];
    const dirs: NavNode[] = [];
    const agents: NavNode[] = [];

    for (const child of napkin.children) {
      if (child.type === 'file') {
        files.push(child);
      } else if (child.name === 'agents' && child.type === 'section') {
        // Flatten: hoist agent children up
        if (child.children) {
          agents.push(...child.children);
        }
      } else if (child.type === 'section') {
        dirs.push(child);
      }
    }

    // Main file first (the .nap.md)
    const mainFile = files.find(f => f.name.endsWith('.nap.md'));
    if (mainFile) {
      body.appendChild(this.renderFileRow(mainFile, true, 16));
    }

    // Other files
    for (const f of files) {
      if (f === mainFile) continue;
      body.appendChild(this.renderFileRow(f, false, 16));
    }

    // Directories with their children
    for (const dir of dirs) {
      body.appendChild(this.renderDirRow(dir, 16));
      if (dir.children) {
        for (const child of dir.children) {
          if (child.type === 'file') {
            body.appendChild(this.renderFileRow(child, false, 32));
          } else if (child.type === 'section' && child.children) {
            body.appendChild(this.renderDirRow(child, 32));
            for (const grandchild of child.children) {
              if (grandchild.type === 'file') {
                body.appendChild(this.renderFileRow(grandchild, false, 48));
              }
            }
          }
        }
      }
    }

    // Agents (flattened from agents/ dir)
    for (const agent of agents) {
      const meta = extractAgentMeta(agent, this.jsonCache);
      body.appendChild(this.renderAgentRow(agent, meta, 16));

      // Agent files
      if (agent.children) {
        // Terminal entry
        body.appendChild(this.renderTerminalEntry(32));

        for (const child of agent.children) {
          if (child.type === 'file') {
            body.appendChild(this.renderFileRow(child, false, 32));
          }
        }
      }
    }

    return body;
  }

  private renderFileRow(node: NavNode, isMain: boolean, indent: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'file-row';
    row.style.paddingLeft = indent + 'px';
    row.dataset.path = node.path;

    if (node.path === this.activeFilePath) {
      row.classList.add('active');
    }

    const bullet = document.createElement('span');
    bullet.className = 'bullet';
    bullet.textContent = '*';
    row.appendChild(bullet);

    const fname = document.createElement('span');
    fname.className = 'fname';
    fname.textContent = node.displayName;

    if (isMain) {
      fname.classList.add('is-main');
    } else if (node.name.endsWith('.md')) {
      fname.classList.add('is-link');
    }
    row.appendChild(fname);

    row.addEventListener('click', () => {
      this.callbacks.onFileClick(node.path, node.displayName);
    });

    return row;
  }

  private renderDirRow(node: NavNode, indent: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'dir-row';
    row.style.paddingLeft = indent + 'px';

    const bullet = document.createElement('span');
    bullet.className = 'bullet';
    bullet.textContent = '*';
    row.appendChild(bullet);

    const dname = document.createElement('span');
    dname.className = 'dname';
    dname.textContent = node.displayName.endsWith('/') ? node.displayName : node.displayName + '/';
    row.appendChild(dname);

    return row;
  }

  private renderAgentRow(agent: NavNode, meta: AgentMeta, indent: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'agent-row';
    row.style.paddingLeft = indent + 'px';

    const dotWrap = document.createElement('span');
    dotWrap.className = 'dot-wrap';
    const style = getDotStyle(meta);
    dotWrap.appendChild(this.createLargeDot(style));
    row.appendChild(dotWrap);

    const name = document.createElement('span');
    name.className = 'agent-name';
    name.textContent = agent.displayName + '/';
    row.appendChild(name);

    const status = document.createElement('span');
    status.className = 'agent-status';
    status.style.color = style.color;
    if (meta.done) status.textContent = 'done';
    else if (meta.running) status.textContent = 'run';
    else if (meta.exited) status.textContent = 'exit';
    row.appendChild(status);

    return row;
  }

  private renderTerminalEntry(indent: number): HTMLElement {
    const entry = document.createElement('div');
    entry.className = 'terminal-entry';
    entry.style.paddingLeft = indent + 'px';

    const bullet = document.createElement('span');
    bullet.className = 'bullet';
    bullet.textContent = '*';
    entry.appendChild(bullet);

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = '[terminal]';
    entry.appendChild(label);

    entry.addEventListener('click', () => {
      this.callbacks.onTerminalClick();
    });

    return entry;
  }

  /** Collect all agent nodes from a napkin (inside agents/ section). */
  private collectAgents(napkin: NavNode): NavNode[] {
    const agentsSection = napkin.children?.find(c => c.name === 'agents' && c.type === 'section');
    return agentsSection?.children ?? [];
  }

  /** Small dot for card header (7px). */
  private createSmallDot(style: DotStyle): HTMLElement {
    const dot = document.createElement('span');
    dot.className = 'dot';

    if (style.shape === 'filled') {
      dot.classList.add('filled');
      dot.style.width = '8px';
      dot.style.height = '8px';
      dot.style.background = style.color;
      dot.style.border = '2px solid transparent';
    } else if (style.shape === 'dashed-check') {
      dot.classList.add('dashed');
      dot.style.width = '7px';
      dot.style.height = '7px';
      dot.style.border = `2px dashed ${style.color}`;
      dot.innerHTML = this.checkmarkSvg(style.color, 5);
    } else {
      dot.classList.add('hollow');
      dot.style.width = '7px';
      dot.style.height = '7px';
      dot.style.border = `2px solid ${style.color}`;
    }

    return dot;
  }

  /** Large dot for agent row (8px). */
  private createLargeDot(style: DotStyle): HTMLElement {
    const dot = document.createElement('span');
    dot.className = 'dot';

    if (style.shape === 'filled') {
      dot.classList.add('filled');
      dot.style.width = '8px';
      dot.style.height = '8px';
      dot.style.background = style.color;
      dot.style.border = '2px solid transparent';
    } else if (style.shape === 'dashed-check') {
      dot.classList.add('dashed');
      dot.style.width = '8px';
      dot.style.height = '8px';
      dot.style.border = `2px dashed ${style.color}`;
      dot.innerHTML = this.checkmarkSvg(style.color, 6);
    } else {
      dot.classList.add('hollow');
      dot.style.width = '8px';
      dot.style.height = '8px';
      dot.style.border = `2px solid ${style.color}`;
    }

    return dot;
  }

  private checkmarkSvg(color: string, size: number): string {
    return `<svg width="${size}" height="${size}" viewBox="0 0 6 6"><path d="M1 3.2 L2.3 4.5 L5 1.5" stroke="${color}" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  private createSeparator(): HTMLElement {
    const sep = document.createElement('div');
    sep.className = 'nav-separator';
    return sep;
  }
}
