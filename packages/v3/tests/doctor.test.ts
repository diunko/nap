import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nap-doctor-test-'));
}

// Check if CLI binary exists — skip if not built
const cliPath = path.join(__dirname, '..', 'out', 'cli', 'cli', 'nap.js');
const cliBuilt = fs.existsSync(cliPath);

describe.skipIf(!cliBuilt)('nap3 doctor', () => {
  it('errors with correct message when no .nap/ found', () => {
    const tmpDir = makeTmpDir();
    try {
      const result = (() => {
        try {
          return execFileSync('node', [cliPath, 'doctor'], {
            cwd: tmpDir,
            timeout: 10000,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
        } catch (e: any) {
          return e;
        }
      })();

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Not a NAP project');
      expect(result.stderr).toContain('nap3 init');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('prompt assembly produces correct structure', () => {
    const templatesDir = path.join(__dirname, '..', 'src', 'templates');
    const diagnosticPath = path.join(templatesDir, 'doctor', 'diagnostic.md');
    const internalsPath = path.join(templatesDir, '00-org', '50-internals.md');

    // Both template files must exist
    expect(fs.existsSync(diagnosticPath)).toBe(true);
    expect(fs.existsSync(internalsPath)).toBe(true);

    const diagnosticContent = fs.readFileSync(diagnosticPath, 'utf-8');
    const internalsContent = fs.readFileSync(internalsPath, 'utf-8');

    // diagnostic.md must have the split marker
    const splitMarker = '## Your diagnostic process';
    const splitIndex = diagnosticContent.indexOf(splitMarker);
    expect(splitIndex).toBeGreaterThan(0);

    const preamble = diagnosticContent.slice(0, splitIndex).trimEnd();
    const diagnosticPhases = diagnosticContent.slice(splitIndex);

    // internals must have the content marker
    const internalsMarker = '## The two states';
    const internalsStart = internalsContent.indexOf(internalsMarker);
    expect(internalsStart).toBeGreaterThanOrEqual(0);
    const internalsBody = internalsContent.slice(internalsStart);

    // Assemble
    const combined = `${preamble}\n\n## System anatomy\n\n${internalsBody}\n\n---\n\n${diagnosticPhases}`;

    // Verify structure: preamble → system anatomy → internals → diagnostic phases
    const preambleEnd = combined.indexOf('## System anatomy');
    const internalsSection = combined.indexOf('## The two states');
    const phasesStart = combined.indexOf('## Your diagnostic process');

    expect(preambleEnd).toBeGreaterThan(0);
    expect(internalsSection).toBeGreaterThan(preambleEnd);
    expect(phasesStart).toBeGreaterThan(internalsSection);

    // Preamble should contain the doctor identity
    expect(preamble).toContain('project doctor');

    // Diagnostic phases should contain the phase headings
    expect(diagnosticPhases).toContain('Phase 1');
    expect(diagnosticPhases).toContain('Phase 7');
    expect(diagnosticPhases).toContain('## How to report');

    // Internals should contain key sections
    expect(internalsBody).toContain('.agent.nap.json');
    expect(internalsBody).toContain('.napkin.nap.json');
  });

  it('findTemplatesDir resolves from built CLI', () => {
    // The built CLI at out/cli/cli/nap.js should resolve to src/templates
    const fromBuilt = path.resolve(
      path.dirname(cliPath), '..', '..', '..', 'src', 'templates',
    );
    expect(fs.existsSync(fromBuilt)).toBe(true);
    expect(fs.existsSync(path.join(fromBuilt, 'doctor', 'diagnostic.md'))).toBe(true);
    expect(fs.existsSync(path.join(fromBuilt, '00-org', '50-internals.md'))).toBe(true);
  });

  it('shows help with --help flag', () => {
    const result = execFileSync('node', [cliPath, 'doctor', '--help'], {
      timeout: 10000,
      encoding: 'utf8',
    });
    expect(result).toContain('nap3 doctor');
    expect(result).toContain('Diagnose');
  });
});
