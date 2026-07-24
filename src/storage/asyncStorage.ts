/**
 * ゲーム状態を AsyncStorage に保存 / 復元する。
 *
 * === AsyncStorage について ===
 * React Native の非同期 KV ストア。Web では IndexedDB を自動的に使う（expo-async-storage）。
 * localStorage と違って async（Promise を返す）。
 *
 * === Difficulty 毎に 1 スロット ===
 * S 範囲では複数セーブスロットは実装しない。難易度ごとに 1 つのゲームを覚える。
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GameState } from '@/state/gameReducer';
import { Difficulty } from '@/types/domain';

const key = (d: Difficulty) => `sudoku.save.${d}`;

export interface SavedSnapshot {
  puzzleId: string;
  difficulty: Difficulty;
  initialBoard: number[];
  currentBoard: number[];
  solution: number[];
  notes: Record<string, number[]>;
  elapsedMs: number;
  mistakes: number;
  hintsUsed: number;
  savedAt: string;
}

// スナップショット検証：AsyncStorage/IndexedDB は inspector から編集可能なので
// 復元時にランタイム検証で信用境界を守る。zod 未導入なので手書き。
function isValidBoardArray(v: unknown): v is number[] {
  if (!Array.isArray(v) || v.length !== 81) return false;
  for (const x of v) if (!Number.isInteger(x) || x < 0 || x > 9) return false;
  return true;
}

function isValidDifficulty(v: unknown): v is Difficulty {
  return v === 'easy' || v === 'medium' || v === 'hard';
}

function isValidNotes(v: unknown): v is Record<string, number[]> {
  if (!v || typeof v !== 'object') return false;
  for (const [k, arr] of Object.entries(v)) {
    const idx = Number(k);
    if (!Number.isInteger(idx) || idx < 0 || idx > 80) return false;
    if (!Array.isArray(arr)) return false;
    for (const n of arr) if (!Number.isInteger(n) || n < 1 || n > 9) return false;
  }
  return true;
}

export function isValidSnapshot(v: unknown): v is SavedSnapshot {
  if (!v || typeof v !== 'object') return false;
  const s = v as any;
  if (typeof s.puzzleId !== 'string') return false;
  if (!isValidDifficulty(s.difficulty)) return false;
  if (!isValidBoardArray(s.initialBoard)) return false;
  if (!isValidBoardArray(s.currentBoard)) return false;
  if (!isValidBoardArray(s.solution)) return false;
  if (!isValidNotes(s.notes)) return false;
  if (!Number.isFinite(s.elapsedMs) || s.elapsedMs < 0) return false;
  if (!Number.isInteger(s.mistakes) || s.mistakes < 0) return false;
  if (!Number.isInteger(s.hintsUsed) || s.hintsUsed < 0) return false;
  if (typeof s.savedAt !== 'string') return false;
  return true;
}

export async function saveSnapshot(state: GameState): Promise<void> {
  if (!state.difficulty || !state.puzzleId) return;
  const snap: SavedSnapshot = {
    puzzleId: state.puzzleId,
    difficulty: state.difficulty,
    initialBoard: [...state.initialBoard],
    currentBoard: [...state.currentBoard],
    solution: [...state.solution],
    notes: Object.fromEntries(Object.entries(state.notes).map(([k, v]) => [k, [...v]])),
    elapsedMs: state.elapsedMs,
    mistakes: state.mistakes,
    hintsUsed: state.hintsUsed,
    savedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(key(state.difficulty), JSON.stringify(snap));
}

export async function loadSnapshot(d: Difficulty): Promise<SavedSnapshot | null> {
  const raw = await AsyncStorage.getItem(key(d));
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 破損データは self-heal：キー削除して null 返す
    await AsyncStorage.removeItem(key(d));
    return null;
  }
  if (!isValidSnapshot(parsed)) {
    // 形式不正も同様に自己修復
    await AsyncStorage.removeItem(key(d));
    return null;
  }
  return parsed;
}

export async function clearSnapshot(d: Difficulty): Promise<void> {
  await AsyncStorage.removeItem(key(d));
}
