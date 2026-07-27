// 动态路由：src/app/play/[difficulty].tsx → 匹配 /play/easy, /play/medium, /play/hard。
// 对比 Vue Router: 相当于 { path: '/play/:difficulty', component: PlayScreen }。
//
// === このファイルの責務 ===
//   URL パラメータから難易度を取り出す → GameProvider の state と接続 →
//   Board / NumberPad / Toolbar / Timer / CompleteDialog を配線する。
//   マウント時は「snapshot 復元 → 無ければ新規生成」の順で試みる。
//
// === Vue との対応 ===
//   useGameState / useGameDispatch = Vue の useStore() のようなもの（Context 経由）。
//   useEffect(() => { ... }, [deps]) = Vue の watch(deps, () => ...)。
//   useLocalSearchParams = useRoute().params の Expo Router 版。

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator, Text } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Board } from '@/ui/Board';
import { NumberPad } from '@/ui/NumberPad';
import { Toolbar } from '@/ui/Toolbar';
import { Timer } from '@/ui/Timer';
import { CompleteDialog } from '@/ui/CompleteDialog';
import { useGameState, useGameDispatch } from '@/state/gameContext';
import { getHighlights } from '@/state/selectors';
import { findConflicts } from '@/engine/board';
import { generatePuzzle } from '@/engine/generator';
import { saveSnapshot, loadSnapshot, clearSnapshot } from '@/storage/asyncStorage';
import { Board as BoardData, Difficulty, NonEmptyDigit, Notes } from '@/types/domain';
import { colors, spacing } from '@/ui/theme';

// URL パラメータのバリデーション（外部入力の信用境界）
function isValidDifficulty(v: string | undefined): v is Difficulty {
  return v === 'easy' || v === 'medium' || v === 'hard';
}

// 冲突無効時に返す空 Set。毎回 new Set() を作らず参照を安定させて memo が効くように。
const EMPTY_CONFLICTS: ReadonlySet<number> = new Set();

// puzzleId 用の乱数サフィックス：Date.now() だけだと 1ms 未満での二重マウント時に衝突する。
function makePuzzleId(): string {
  const cryptoObj = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoObj?.randomUUID) return `local-${cryptoObj.randomUUID()}`;
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// キーボード操作を無視すべき DOM 要素かどうか（テキスト入力へのキー入力を潰さないため）
function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') return false;
  const el = target as HTMLElement;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  return el.isContentEditable === true;
}

