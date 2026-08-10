/**
 * ゲーム全体の状態と action をここに集約する。
 *
 * === Redux/Vuex/Pinia を知っている人向けの対応表 ===
 *   Vuex/Pinia の state       ≒ ここの GameState
 *   Vuex mutations / Pinia actions ≒ ここの reducer switch case
 *   Pinia の $patch          ≒ dispatch({ type: '...', payload: ... })
 *
 * Reducer 関数の契約：
 *   (現在の state, action) => 新しい state（不変！既存 state は絶対に改変しない）
 *
 * なぜ不変か：React は「参照が変わったら再レンダー」だから。既存 state を直接
 * `state.mistakes++` しても参照が同じで再レンダーされない。必ず新しいオブジェクトを返す。
 * Vuex mutations は改変してもOK（内部で追跡してくれる）だが、React は違う。
 *
 * 大きな reducer になるが、switch で action.type を分岐するだけで見通しは意外と良い。
 */

import { Board, Difficulty, Digit, HintLevel, NonEmptyDigit, Notes } from '@/types/domain';
import { peersOf } from '@/engine/board';
import { detectInitialLanguage } from '@/i18n/detectLanguage';

const EMPTY: Board = new Array(81).fill(0);

// Undo/Redo のために保存する一手分の情報
export interface HistoryEntry {
  readonly index: number;
  readonly prevValue: Digit;
  readonly nextValue: Digit;
  readonly prevNotes: readonly NonEmptyDigit[];
  readonly nextNotes: readonly NonEmptyDigit[];
}

export interface GameState {
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'complete';
  puzzleId: string | null;
  difficulty: Difficulty | null;
  initialBoard: Board;
  currentBoard: Board;
  solution: Board;
  notes: Notes;
  selectedCell: number | null;
  mode: 'input' | 'memo';
  history: readonly HistoryEntry[];  // Undo 用
  future: readonly HistoryEntry[];   // Redo 用（Undo すると history から future に移る）
  elapsedMs: number;
  mistakes: number;
  hintsUsed: number;
  settings: {
    showMistakesImmediately: boolean;
    autoRemoveNotes: boolean;
    language: 'ja' | 'zh' | 'en';
  };
  pendingHint: null | { level: HintLevel };
  lastHintRejection: null | { reason: string };
}

export const initialState: GameState = {
  status: 'idle',
  puzzleId: null,
  difficulty: null,
  initialBoard: EMPTY,
  currentBoard: EMPTY,
  solution: EMPTY,
  notes: {},
  selectedCell: null,
  mode: 'input',
  history: [],
  future: [],
  elapsedMs: 0,
  mistakes: 0,
  hintsUsed: 0,
  settings: { showMistakesImmediately: true, autoRemoveNotes: true, language: detectInitialLanguage() },
  pendingHint: null,
  lastHintRejection: null,
};

/**
 * 全 action の型。Discriminated Union で type ごとに payload の型が決まる。
 * dispatch({ type: 'INPUT_NUMBER', payload: { value: 5 } }) → TS が payload を型チェック
 */
export type GameAction =
  | { type: 'START_LOADING' }
  | { type: 'START_GAME'; payload: { puzzleId: string; difficulty: Difficulty; puzzle: Board; solution: Board } }
  | { type: 'SELECT_CELL'; payload: { index: number } }
  | { type: 'INPUT_NUMBER'; payload: { value: Digit } }
  | { type: 'TOGGLE_MODE' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'TICK'; payload: { deltaMs: number } }
  | { type: 'PAUSE' } | { type: 'RESUME' }
  | { type: 'RESET_CONFIRMED' }
  | { type: 'REQUEST_HINT_START'; payload: { level: HintLevel } }
  | { type: 'HINT_RECEIVED'; payload: { index: number; number: NonEmptyDigit } }
  | { type: 'HINT_CORRECTION_RECEIVED'; payload: { index: number; number: NonEmptyDigit } }
  | { type: 'HINT_REJECTED'; payload: { reason: string } }
  | { type: 'GAME_COMPLETED' }
  | { type: 'LOAD_SAVED'; payload: Partial<GameState> }
  | { type: 'CHANGE_LANGUAGE'; payload: { language: 'ja' | 'zh' | 'en' } }
  | { type: 'TOGGLE_SETTING'; payload: { key: 'showMistakesImmediately' | 'autoRemoveNotes' } }
  | { type: 'RESTART_REQUESTED' }
  | { type: 'CHEAT_COMPLETE' };   // 開発デバッグ用：盤面を solution で埋めて完成状態にする

