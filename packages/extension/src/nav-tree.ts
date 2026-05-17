/**
 * Nav tree parser — pure function that interprets .nap directory conventions.
 *
 * Exported separately for vitest (T4.1, T4.2).
 * No DOM, no LightningFS — takes directory listing data, returns tree model.
 */

// ── Tree model ──

export type NavNodeType = 'section' | 'napkin' | 'architect' | 'agent' | 'file';

export interface NavNode {
  type: NavNodeType;
  name: string;
  displayName: string;
  path: string;
  status?: string;       // napkin status from .napkin.nap.json
  children?: NavNode[];
  expanded?: boolean;
}

// ── Input types — what the caller provides ──

export interface DirEntry {
  name: string;
  isDirectory: boolean;
}

export interface NapkinStatus {
  status?: string;
}

/**
 * Callback to read a directory listing. The parser calls this for each level
 * it needs to descend into. Keeps the parser pure — caller provides the I/O.
 */
export type ReadDir = (path: string) => Promise<DirEntry[]>;

/**
 * Callback to read and parse a JSON file. Returns undefined if file doesn't exist.
 */
export type ReadJson = (path: string) => Promise<Record<string, unknown> | undefined>;

// ── Numeric prefix sorting ──

/** Extract numeric prefix from a directory name (e.g., "0100-feature" -> 100). */
export function numericPrefix(name: string): number {
  const match = name.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : Infinity;
}

/** Sort names by numeric prefix, then lexicographic. */
export function sortByPrefix(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const na = numericPrefix(a);
    const nb = numericPrefix(b);
    if (na !== nb) return na - nb;
    return a.localeCompare(b);
  });
}

// ── Section name mapping ──

const SECTION_LABELS: Record<string, string> = {
  '10-docs': 'docs',
  '15-feedback': 'feedback',
  '20-architects': 'architects',
  '30-napkins': 'napkins',
};

function sectionLabel(dirName: string): string {
  return SECTION_LABELS[dirName] ?? dirName.replace(/^\d+-/, '');
}

// ── Strip numeric prefix for display ──

function displayName(name: string): string {
  return name.replace(/^\d+-/, '');
}

// ── Parser ──

/**
 * Parse a .nap nepic directory into a nav tree.
 * `basePath` is the root of the nepic (e.g., "/home/user/repo/.nap/nepics/01-v1").
 *
 * Pure function — all I/O via readDir and readJson callbacks.
 */
export async function parseNavTree(
  basePath: string,
  readDir: ReadDir,
  readJson: ReadJson,
): Promise<NavNode[]> {
  console.log(`[nav-tree] parsing ${basePath}`);
  const sections: NavNode[] = [];

  let entries: DirEntry[];
  try {
    entries = await readDir(basePath);
  } catch (e) {
    console.log(`[nav-tree] failed to read ${basePath}:`, e);
    return [];
  }

  const dirs = entries.filter(e => e.isDirectory);
  const sortedDirs = sortByPrefix(dirs.map(d => d.name));
  console.log(`[nav-tree] found sections: ${sortedDirs.join(', ')}`);

  for (const dirName of sortedDirs) {
    const dirPath = `${basePath}/${dirName}`;

    if (dirName.startsWith('20-architects')) {
      const children = await parseArchitects(dirPath, readDir);
      sections.push({
        type: 'section',
        name: dirName,
        displayName: sectionLabel(dirName),
        path: dirPath,
        children,
        expanded: true,
      });
    } else if (dirName.startsWith('30-napkins')) {
      const children = await parseNapkins(dirPath, readDir, readJson);
      sections.push({
        type: 'section',
        name: dirName,
        displayName: sectionLabel(dirName),
        path: dirPath,
        children,
        expanded: true,
      });
    } else if (dirName.startsWith('10-docs') || dirName.startsWith('15-feedback')) {
      const children = await parseFileDir(dirPath, readDir);
      sections.push({
        type: 'section',
        name: dirName,
        displayName: sectionLabel(dirName),
        path: dirPath,
        children,
        expanded: false,
      });
    }
  }

  console.log(`[nav-tree] parsed ${sections.length} sections`);
  return sections;
}

