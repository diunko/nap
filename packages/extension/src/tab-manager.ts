/**
 * Tab manager — ephemeral/permanent tab lifecycle.
 * Ported from v3's TabBar.tsx behavior into a DOM-managing class.
 */

export interface Tab {
  id: string;
  path: string;
  label: string;
  ephemeral: boolean;
  type: 'file' | 'terminal';
}

export interface TabManagerCallbacks {
  onActivate: (tab: Tab) => void;
  onClose: (tab: Tab) => void;
}

export class TabManager {
  private tabs: Tab[] = [];
  private activeTabId: string | null = null;
  private container: HTMLElement;
  private callbacks: TabManagerCallbacks;

  constructor(container: HTMLElement, callbacks: TabManagerCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    // Terminal tab is always present
    this.tabs.push({
      id: 'terminal',
      path: '',
      label: 'Terminal',
      ephemeral: false,
      type: 'terminal',
    });
    this.activeTabId = 'terminal';
    this.render();
  }

  getActiveTab(): Tab | undefined {
    return this.tabs.find(t => t.id === this.activeTabId);
  }

  /** Open a file in an ephemeral tab (single-click from nav). */
  openEphemeral(path: string, label: string): void {
    // Reuse existing ephemeral tab
    const existing = this.tabs.find(t => t.ephemeral && t.type === 'file');
    if (existing) {
      existing.path = path;
      existing.label = label;
      existing.id = path;
      this.activeTabId = existing.id;
    } else {
      const tab: Tab = { id: path, path, label, ephemeral: true, type: 'file' };
      // Insert before terminal
      const termIdx = this.tabs.findIndex(t => t.type === 'terminal');
      if (termIdx >= 0) {
        this.tabs.splice(termIdx, 0, tab);
      } else {
        this.tabs.push(tab);
      }
      this.activeTabId = tab.id;
    }
    this.render();
    this.callbacks.onActivate(this.getActiveTab()!);
  }

  /** Open a file in a permanent tab (double-click or already open permanent). */
  openPermanent(path: string, label: string): void {
    const existing = this.tabs.find(t => t.path === path && t.type === 'file');
    if (existing) {
      existing.ephemeral = false;
      this.activeTabId = existing.id;
    } else {
      const tab: Tab = { id: path, path, label, ephemeral: false, type: 'file' };
      const termIdx = this.tabs.findIndex(t => t.type === 'terminal');
      if (termIdx >= 0) {
        this.tabs.splice(termIdx, 0, tab);
      } else {
        this.tabs.push(tab);
      }
      this.activeTabId = tab.id;
    }
    this.render();
    this.callbacks.onActivate(this.getActiveTab()!);
  }

  /** Pin the active ephemeral tab (called on editor content change). */
  pinActiveEphemeral(): void {
    const active = this.getActiveTab();
    if (active && active.ephemeral) {
      active.ephemeral = false;
      this.render();
    }
  }

  /** Activate a tab by id. */
  activate(tabId: string): void {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab) return;
    this.activeTabId = tabId;
    this.render();
    this.callbacks.onActivate(tab);
  }

  /** Activate the terminal tab specifically. */
  activateTerminal(): void {
    this.activate('terminal');
  }

  /** Close a tab. Cannot close terminal. */
  close(tabId: string): void {
    const tab = this.tabs.find(t => t.id === tabId);
    if (!tab || tab.type === 'terminal') return;

    const idx = this.tabs.indexOf(tab);
    this.tabs.splice(idx, 1);

    if (this.activeTabId === tabId) {
      // Activate neighbor or terminal
      const next = this.tabs[Math.min(idx, this.tabs.length - 1)];
      this.activeTabId = next?.id ?? 'terminal';
      this.callbacks.onActivate(this.getActiveTab()!);
    }

    this.render();
  }

  /** Render the tab bar DOM. */
  private render(): void {
    this.container.innerHTML = '';

    for (const tab of this.tabs) {
      const el = document.createElement('div');
      el.className = 'tab';
      el.dataset.tab = tab.type === 'terminal' ? 'terminal' : 'editor';

      if (tab.id === this.activeTabId) el.classList.add('active');
      if (tab.ephemeral) el.classList.add('ephemeral');

      const labelSpan = document.createElement('span');
      labelSpan.className = 'tab-label';
      labelSpan.textContent = tab.label;
      el.appendChild(labelSpan);

      if (tab.type !== 'terminal') {
        const closeSpan = document.createElement('span');
        closeSpan.className = 'tab-close';
        closeSpan.textContent = 'x';
        closeSpan.addEventListener('click', (e) => {
          e.stopPropagation();
          this.close(tab.id);
        });
        el.appendChild(closeSpan);
      }

      // Single click → activate
      el.addEventListener('click', () => {
        this.activate(tab.id);
      });

      // Double click → pin ephemeral
      el.addEventListener('dblclick', () => {
        if (tab.ephemeral) {
          tab.ephemeral = false;
          this.render();
        }
      });

      // Middle click → close
      el.addEventListener('mousedown', (e) => {
        if (e.button === 1 && tab.type !== 'terminal') {
          e.preventDefault();
          this.close(tab.id);
        }
      });

      this.container.appendChild(el);
    }
  }
}