const HISTORY_LIMIT = 100;

// 配列の 1 要素だけ更新した新配列を返す（不変性を守る）
function writeAt<T>(arr: readonly T[], idx: number, val: T): T[] {
  const copy = [...arr]; copy[idx] = val; return copy;
}

// 完成判定：現在の盤面が solution と完全一致するか
function isComplete(board: Board, solution: Board): boolean {
  for (let i = 0; i < 81; i++) if (board[i] !== solution[i]) return false;
  return true;
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_LOADING':
      return { ...state, status: 'loading' };

    case 'START_GAME': {
      const { puzzleId, difficulty, puzzle, solution } = action.payload;
      return {
        ...initialState,
        settings: state.settings, // 設定は引き継ぐ
        status: 'playing',
        puzzleId, difficulty,
        initialBoard: puzzle,
        currentBoard: puzzle,
        solution,
      };
    }

    case 'SELECT_CELL':
      return { ...state, selectedCell: action.payload.index };

    case 'INPUT_NUMBER': {
      const idx = state.selectedCell;
      if (idx === null) return state;
      if (state.initialBoard[idx] !== 0) return state; // 初期値セルは編集不可
      const value = action.payload.value;

      if (state.mode === 'memo') {
        if (value === 0) return state;
        // 既に数値が入っているセルにメモを打っても UI 上見えず、
        // history だけ膨らんで Undo が壊れるので早期 return。
        if (state.currentBoard[idx] !== 0) return state;
        const cur = state.notes[idx] ?? [];
        // メモの toggle：既にあれば削除、なければ追加してソート
        const next = cur.includes(value as NonEmptyDigit)
          ? cur.filter(n => n !== value)
          : [...cur, value as NonEmptyDigit].sort();
        const entry: HistoryEntry = {
          index: idx, prevValue: 0, nextValue: 0,
          prevNotes: cur, nextNotes: next,
        };
        return {
          ...state,
          notes: { ...state.notes, [idx]: next },
          history: [...state.history, entry].slice(-HISTORY_LIMIT),
          future: [], // 新規操作したので Redo キャンセル
        };
      }

      // 通常入力モード
      const prev = state.currentBoard[idx] ?? 0;
      // no-op 早期 return: 空セルで Delete、同じ値の再入力 → history を汚さない
      if (prev === value) return state;
      const nextBoard = writeAt(state.currentBoard, idx, value);
      const entry: HistoryEntry = {
        index: idx, prevValue: prev, nextValue: value,
        prevNotes: state.notes[idx] ?? [], nextNotes: [],
      };
      // mistakes: 新しく誤った値を確定した時のみ +1 (同じ誤値の再入力・重複計上を防ぐ)
      const mistakesInc =
        state.settings.showMistakesImmediately && value !== 0 && value !== state.solution[idx] ? 1 : 0;
      // 数値確定したらメモは消える
      const newNotes = { ...state.notes };
      delete newNotes[idx];
      // autoRemoveNotes: 数値確定した時、同じ行/列/ブロックのメモから同じ数字を削除
      if (state.settings.autoRemoveNotes && value !== 0) {
        for (const peer of peersOf(idx)) {
          const peerNotes = newNotes[peer];
          if (peerNotes && peerNotes.includes(value as NonEmptyDigit)) {
            const cleaned = peerNotes.filter(n => n !== value);
            if (cleaned.length > 0) newNotes[peer] = cleaned;
            else delete newNotes[peer];
          }
        }
      }
      const complete = value !== 0 && isComplete(nextBoard, state.solution);
      return {
        ...state,
        currentBoard: nextBoard,
        notes: newNotes,
        history: [...state.history, entry].slice(-HISTORY_LIMIT),
        future: [],
        mistakes: state.mistakes + mistakesInc,
        status: complete ? 'complete' : state.status,
      };
    }

    case 'TOGGLE_MODE':
      return { ...state, mode: state.mode === 'input' ? 'memo' : 'input' };

    case 'UNDO': {
      if (state.history.length === 0) return state;
      const last = state.history[state.history.length - 1];
      if (!last) return state;
      const nextBoard = writeAt(state.currentBoard, last.index, last.prevValue);
      const nextNotes = { ...state.notes };
      if (last.prevNotes.length > 0) nextNotes[last.index] = last.prevNotes;
      else delete nextNotes[last.index];
      return {
        ...state,
        currentBoard: nextBoard,
        notes: nextNotes,
        history: state.history.slice(0, -1),
        future: [last, ...state.future], // Undo した手を future に積む
      };
    }

    case 'REDO': {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      if (!next) return state;
      const nextBoard = writeAt(state.currentBoard, next.index, next.nextValue);
      const nextNotes = { ...state.notes };
      if (next.nextNotes.length > 0) nextNotes[next.index] = next.nextNotes;
      else delete nextNotes[next.index];
      return {
        ...state,
        currentBoard: nextBoard,
        notes: nextNotes,
        history: [...state.history, next],
        future: rest,
      };
    }

    case 'TICK':
      return state.status === 'playing' ? { ...state, elapsedMs: state.elapsedMs + action.payload.deltaMs } : state;

    case 'PAUSE': return state.status === 'playing' ? { ...state, status: 'paused' } : state;
    case 'RESUME': return state.status === 'paused' ? { ...state, status: 'playing' } : state;

    case 'RESET_CONFIRMED':
      // 進行中の hint 要求も無効化する (レスポンス到着時に reducer 側で無視される)。
      return {
        ...state,
        currentBoard: state.initialBoard,
        notes: {},
        history: [], future: [],
        mistakes: 0, hintsUsed: 0, elapsedMs: 0,
        status: 'playing',
        pendingHint: null,
        lastHintRejection: null,
      };

    case 'REQUEST_HINT_START':
      return { ...state, pendingHint: { level: action.payload.level }, lastHintRejection: null };

    case 'HINT_RECEIVED': {
      // pendingHint が無い = ユーザーが Reset した後に届いた古い応答 → 破棄する。
      if (!state.pendingHint) return state;
      const { index, number } = action.payload;
      // 境界チェック：AI 由来なので信用しない（Engine の verifyHint と二重防御）
      if (!Number.isInteger(index) || index < 0 || index > 80) {
        return { ...state, pendingHint: null, lastHintRejection: { reason: 'BAD_INDEX' } };
      }
      if (!Number.isInteger(number) || number < 1 || number > 9) {
        return { ...state, pendingHint: null, lastHintRejection: { reason: 'BAD_NUMBER' } };
      }
      // 直前チェック：初期値セルや既に埋まっている所への hint は無視
      if (state.initialBoard[index] !== 0 || state.currentBoard[index] !== 0) {
        return { ...state, pendingHint: null };
      }
      const prev = state.currentBoard[index] ?? 0;
      const nextBoard = writeAt(state.currentBoard, index, number as Digit);
      const complete = isComplete(nextBoard, state.solution);
      return {
        ...state,
        currentBoard: nextBoard,
        hintsUsed: state.hintsUsed + 1,
        pendingHint: null,
        history: [...state.history, {
          index, prevValue: prev, nextValue: number as Digit, prevNotes: state.notes[index] ?? [], nextNotes: [],
        }].slice(-HISTORY_LIMIT),
        future: [],
        status: complete ? 'complete' : state.status,
      };
    }

    case 'HINT_CORRECTION_RECEIVED': {
      // 訂正 hint：既に埋まってるセル (ユーザーの間違い) を正解で上書きする。
      // HINT_RECEIVED との違い: current[idx] !== 0 でも通す (むしろその前提)。
      // 初期セルは絶対に触らない (仕様書要求)。
      // pendingHint が無い = Reset 後の遅延応答 → 破棄。
      if (!state.pendingHint) return state;
      const { index, number } = action.payload;
      if (!Number.isInteger(index) || index < 0 || index > 80) {
        return { ...state, pendingHint: null, lastHintRejection: { reason: 'BAD_INDEX' } };
      }
      if (!Number.isInteger(number) || number < 1 || number > 9) {
        return { ...state, pendingHint: null, lastHintRejection: { reason: 'BAD_NUMBER' } };
      }
      if (state.initialBoard[index] !== 0) {
        return { ...state, pendingHint: null };
      }
      const prev = state.currentBoard[index] ?? 0;
      const nextBoard = writeAt(state.currentBoard, index, number as Digit);
      const complete = isComplete(nextBoard, state.solution);
      return {
        ...state,
        currentBoard: nextBoard,
        hintsUsed: state.hintsUsed + 1,
        pendingHint: null,
        history: [...state.history, {
          index, prevValue: prev, nextValue: number as Digit,
          prevNotes: state.notes[index] ?? [], nextNotes: [],
        }].slice(-HISTORY_LIMIT),
        future: [],
        status: complete ? 'complete' : state.status,
      };
    }

    case 'HINT_REJECTED':
      return { ...state, pendingHint: null, lastHintRejection: { reason: action.payload.reason } };

    case 'GAME_COMPLETED':
      return { ...state, status: 'complete' };

    case 'LOAD_SAVED': {
      // 明示的 whitelist：任意フィールド上書きを防ぐ（Security H1）
      const p = action.payload;
      return {
        ...state,
        puzzleId: p.puzzleId ?? state.puzzleId,
        difficulty: p.difficulty ?? state.difficulty,
        initialBoard: p.initialBoard ?? state.initialBoard,
        currentBoard: p.currentBoard ?? state.currentBoard,
        solution: p.solution ?? state.solution,
        notes: p.notes ?? state.notes,
        elapsedMs: p.elapsedMs ?? 0,
        mistakes: p.mistakes ?? 0,
        hintsUsed: p.hintsUsed ?? 0,
        status: 'playing',
        // history/future/selectedCell/mode/settings/pendingHint/lastHintRejection は保持しない
        history: [],
        future: [],
        selectedCell: null,
        mode: 'input',
        pendingHint: null,
        lastHintRejection: null,
      };
    }

    case 'CHANGE_LANGUAGE':
      return { ...state, settings: { ...state.settings, language: action.payload.language } };

    case 'TOGGLE_SETTING':
      return {
        ...state,
        settings: { ...state.settings, [action.payload.key]: !state.settings[action.payload.key] },
      };

    case 'RESTART_REQUESTED':
      // 完成後の「もう一度」/「難易度変更」で使う。設定は引き継いで idle に戻す。
      // これにより PlayScreen の生成 effect が再走してパズルを新規生成する。
      return { ...initialState, settings: state.settings };

    case 'CHEAT_COMPLETE': {
      // デバッグ秘籍：進行中の空マスを最後の 1 つだけ残して埋める (自分で完成の瞬間を体験できる形)。
      if (state.status !== 'playing' && state.status !== 'paused') return state;
      // 現在空のセルを列挙
      const emptyIndices: number[] = [];
      for (let i = 0; i < 81; i++) {
        if (state.currentBoard[i] === 0) emptyIndices.push(i);
      }
      if (emptyIndices.length === 0) return state;   // 既に埋まってる
      // 最後の 1 マスをランダムに選んで残す
      const keepIdx = emptyIndices[Math.floor(Math.random() * emptyIndices.length)]!;
      const nextBoard: Digit[] = [...state.currentBoard];
      for (const i of emptyIndices) {
        if (i === keepIdx) continue;
        nextBoard[i] = state.solution[i]!;
      }
      return {
        ...state,
        // readonly Digit[] は Digit[] から assignable なので cast 不要
        currentBoard: nextBoard,
        notes: {},
        history: [],
        future: [],
        selectedCell: keepIdx,   // 残されたマスにカーソルを合わせておく
      };
    }

    default: return state;
  }
}
