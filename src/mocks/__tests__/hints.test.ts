import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handleGeneratePuzzle, _debugPuzzleCache } from '../handlers/puzzles';
import { handleRequestHint, _setHintErrorRate } from '../handlers/hints';
import { hintResponseSchema, HintResponse } from '../schemas/hint';
import { puzzleObjectSchema } from '../schemas/puzzle';
import { verifyHint } from '@/engine/hintVerifier';
import type { Board, NonEmptyDigit } from '@/types/domain';

describe('hints handler', () => {
  let restoreRate = 0;
  beforeEach(() => {
    _debugPuzzleCache().clear();
    // 各テストでエラー注入率を明示的に設定 (テスト毎に個別 override)
    restoreRate = _setHintErrorRate(0);
  });
  afterEach(() => {
    _setHintErrorRate(restoreRate);
  });

  function makeFreshPuzzle() {
    const gen = handleGeneratePuzzle({ difficulty: 'easy' });
    return puzzleObjectSchema.parse(gen.body);
  }

  it('returns schema-valid strong hint', () => {
    _setHintErrorRate(0);   // エラー注入無効化
    const p = makeFreshPuzzle();
    const res = handleRequestHint({
      puzzleId: p.id,
      currentBoard: p.puzzle,
      level: 'strong',
      difficulty: 'easy',
    });
    expect(res.status).toBe(200);
    const parsed = hintResponseSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
  }, 20000);

  it('returns empty hint when currentBoard is unsolvable', () => {
    _setHintErrorRate(0);
    // 矛盾盤面 (同じ行に 1 が 2 個)
    const bad = new Array(81).fill(0) as number[];
    bad[0] = 1; bad[1] = 1;
    const res = handleRequestHint({
      puzzleId: 'ignored-by-mock',
      currentBoard: bad,
      level: 'strong',
      difficulty: 'easy',
    });
    expect(res.status).toBe(200);
    const parsed = hintResponseSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // 空セル無し扱いで、cell/number は無し
      expect(parsed.data.cell).toBeUndefined();
      expect(parsed.data.number).toBeUndefined();
    }
  });

  it('rejects invalid request body', () => {
    const res = handleRequestHint({ garbage: true });
    expect(res.status).toBe(400);
  });

  it('good hint passes engine.verifyHint (信用境界: 正常ケース)', () => {
    _setHintErrorRate(0);   // エラー注入無効化
    const p = makeFreshPuzzle();
    const res = handleRequestHint({
      puzzleId: p.id,
      currentBoard: p.puzzle,
      level: 'strong',
      difficulty: 'easy',
    });
    const hint = hintResponseSchema.parse(res.body) as HintResponse & {
      cell: NonNullable<HintResponse['cell']>;
      number: NonNullable<HintResponse['number']>;
    };
    const verdict = verifyHint(
      p.puzzle as Board,
      p.puzzle as Board,
      p.solution as Board,
      { cell: hint.cell, number: hint.number as NonEmptyDigit }
    );
    expect(verdict.ok).toBe(true);
  }, 20000);

  it('injected error hint is rejected by engine.verifyHint (信用境界: 異常ケース)', () => {
    _setHintErrorRate(1);   // 常に注入
    const p = makeFreshPuzzle();
    const res = handleRequestHint({
      puzzleId: p.id,
      currentBoard: p.puzzle,
      level: 'strong',
      difficulty: 'easy',
    });
    const hint = hintResponseSchema.parse(res.body) as HintResponse & {
      cell: NonNullable<HintResponse['cell']>;
      number: NonNullable<HintResponse['number']>;
    };
    const verdict = verifyHint(
      p.puzzle as Board,
      p.puzzle as Board,
      p.solution as Board,
      { cell: hint.cell, number: hint.number as NonEmptyDigit }
    );
    // 意図的エラー注入なので必ず reject される (NOT_IN_SOLUTION か CONFLICT)
    expect(verdict.ok).toBe(false);
  }, 20000);

  it('focusCell (empty) is respected — hint targets that exact cell', () => {
    _setHintErrorRate(0);
    const p = makeFreshPuzzle();
    // p.puzzle から最初の空セルを見つける
    let firstEmpty = -1;
    for (let i = 0; i < 81; i++) if (p.puzzle[i] === 0) { firstEmpty = i; break; }
    expect(firstEmpty).toBeGreaterThanOrEqual(0);
    const row = Math.floor(firstEmpty / 9);
    const col = firstEmpty % 9;
    const res = handleRequestHint({
      puzzleId: p.id,
      currentBoard: p.puzzle,
      level: 'strong',
      difficulty: 'easy',
      focusCell: { row, col },
    });
    const hint = hintResponseSchema.parse(res.body);
    expect(hint.cell).toEqual({ row, col });
    expect(hint.number).toBe(p.solution[firstEmpty]);
  }, 20000);

  it('focusCell on already-filled cell falls back to random empty', () => {
    _setHintErrorRate(0);
    const p = makeFreshPuzzle();
    // p.puzzle で埋まっているセルを探す
    let firstFilled = -1;
    for (let i = 0; i < 81; i++) if (p.puzzle[i] !== 0) { firstFilled = i; break; }
    expect(firstFilled).toBeGreaterThanOrEqual(0);
    const res = handleRequestHint({
      puzzleId: p.id,
      currentBoard: p.puzzle,
      level: 'strong',
      difficulty: 'easy',
      focusCell: { row: Math.floor(firstFilled / 9), col: firstFilled % 9 },
    });
    const hint = hintResponseSchema.parse(res.body);
    // 埋まっているセルは避けられる
    expect(hint.cell).toBeDefined();
    const returnedIdx = hint.cell!.row * 9 + hint.cell!.col;
    expect(p.puzzle[returnedIdx]).toBe(0);   // 空マスが返る
  }, 20000);

  it('weak level omits cell and number', () => {
    _setHintErrorRate(0);
    const p = makeFreshPuzzle();
    const res = handleRequestHint({
      puzzleId: p.id,
      currentBoard: p.puzzle,
      level: 'weak',
      difficulty: 'easy',
    });
    const hint = hintResponseSchema.parse(res.body);
    expect(hint.cell).toBeUndefined();
    expect(hint.number).toBeUndefined();
    expect(hint.explanation_i18n.ja).toBeTruthy();
  }, 20000);
});
