import { describe, it, expect } from 'vitest';
import { gameReducer, initialState } from './gameReducer';
import { Board } from '@/types/domain';

const emptyBoard: Board = new Array(81).fill(0);

describe('gameReducer', () => {
  it('START_GAME sets boards and status', () => {
    const puzzle: Board = [...emptyBoard]; (puzzle as any)[0] = 5;
    const solution: Board = [...emptyBoard]; (solution as any)[0] = 5;
    const s = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle, solution },
    });
    expect(s.status).toBe('playing');
    expect(s.initialBoard[0]).toBe(5);
    expect(s.currentBoard[0]).toBe(5);
  });

  it('INPUT_NUMBER on initial cell is a no-op', () => {
    const puzzle: Board = [...emptyBoard]; (puzzle as any)[0] = 5;
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle, solution: puzzle },
    });
    const s = gameReducer({ ...start, selectedCell: 0 }, { type: 'INPUT_NUMBER', payload: { value: 7 } });
    expect(s.currentBoard[0]).toBe(5);
  });

  it('INPUT_NUMBER on empty cell writes value and pushes history', () => {
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle: emptyBoard, solution: emptyBoard },
    });
    const s = gameReducer({ ...start, selectedCell: 5 }, { type: 'INPUT_NUMBER', payload: { value: 3 } });
    expect(s.currentBoard[5]).toBe(3);
    expect(s.history.length).toBe(1);
  });

  it('UNDO reverts last input', () => {
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle: emptyBoard, solution: emptyBoard },
    });
    const s1 = gameReducer({ ...start, selectedCell: 5 }, { type: 'INPUT_NUMBER', payload: { value: 3 } });
    const s2 = gameReducer(s1, { type: 'UNDO' });
    expect(s2.currentBoard[5]).toBe(0);
    expect(s2.future.length).toBe(1);
  });

  it('REDO reapplies undone action', () => {
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle: emptyBoard, solution: emptyBoard },
    });
    const s1 = gameReducer({ ...start, selectedCell: 5 }, { type: 'INPUT_NUMBER', payload: { value: 3 } });
    const s2 = gameReducer(s1, { type: 'UNDO' });
    const s3 = gameReducer(s2, { type: 'REDO' });
    expect(s3.currentBoard[5]).toBe(3);
  });

  it('TOGGLE_MODE flips memo mode', () => {
    const s = gameReducer(initialState, { type: 'TOGGLE_MODE' });
    expect(s.mode).toBe('memo');
  });

  it('INPUT_NUMBER in memo mode toggles note', () => {
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle: emptyBoard, solution: emptyBoard },
    });
    let s = gameReducer({ ...start, selectedCell: 0, mode: 'memo' }, { type: 'INPUT_NUMBER', payload: { value: 3 } });
    expect(s.notes[0]).toEqual([3]);
    s = gameReducer(s, { type: 'INPUT_NUMBER', payload: { value: 3 } });
    expect(s.notes[0]).toEqual([]);
  });

  it('RESET_CONFIRMED restores initialBoard and clears history', () => {
    const puzzle: Board = [...emptyBoard]; (puzzle as any)[0] = 5;
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle, solution: puzzle },
    });
    const s1 = gameReducer({ ...start, selectedCell: 1 }, { type: 'INPUT_NUMBER', payload: { value: 7 } });
    const s2 = gameReducer(s1, { type: 'RESET_CONFIRMED' });
    expect(s2.currentBoard[1]).toBe(0);
    expect(s2.currentBoard[0]).toBe(5); // 初期値は残る
    expect(s2.history.length).toBe(0);
    expect(s2.mistakes).toBe(0);
  });

  it('TICK adds elapsedMs only when playing', () => {
    const s1 = gameReducer({ ...initialState, status: 'playing' }, { type: 'TICK', payload: { deltaMs: 1000 } });
    expect(s1.elapsedMs).toBe(1000);
    const s2 = gameReducer({ ...initialState, status: 'paused' }, { type: 'TICK', payload: { deltaMs: 1000 } });
    expect(s2.elapsedMs).toBe(0);
  });

  it('REDO stack cleared after new INPUT', () => {
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle: emptyBoard, solution: emptyBoard },
    });
    const s1 = gameReducer({ ...start, selectedCell: 5 }, { type: 'INPUT_NUMBER', payload: { value: 3 } });
    const s2 = gameReducer(s1, { type: 'UNDO' });
    expect(s2.future.length).toBe(1);
    const s3 = gameReducer({ ...s2, selectedCell: 10 }, { type: 'INPUT_NUMBER', payload: { value: 7 } });
    expect(s3.future.length).toBe(0); // 新規操作で future クリア
  });

  it('UNDO on empty history returns same state', () => {
    const s = gameReducer(initialState, { type: 'UNDO' });
    expect(s).toEqual(initialState);
  });

  it('HINT_RECEIVED with out-of-bounds index is rejected', () => {
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle: emptyBoard, solution: emptyBoard },
    });
    // Reducer は pendingHint が null の場合 response を破棄する (Reset 抢跑対策)。
    // BAD_INDEX 検証にはまず REQUEST_HINT_START を経由させる必要がある。
    const pending = gameReducer(start, { type: 'REQUEST_HINT_START', payload: { level: 'strong' } });
    const s = gameReducer(pending, { type: 'HINT_RECEIVED', payload: { index: 100, number: 5 } as any });
    expect(s.lastHintRejection?.reason).toBe('BAD_INDEX');
  });

  it('HINT_RECEIVED with bad number is rejected', () => {
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle: emptyBoard, solution: emptyBoard },
    });
    const pending = gameReducer(start, { type: 'REQUEST_HINT_START', payload: { level: 'strong' } });
    const s = gameReducer(pending, { type: 'HINT_RECEIVED', payload: { index: 0, number: 0 } as any });
    expect(s.lastHintRejection?.reason).toBe('BAD_NUMBER');
  });

  it('HINT_RECEIVED is dropped when pendingHint is null (Reset 抢跑対策)', () => {
    // pendingHint が無い状態で late response が届いても盤面を汚さない。
    const puzzle: Board = [...emptyBoard];
    const solution: Board = [...emptyBoard]; (solution as any)[5] = 7;
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle, solution },
    });
    // pendingHint を立てず直接 HINT_RECEIVED → 破棄される
    const s = gameReducer(start, { type: 'HINT_RECEIVED', payload: { index: 5, number: 7 as any } });
    expect(s.currentBoard[5]).toBe(0);
    expect(s.hintsUsed).toBe(0);
  });

  it('HINT_RECEIVED on already-filled cell is ignored', () => {
    const puzzle: Board = [...emptyBoard]; (puzzle as any)[0] = 5;
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle, solution: puzzle },
    });
    const s = gameReducer(start, { type: 'HINT_RECEIVED', payload: { index: 0, number: 3 as any } });
    expect(s.hintsUsed).toBe(0);
    expect(s.pendingHint).toBeNull();
  });

  it('HISTORY_LIMIT caps at 100', () => {
    let s = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle: emptyBoard, solution: emptyBoard },
    });
    for (let i = 0; i < 150; i++) {
      s = gameReducer({ ...s, selectedCell: i % 81 }, { type: 'INPUT_NUMBER', payload: { value: 1 } });
    }
    expect(s.history.length).toBeLessThanOrEqual(100);
  });

  it('autoRemoveNotes: peer notes cleared on placement', () => {
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle: emptyBoard, solution: emptyBoard },
    });
    // Cell 0 と Cell 1 に memo で 5 を入れる
    let s = gameReducer({ ...start, selectedCell: 0, mode: 'memo' }, { type: 'INPUT_NUMBER', payload: { value: 5 } });
    s = gameReducer({ ...s, selectedCell: 1 }, { type: 'INPUT_NUMBER', payload: { value: 5 } });
    expect(s.notes[0]).toEqual([5]);
    expect(s.notes[1]).toEqual([5]);
    // Cell 2 に通常入力で 5 → Cell 0 と Cell 1 の memo 5 が消える（同じ行）
    s = gameReducer({ ...s, selectedCell: 2, mode: 'input' }, { type: 'INPUT_NUMBER', payload: { value: 5 } });
    expect(s.notes[0]).toBeUndefined();
    expect(s.notes[1]).toBeUndefined();
  });

  // ============================================================
  // 追加テスト: 未カバー action を網羅（coverage 60% → 90%+ 目標）
  // ============================================================

  it('HINT_CORRECTION_RECEIVED overrides user mistake with solution', () => {
    const puzzle: Board = [...emptyBoard];
    const solution: Board = [...emptyBoard]; (solution as any)[5] = 7;
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle, solution },
    });
    // ユーザーが 5 を入れた（間違い）
    const filled = gameReducer({ ...start, selectedCell: 5 }, { type: 'INPUT_NUMBER', payload: { value: 5 } });
    // hint request 開始 (pendingHint を立てる)
    const pending = gameReducer(filled, { type: 'REQUEST_HINT_START', payload: { level: 'strong' } });
    // 訂正ヒント：既埋め cell を正解 7 で上書き
    const s = gameReducer(pending, { type: 'HINT_CORRECTION_RECEIVED', payload: { index: 5, number: 7 as any } });
    expect(s.currentBoard[5]).toBe(7);
    expect(s.hintsUsed).toBe(1);
    expect(s.pendingHint).toBeNull();
  });

  it('HINT_CORRECTION_RECEIVED rejects bad index and bad number', () => {
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle: emptyBoard, solution: emptyBoard },
    });
    const pending = gameReducer(start, { type: 'REQUEST_HINT_START', payload: { level: 'strong' } });
    const bad1 = gameReducer(pending, { type: 'HINT_CORRECTION_RECEIVED', payload: { index: 999, number: 5 as any } });
    expect(bad1.lastHintRejection?.reason).toBe('BAD_INDEX');
    const bad2 = gameReducer(pending, { type: 'HINT_CORRECTION_RECEIVED', payload: { index: 5, number: 0 as any } });
    expect(bad2.lastHintRejection?.reason).toBe('BAD_NUMBER');
  });

  it('HINT_CORRECTION_RECEIVED does not touch initial cell', () => {
    const puzzle: Board = [...emptyBoard]; (puzzle as any)[0] = 4;
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle, solution: puzzle },
    });
    const s = gameReducer(start, { type: 'HINT_CORRECTION_RECEIVED', payload: { index: 0, number: 4 as any } });
    expect(s.currentBoard[0]).toBe(4);  // 初期値のまま
    expect(s.hintsUsed).toBe(0);        // カウントされない
  });

  it('HINT_REJECTED stores rejection reason', () => {
    const s = gameReducer(initialState, { type: 'HINT_REJECTED', payload: { reason: 'MOCK_INJECT' } });
    expect(s.lastHintRejection?.reason).toBe('MOCK_INJECT');
    expect(s.pendingHint).toBeNull();
  });

  it('GAME_COMPLETED sets status to complete', () => {
    const s = gameReducer({ ...initialState, status: 'playing' }, { type: 'GAME_COMPLETED' });
    expect(s.status).toBe('complete');
  });

  it('LOAD_SAVED restores whitelisted fields and enters playing', () => {
    const filled: Board = [...emptyBoard]; (filled as any)[3] = 8;
    const s = gameReducer(initialState, {
      type: 'LOAD_SAVED',
      payload: {
        puzzleId: 'restored_id',
        difficulty: 'medium',
        currentBoard: filled,
        elapsedMs: 12000,
        mistakes: 2,
        hintsUsed: 1,
        notes: { '4': [3, 5] },
      },
    });
    expect(s.status).toBe('playing');
    expect(s.puzzleId).toBe('restored_id');
    expect(s.difficulty).toBe('medium');
    expect(s.currentBoard[3]).toBe(8);
    expect(s.elapsedMs).toBe(12000);
    expect(s.mistakes).toBe(2);
    expect(s.hintsUsed).toBe(1);
    // history/future/selectedCell/mode はリセット
    expect(s.history).toEqual([]);
    expect(s.future).toEqual([]);
    expect(s.selectedCell).toBeNull();
    expect(s.mode).toBe('input');
  });

  it('LOAD_SAVED with empty payload falls back to defaults', () => {
    const s = gameReducer(initialState, { type: 'LOAD_SAVED', payload: {} as any });
    expect(s.status).toBe('playing');
    expect(s.elapsedMs).toBe(0);
    expect(s.mistakes).toBe(0);
    expect(s.hintsUsed).toBe(0);
  });

  it('CHANGE_LANGUAGE updates settings.language', () => {
    const s = gameReducer(initialState, { type: 'CHANGE_LANGUAGE', payload: { language: 'zh' } });
    expect(s.settings.language).toBe('zh');
    // 他の settings は変わらない
    expect(s.settings.showMistakesImmediately).toBe(true);
    expect(s.settings.autoRemoveNotes).toBe(true);
  });

  it('TOGGLE_SETTING flips boolean settings', () => {
    const s1 = gameReducer(initialState, { type: 'TOGGLE_SETTING', payload: { key: 'showMistakesImmediately' } });
    expect(s1.settings.showMistakesImmediately).toBe(false);
    const s2 = gameReducer(s1, { type: 'TOGGLE_SETTING', payload: { key: 'autoRemoveNotes' } });
    expect(s2.settings.autoRemoveNotes).toBe(false);
    // 逆方向も戻せる
    const s3 = gameReducer(s2, { type: 'TOGGLE_SETTING', payload: { key: 'showMistakesImmediately' } });
    expect(s3.settings.showMistakesImmediately).toBe(true);
  });

  it('CHEAT_COMPLETE fills all but one cell in playing state', () => {
    const solution: Board = [...emptyBoard];
    for (let i = 0; i < 81; i++) (solution as any)[i] = ((i % 9) + 1);
    const start = gameReducer(initialState, {
      type: 'START_GAME',
      payload: { puzzleId: 'p1', difficulty: 'easy', puzzle: emptyBoard, solution },
    });
    const s = gameReducer(start, { type: 'CHEAT_COMPLETE' });
    // 空マス数を数える
    const emptyCount = s.currentBoard.filter(v => v === 0).length;
    expect(emptyCount).toBe(1);
    // 選択セルは残された空マスにセット
    expect(s.selectedCell).not.toBeNull();
    expect(s.currentBoard[s.selectedCell!]).toBe(0);
  });

  it('CHEAT_COMPLETE is no-op when not playing', () => {
    const s = gameReducer({ ...initialState, status: 'idle' }, { type: 'CHEAT_COMPLETE' });
    expect(s).toEqual({ ...initialState, status: 'idle' });
  });

  // 既存: RESTART_REQUESTED（保持のため元の位置に置く）
  it('RESTART_REQUESTED resets to idle while keeping settings', () => {
    // 完成状態 + カスタム設定 から出発
    const withCustomSettings = {
      ...initialState,
      status: 'complete' as const,
      settings: { showMistakesImmediately: false, autoRemoveNotes: false, language: 'zh' as const },
      elapsedMs: 12345,
      mistakes: 3,
      hintsUsed: 2,
    };
    const s = gameReducer(withCustomSettings, { type: 'RESTART_REQUESTED' });
    // 状態は初期化されるが settings は保持
    expect(s.status).toBe('idle');
    expect(s.difficulty).toBeNull();
    expect(s.elapsedMs).toBe(0);
    expect(s.mistakes).toBe(0);
    expect(s.hintsUsed).toBe(0);
    expect(s.settings).toEqual(withCustomSettings.settings);
  });
});
