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
      solution: p.solution,
      level: 'strong',
      difficulty: 'easy',
    });
    expect(res.status).toBe(200);
    const parsed = hintResponseSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
  }, 20000);

  it('board with single wrong cell returns correction hint', () => {
    _setHintErrorRate(0);
    const p = makeFreshPuzzle();
    // 空マスを 1 つ見つけて誤値を入れる (solution と違う値)
    let target = -1;
    for (let i = 0; i < 81; i++) if (p.puzzle[i] === 0) { target = i; break; }
    expect(target).toBeGreaterThanOrEqual(0);
    const wrongValue = p.solution[target] === 1 ? 2 : 1;
    const bad = [...p.puzzle];
    bad[target] = wrongValue;

    const res = handleRequestHint({
      puzzleId: p.id,
      currentBoard: bad,
      solution: p.solution,
      level: 'strong',
      difficulty: 'easy',
      focusCell: { row: Math.floor(target / 9), col: target % 9 },
    });
    expect(res.status).toBe(200);
    const parsed = hintResponseSchema.safeParse(res.body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // focusCell で指定した誤りセルが訂正対象になる
      expect(parsed.data.isCorrection).toBe(true);
      expect(parsed.data.cell).toEqual({ row: Math.floor(target / 9), col: target % 9 });
      expect(parsed.data.number).toBe(p.solution[target]);
    }
  });

  it('board with MULTIPLE wrong cells still returns a usable hint (regression: 旧版は「提示不可」になっていた)', () => {
    _setHintErrorRate(0);
    const p = makeFreshPuzzle();
    // 空マスを 3 つ見つけて全部誤値を入れる (盤面矛盾)
    const targets: number[] = [];
    for (let i = 0; i < 81 && targets.length < 3; i++) if (p.puzzle[i] === 0) targets.push(i);
    expect(targets.length).toBe(3);
    const bad = [...p.puzzle];
    for (const idx of targets) {
      const correct = p.solution[idx]!;
      bad[idx] = correct === 1 ? 2 : 1;   // 敢えて間違い
    }

    const res = handleRequestHint({
      puzzleId: p.id,
      currentBoard: bad,
      solution: p.solution,
      level: 'strong',
      difficulty: 'easy',
    });
    expect(res.status).toBe(200);
    const parsed = hintResponseSchema.parse(res.body);
    // 誤りセル or 空マスのどちらかの hint が来る。number は必ず定義。
    expect(parsed.cell).toBeDefined();
    expect(parsed.number).toBeDefined();
    // 返された cell が誤りセルなら isCorrection=true、空マスなら未指定 (false)。
    const returnedIdx = parsed.cell!.row * 9 + parsed.cell!.col;
    const isTargetWrong = targets.includes(returnedIdx);
    if (isTargetWrong) {
      expect(parsed.isCorrection).toBe(true);
      expect(parsed.number).toBe(p.solution[returnedIdx]);
    } else {
      // 空マスへの通常 hint
      expect(bad[returnedIdx]).toBe(0);
      expect(parsed.number).toBe(p.solution[returnedIdx]);
    }
  });

  it('rejects invalid request body', () => {
    const res = handleRequestHint({ garbage: true });
    expect(res.status).toBe(400);
  });

  it('rejects request without solution field (regression: solution 必須化)', () => {
    const p = makeFreshPuzzle();
    const res = handleRequestHint({
      puzzleId: p.id,
      currentBoard: p.puzzle,
      // solution 未指定
      level: 'strong',
      difficulty: 'easy',
    });
    expect(res.status).toBe(400);
  });

  it('good hint passes engine.verifyHint (信用境界: 正常ケース)', () => {
    _setHintErrorRate(0);   // エラー注入無効化
    const p = makeFreshPuzzle();
    const res = handleRequestHint({
      puzzleId: p.id,
      currentBoard: p.puzzle,
      solution: p.solution,
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
      solution: p.solution,
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
      solution: p.solution,
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
      solution: p.solution,
      level: 'strong',
      difficulty: 'easy',
      focusCell: { row: Math.floor(firstFilled / 9), col: firstFilled % 9 },
    });
    const hint = hintResponseSchema.parse(res.body);
    // 埋まっているセルは避けられる (initial cell は正解済みなので誤り扱いにもならない)
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
      solution: p.solution,
      level: 'weak',
      difficulty: 'easy',
    });
    const hint = hintResponseSchema.parse(res.body);
    expect(hint.cell).toBeUndefined();
    expect(hint.number).toBeUndefined();
    expect(hint.explanation_i18n.ja).toBeTruthy();
  }, 20000);
});
