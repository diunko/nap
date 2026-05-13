import { describe, it, expect } from 'vitest';
import { route } from '../src/renderer/routing-rules';

describe('Routing rules', () => {
  // T-0100-R01: .nap file → left pane, Monaco
  describe('R01: .nap file → left pane, Monaco', () => {
    it('routes .nap/nepics path to left/monaco', () => {
      const result = route({ filePath: '.nap/nepics/01-v1/30-napkins/0100-feature/0100-feature.nap.md' });
      expect(result).toEqual({ pane: 'left', surface: 'monaco' });
    });

    it('routes .nap/00-org path to left/monaco', () => {
      const result = route({ filePath: '.nap/00-org/10-promise.nap.md' });
      expect(result).toEqual({ pane: 'left', surface: 'monaco' });
    });

    it('routes .nap scratch draft to left/monaco', () => {
      const result = route({ filePath: '.nap/nepics/01-v1/20-architects/001-architect/scratch/draft-02.md' });
      expect(result).toEqual({ pane: 'left', surface: 'monaco' });
    });

    it('routes absolute path with .nap segment to left/monaco', () => {
      const result = route({ filePath: '/Users/dev/project/.nap/nepics/01-v1/30-napkins/0100-feature/spec.md' });
      expect(result).toEqual({ pane: 'left', surface: 'monaco' });
    });
  });

  // T-0100-R02: Agent click → right pane, terminal
  describe('R02: Agent click → right pane, terminal', () => {
    it('routes agent with started=true to right/terminal', () => {
      const result = route({ agent: { id: 'uuid-1', started: true } });
      expect(result).toEqual({ pane: 'right', surface: 'terminal' });
    });

    it('routes agent with started=false to right/terminal', () => {
      const result = route({ agent: { id: 'uuid-2', started: false } });
      expect(result).toEqual({ pane: 'right', surface: 'terminal' });
    });
  });

  // T-0100-R03: Fallback → right pane
  describe('R03: Fallback → right pane', () => {
    it('routes non-.nap file to right/terminal', () => {
      const result = route({ filePath: '/some/code/file.ts' });
      expect(result).toEqual({ pane: 'right', surface: 'terminal' });
    });

    it('routes empty context to right/terminal', () => {
      const result = route({});
      expect(result).toEqual({ pane: 'right', surface: 'terminal' });
    });
  });

  // T-0100-R04: Edge cases — paths that look like .nap but aren't
  describe('R04: Paths that look like .nap but are not', () => {
    it('snapshot.ts does NOT route to left', () => {
      const result = route({ filePath: 'snapshot.ts' });
      expect(result).toEqual({ pane: 'right', surface: 'terminal' });
    });

    it('.nappy directory does NOT route to left', () => {
      const result = route({ filePath: '/foo/.nappy/bar.md' });
      expect(result).toEqual({ pane: 'right', surface: 'terminal' });
    });

    it('kidnap directory does NOT route to left', () => {
      const result = route({ filePath: '/foo/kidnap/notes.md' });
      expect(result).toEqual({ pane: 'right', surface: 'terminal' });
    });

    it('my-nap-notes.md does NOT route to left', () => {
      const result = route({ filePath: 'my-nap-notes.md' });
      expect(result).toEqual({ pane: 'right', surface: 'terminal' });
    });
  });
});
