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
  settings: { showMistakesImmediately: true, autoRemoveNotes: true, language: 'ja' },
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
  | { type: 'HINT_REJECTED'; payload: { reason: string } }
  | { type: 'GAME_COMPLETED' }
  | { type: 'LOAD_SAVED'; payload: Partial<GameState> }
  | { type: 'CHANGE_LANGUAGE'; payload: { language: 'ja' | 'zh' | 'en' } }
  | { type: 'TOGGLE_SETTING'; payload: { key: 'showMistakesImmediately' | 'autoRemoveNotes' } };

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
        const cur = state.notes[idx] ?? [];
        const curCell = state.currentBoard[idx] ?? 0;
        // メモの toggle：既にあれば削除、なければ追加してソート
        const next = cur.includes(value as NonEmptyDigit)
          ? cur.filter(n => n !== value)
          : [...cur, value as NonEmptyDigit].sort();
        const entry: HistoryEntry = {
          index: idx, prevValue: curCell, nextValue: curCell,
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
      const nextBoard = writeAt(state.currentBoard, idx, value);
      const entry: HistoryEntry = {
        index: idx, prevValue: prev, nextValue: value,
        prevNotes: state.notes[idx] ?? [], nextNotes: [],
      };
      const mistakesInc =
        state.settings.showMistakesImmediately && value !== 0 && value !== state.solution[idx] ? 1 : 0;
      // 数値確定したらメモは消える
      const newNotes = { ...state.notes };
      delete newNotes[idx];
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
      return {
        ...state,
        currentBoard: state.initialBoard,
        notes: {},
        history: [], future: [],
        mistakes: 0, hintsUsed: 0, elapsedMs: 0,
        status: 'playing',
      };

    case 'REQUEST_HINT_START':
      return { ...state, pendingHint: { level: action.payload.level }, lastHintRejection: null };

    case 'HINT_RECEIVED': {
      const { index, number } = action.payload;
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

    case 'HINT_REJECTED':
      return { ...state, pendingHint: null, lastHintRejection: { reason: action.payload.reason } };

    case 'GAME_COMPLETED':
      return { ...state, status: 'complete' };

    case 'LOAD_SAVED':
      return { ...state, ...action.payload, status: 'playing' };

    case 'CHANGE_LANGUAGE':
      return { ...state, settings: { ...state.settings, language: action.payload.language } };

    case 'TOGGLE_SETTING':
      return {
        ...state,
        settings: { ...state.settings, [action.payload.key]: !state.settings[action.payload.key] },
      };

    default: return state;
  }
}
