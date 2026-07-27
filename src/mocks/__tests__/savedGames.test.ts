import { describe, it, expect, beforeEach } from 'vitest';
import { handleSaveGame, _debugSavedGamesStore } from '../handlers/savedGames';
import { savedGameResponseSchema } from '../schemas/savedGame';

describe('savedGames handler', () => {
  beforeEach(() => {
    _debugSavedGamesStore().clear();
  });

  it('PUT /savedGames/:id with valid body returns 200 + updatedAt', () => {
    const res = handleSaveGame('/savedGames/save_001', {
      anonymousUserId: 'user_abc',
      puzzleId: 'puzzle_001',
      currentBoard: new Array(81).fill(0),
      notes: { '5': [1, 2, 3] },
      elapsedSeconds: 60,
      mistakes: 0,
    });
    expect(res.status).toBe(200);
    const parsed = savedGameResponseSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.id).toBe('save_001');
      expect(new Date(parsed.data.updatedAt).getTime()).not.toBeNaN();
    }
  });

  it('rejects invalid body', () => {
    const res = handleSaveGame('/savedGames/save_002', { anonymousUserId: 'x' /* missing fields */ });
    expect(res.status).toBe(400);
  });

  it('rejects invalid board length', () => {
    const res = handleSaveGame('/savedGames/save_003', {
      anonymousUserId: 'user_abc',
      puzzleId: 'puzzle_001',
      currentBoard: [1, 2, 3], // 短い
      notes: {},
      elapsedSeconds: 0,
      mistakes: 0,
    });
    expect(res.status).toBe(400);
  });
});
