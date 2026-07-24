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
  notes: Record<number, number[]>;
  elapsedMs: number;
  mistakes: number;
  hintsUsed: number;
  savedAt: string;
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
  return raw ? JSON.parse(raw) as SavedSnapshot : null;
}

export async function clearSnapshot(d: Difficulty): Promise<void> {
  await AsyncStorage.removeItem(key(d));
}
