import { describe, it, expect } from 'vitest';
import { classifyByClueCount, CLUE_RANGES } from './difficulty';

describe('classifyByClueCount', () => {
  it('40 -> easy', () => expect(classifyByClueCount(40)).toBe('easy'));
  it('32 -> medium', () => expect(classifyByClueCount(32)).toBe('medium'));
  it('26 -> hard', () => expect(classifyByClueCount(26)).toBe('hard'));
  it('boundaries', () => {
    expect(classifyByClueCount(36)).toBe('easy');
    expect(classifyByClueCount(35)).toBe('medium');
    expect(classifyByClueCount(30)).toBe('medium');
    expect(classifyByClueCount(29)).toBe('hard');
  });
  it('CLUE_RANGES exported', () => {
    expect(CLUE_RANGES.easy.min).toBe(36);
  });
});