export default function PlayScreen() {
  const params = useLocalSearchParams<{ difficulty?: string }>();
  const state = useGameState();
  const dispatch = useGameDispatch();
  const router = useRouter();

  // URL 不正時は home に戻す
  const rawDifficulty = params.difficulty;
  const validDifficulty: Difficulty | null = isValidDifficulty(rawDifficulty) ? rawDifficulty : null;

  useEffect(() => {
    if (rawDifficulty && !validDifficulty) {
      router.replace('/' as Href);
    }
  }, [rawDifficulty, validDifficulty, router]);

  // Bootstrap 進行中フラグ (ローカル state)。
  // NOTE: 以前は state.status = 'loading' に依存していたが、これを deps に入れると
  // 「dispatch(START_LOADING) → 再レンダー → effect 再走 → cleanup で自分をキャンセル」
  // という自己キャンセルループで永久 loading になる。ローカル state に分離して回避。
  const [bootstrapping, setBootstrapping] = useState(false);

  // Bootstrap：snapshot 復元 → 無ければ新規生成
  //
  // 発火条件:
  //   1. state が idle（初回マウント、あるいは RESTART_REQUESTED 直後）
  //   2. URL の難易度と state.difficulty が食い違う（ブラウザ back/forward、URL 直入力）
  //
  // playing / paused / complete のときは既存ゲーム / 完成ダイアログを維持する。
  useEffect(() => {
    if (!validDifficulty) return;

    // 難易度食い違い → 現行 state を破棄して次の effect で新難度を load/generate
    if (state.difficulty && state.difficulty !== validDifficulty) {
      dispatch({ type: 'RESTART_REQUESTED' });
      return;
    }

    // 同一難易度で active/paused/complete なら維持
    if (state.status !== 'idle') return;

    let cancelled = false;
    setBootstrapping(true);

    void (async () => {
      try {
        const snap = await loadSnapshot(validDifficulty);
        if (cancelled) return;
        if (snap) {
          // 保存済みの途中状態を復元。isValidSnapshot で 0-9 範囲は検証済みなので型キャスト安全。
          dispatch({
            type: 'LOAD_SAVED',
            payload: {
              puzzleId: snap.puzzleId,
              difficulty: snap.difficulty,
              initialBoard: snap.initialBoard as BoardData,
              currentBoard: snap.currentBoard as BoardData,
              solution: snap.solution as BoardData,
              notes: snap.notes as unknown as Notes,
              elapsedMs: snap.elapsedMs,
              mistakes: snap.mistakes,
              hintsUsed: snap.hintsUsed,
            },
          });
          return;
        }
        // 保存なし → 新規生成
        const { puzzle, solution } = generatePuzzle(validDifficulty);
        if (cancelled) return;
        dispatch({
          type: 'START_GAME',
          payload: {
            puzzleId: makePuzzleId(),
            difficulty: validDifficulty,
            puzzle,
            solution,
          },
        });
      } catch (err) {
        console.error('[bootstrap]', err instanceof Error ? err.message : String(err));
        if (cancelled) return;
        dispatch({ type: 'RESTART_REQUESTED' });
        router.replace('/' as Href);
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();

    return () => {
      cancelled = true;
      setBootstrapping(false);
    };
  }, [validDifficulty, state.difficulty, state.status, dispatch, router]);

  // オートセーブ (移動系変化のみ)：elapsedMs を deps に含めると毎秒書き込み発生するので除外。
  useEffect(() => {
    if (state.status !== 'playing') return;
    void saveSnapshot(state).catch((err) => {
      console.warn('[saveSnapshot]', err instanceof Error ? err.message : String(err));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentBoard, state.notes, state.mistakes, state.hintsUsed, state.status, state.puzzleId]);

  // unmount 時 (or ページ離脱時) に elapsedMs を含めた最終スナップショット保存。
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    return () => {
      const s = stateRef.current;
      if (s.status !== 'playing' && s.status !== 'paused') return;
      void saveSnapshot(s).catch(() => {});
    };
  }, []);

  // Web: beforeunload でも保存 (タブ閉じ / リロード時)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onBeforeUnload = () => {
      const s = stateRef.current;
      if (s.status !== 'playing' && s.status !== 'paused') return;
      // beforeunload では非同期処理が完了しない可能性があるが、AsyncStorage の web 実装 (IndexedDB) は
      // 一部ケースで間に合う。fire-and-forget。
      void saveSnapshot(s).catch(() => {});
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // (silent test hook — no console output)
  useEffect(() => {
    const g = globalThis as unknown as Record<string, unknown>;
    g.__sudokuWin = () => {
      dispatch({ type: 'CHEAT_COMPLETE' });
      return true;
    };
    return () => {
      delete g.__sudokuWin;
    };
  }, [dispatch]);

  // Web キーボード入力：1-9 / Backspace / Delete / 0 / 矢印キー / Tab
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (state.status !== 'playing') return;
      if (isEditableTarget(e.target)) return;
      const idx = state.selectedCell;
      if (idx === null) {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          dispatch({ type: 'SELECT_CELL', payload: { index: 0 } });
          e.preventDefault();
        }
        return;
      }
      // '1' <= e.key <= '9' は ASCII 順で単調増加なので単文字比較で安全
      if (e.key >= '1' && e.key <= '9' && e.key.length === 1) {
        const digit = (e.key.charCodeAt(0) - 48) as NonEmptyDigit;
        dispatch({ type: 'INPUT_NUMBER', payload: { value: digit } });
        e.preventDefault();
      } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
        dispatch({ type: 'INPUT_NUMBER', payload: { value: 0 } });
        e.preventDefault();
      } else if (e.key === 'ArrowUp' && idx >= 9) {
        dispatch({ type: 'SELECT_CELL', payload: { index: idx - 9 } });
        e.preventDefault();
      } else if (e.key === 'ArrowDown' && idx <= 71) {
        dispatch({ type: 'SELECT_CELL', payload: { index: idx + 9 } });
        e.preventDefault();
      } else if (e.key === 'ArrowLeft' && idx % 9 !== 0) {
        dispatch({ type: 'SELECT_CELL', payload: { index: idx - 1 } });
        e.preventDefault();
      } else if (e.key === 'ArrowRight' && idx % 9 !== 8) {
        dispatch({ type: 'SELECT_CELL', payload: { index: idx + 1 } });
        e.preventDefault();
      } else if (e.key === 'Tab') {
        // Tab = 次のセル、Shift+Tab = 前のセル。末尾/先頭で折り返し。
        // ブラウザ標準のフォーカス移動を潰さないと隣の要素に飛んでしまうので preventDefault。
        const nextIdx = e.shiftKey ? (idx + 80) % 81 : (idx + 1) % 81;
        dispatch({ type: 'SELECT_CELL', payload: { index: nextIdx } });
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.selectedCell, state.status, dispatch]);

  const highlights = useMemo(
    () => getHighlights(state.currentBoard, state.selectedCell),
    [state.currentBoard, state.selectedCell]
  );
  const conflicts = useMemo(
    () => (state.settings.showMistakesImmediately ? findConflicts(state.currentBoard) : EMPTY_CONFLICTS),
    [state.currentBoard, state.settings.showMistakesImmediately]
  );

  // 「もう一度」/「難易度変更」共通処理：現在難易度の snapshot をクリアしてから reset
  const restartFresh = () => {
    const d = state.difficulty;
    void (async () => {
      if (d) await clearSnapshot(d);
      dispatch({ type: 'RESTART_REQUESTED' });
    })();
  };

  if (bootstrapping || state.status === 'idle' || state.status === 'loading') {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: spacing.md, color: colors.disabled }}>Generating…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Timer elapsedMs={state.elapsedMs} />
      <Board
        board={state.currentBoard}
        initialBoard={state.initialBoard}
        notes={state.notes}
        selectedIndex={state.selectedCell}
        highlights={highlights}
        conflicts={conflicts}
        onCellPress={(i) => dispatch({ type: 'SELECT_CELL', payload: { index: i } })}
      />
      <NumberPad
        memoMode={state.mode === 'memo'}
        onNumber={(n) => dispatch({ type: 'INPUT_NUMBER', payload: { value: n } })}
        onDelete={() => dispatch({ type: 'INPUT_NUMBER', payload: { value: 0 } })}
        onToggleMode={() => dispatch({ type: 'TOGGLE_MODE' })}
        disabled={state.status !== 'playing'}
      />
      <Toolbar
        onUndo={() => dispatch({ type: 'UNDO' })}
        onRedo={() => dispatch({ type: 'REDO' })}
        onHint={() => {}}
        onReset={() => dispatch({ type: 'RESET_CONFIRMED' })}
        canUndo={state.history.length > 0}
        canRedo={state.future.length > 0}
        canHint={false}
      />
      <CompleteDialog
        visible={state.status === 'complete'}
        difficulty={state.difficulty ?? 'easy'}
        elapsedMs={state.elapsedMs}
        mistakes={state.mistakes}
        hintsUsed={state.hintsUsed}
        onPlayAgain={restartFresh}
        onChangeDifficulty={() => {
          restartFresh();
          router.replace('/' as Href);
        }}
        onClose={() => {}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', paddingTop: spacing.lg, gap: spacing.md },
  center: { justifyContent: 'center' },
});
