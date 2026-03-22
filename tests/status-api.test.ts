import { describe, test, expect } from 'vitest';
import { statusToDir } from '../src/main/napkin-store';

// T1: Status-to-dir mapping — pure function
describe('T1: statusToDir mapping', () => {
  test('backlog → 20-backlog', () => {
    expect(statusToDir('backlog')).toBe('20-backlog');
  });

  test('todo → 30-todo', () => {
    expect(statusToDir('todo')).toBe('30-todo');
  });

  test('doing → 40-doing', () => {
    expect(statusToDir('doing')).toBe('40-doing');
  });

  test('review → 50-review', () => {
    expect(statusToDir('review')).toBe('50-review');
  });

  test('done → 60-done', () => {
    expect(statusToDir('done')).toBe('60-done');
  });

  test('invalid status throws', () => {
    expect(() => statusToDir('shipped')).toThrow('Invalid status: shipped');
  });

  test('empty string throws', () => {
    expect(() => statusToDir('')).toThrow('Invalid status: ');
  });
});