async function parseArchitects(path: string, readDir: ReadDir): Promise<NavNode[]> {
  const entries = await readDir(path);
  const dirs = entries.filter(e => e.isDirectory);
  const sorted = sortByPrefix(dirs.map(d => d.name));

  const nodes: NavNode[] = [];
  for (const name of sorted) {
    const archPath = `${path}/${name}`;
    const children = await parseFileDir(archPath, readDir);
    nodes.push({
      type: 'architect',
      name,
      displayName: displayName(name),
      path: archPath,
      children,
      expanded: false,
    });
  }
  return nodes;
}

async function parseNapkins(path: string, readDir: ReadDir, readJson: ReadJson): Promise<NavNode[]> {
  const entries = await readDir(path);
  const dirs = entries.filter(e => e.isDirectory);
  const sorted = sortByPrefix(dirs.map(d => d.name));

  const nodes: NavNode[] = [];
  for (const name of sorted) {
    const napkinPath = `${path}/${name}`;

    // Read status from .napkin.nap.json
    const statusData = await readJson(`${napkinPath}/.napkin.nap.json`) as NapkinStatus | undefined;
    const status = statusData?.status;
    console.log(`[nav-tree] napkin ${name} status=${status}`);

    // Children: .nap.md, .spec.md, .stories.md, .test.md, agents/
    const napkinEntries = await readDir(napkinPath);
    const children: NavNode[] = [];

    // Files (sorted)
    const files = napkinEntries.filter(e => !e.isDirectory && !e.name.startsWith('.'));
    const sortedFiles = sortByPrefix(files.map(f => f.name));
    for (const fname of sortedFiles) {
      children.push({
        type: 'file',
        name: fname,
        displayName: fname,
        path: `${napkinPath}/${fname}`,
      });
    }

    // Agents subdirectory
    const agentsDir = napkinEntries.find(e => e.isDirectory && e.name === 'agents');
    if (agentsDir) {
      const agentChildren = await parseAgents(`${napkinPath}/agents`, readDir);
      children.push({
        type: 'section',
        name: 'agents',
        displayName: 'agents',
        path: `${napkinPath}/agents`,
        children: agentChildren,
        expanded: false,
      });
    }

    nodes.push({
      type: 'napkin',
      name,
      displayName: displayName(name),
      path: napkinPath,
      status,
      children,
      expanded: false,
    });
  }
  return nodes;
}

async function parseAgents(path: string, readDir: ReadDir): Promise<NavNode[]> {
  const entries = await readDir(path);
  const dirs = entries.filter(e => e.isDirectory);
  const sorted = sortByPrefix(dirs.map(d => d.name));

  const nodes: NavNode[] = [];
  for (const name of sorted) {
    const agentPath = `${path}/${name}`;
    const children = await parseFileDir(agentPath, readDir);
    nodes.push({
      type: 'agent',
      name,
      displayName: displayName(name),
      path: agentPath,
      children,
      expanded: false,
    });
  }
  return nodes;
}

async function parseFileDir(path: string, readDir: ReadDir): Promise<NavNode[]> {
  let entries: DirEntry[];
  try {
    entries = await readDir(path);
  } catch {
    return [];
  }

  const nodes: NavNode[] = [];

  // Directories first
  const dirs = entries.filter(e => e.isDirectory && !e.name.startsWith('.'));
  const sortedDirs = sortByPrefix(dirs.map(d => d.name));
  for (const name of sortedDirs) {
    const children = await parseFileDir(`${path}/${name}`, readDir);
    nodes.push({
      type: 'section',
      name,
      displayName: name,
      path: `${path}/${name}`,
      children,
      expanded: false,
    });
  }

  // Files
  const files = entries.filter(e => !e.isDirectory && !e.name.startsWith('.'));
  const sortedFiles = sortByPrefix(files.map(f => f.name));
  for (const fname of sortedFiles) {
    nodes.push({
      type: 'file',
      name: fname,
      displayName: fname,
      path: `${path}/${fname}`,
    });
  }

  return nodes;
}
