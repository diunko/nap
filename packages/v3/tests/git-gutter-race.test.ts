import { describe, it, expect, vi } from 'vitest';

// ── GG-04: Race fix — decorations applied to current model only ──
//
// The guard pattern in ContentPane.refreshGitGutter:
//   const model = editor.getModel();
//   const hunks = await electronAPI.fileGitDiff(filePath);
//   if (editor.getModel() !== model) return; // GUARD
//   applyGitGutter(editor, hunks, oldDecorations);
//
// We test this pattern in isolation: if the model changes during the async gap,
// decorations must NOT be applied.

describe('GG-04: Race fix — model identity guard', () => {
  it('decorations skipped when model changes during async gap', async () => {
    const modelA = { id: 'model-a' };
    const modelB = { id: 'model-b' };
    let currentModel: unknown = modelA;

    const mockEditor = {
      getModel: () => currentModel,
      deltaDecorations: vi.fn().mockReturnValue(['dec-1']),
    };

    const applyFn = vi.fn();

    // Simulate refreshGitGutter's async flow
    async function refreshGitGutter() {
      const model = mockEditor.getModel(); // capture before async
      // Simulate async gap — model changes during this time
      await new Promise((resolve) => setTimeout(resolve, 10));
      // Guard: check model identity
      if (mockEditor.getModel() !== model) return;
      applyFn(mockEditor);
    }

    // Switch model during the async gap
    const promise = refreshGitGutter();
    currentModel = modelB; // user switched tabs
    await promise;

    expect(applyFn).not.toHaveBeenCalled();
  });

  it('decorations applied when model stays the same', async () => {
    const modelA = { id: 'model-a' };
    let currentModel: unknown = modelA;

    const mockEditor = {
      getModel: () => currentModel,
    };

    const applyFn = vi.fn();

    async function refreshGitGutter() {
      const model = mockEditor.getModel();
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (mockEditor.getModel() !== model) return;
      applyFn(mockEditor);
    }

    await refreshGitGutter();

    expect(applyFn).toHaveBeenCalledTimes(1);
  });

  it('guard uses reference identity, not value equality', async () => {
    // Two different objects with same structure — guard should still pass
    // only when it's the SAME reference
    const modelA = { id: 'model-a' };
    const modelA2 = { id: 'model-a' }; // same shape, different reference
    let currentModel: unknown = modelA;

    const mockEditor = {
      getModel: () => currentModel,
    };

    const applyFn = vi.fn();

    async function refreshGitGutter() {
      const model = mockEditor.getModel();
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (mockEditor.getModel() !== model) return;
      applyFn();
    }

    const promise = refreshGitGutter();
    currentModel = modelA2; // different reference, same shape
    await promise;

    expect(applyFn).not.toHaveBeenCalled();
  });
});
