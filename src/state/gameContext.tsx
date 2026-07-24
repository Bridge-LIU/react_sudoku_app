/**
 * React Context Provider：ゲーム状態を子孫コンポーネントに配布する。
 *
 * === Vue との対応 ===
 *   provide/inject       ≒ React Context.Provider / useContext
 *   Pinia store のグローバル参照 ≒ Context に置いた state と dispatch
 *
 * === なぜ 2 つの Context に分ける？ ===
 *   State と Dispatch を別々の Context に分けると、dispatch しか使わないコンポーネントは
 *   state 変化で再レンダーされなくなる（最適化）。単一の Context だと state 変化で全員再レンダー。
 *   Vue の Pinia は selective reactivity で自動最適化してくれるが、React は手動でこの分割が定番。
 *
 * === setInterval を useEffect で管理する定番パターン ===
 *   useEffect 内で setInterval を start、return するクリーンアップ関数で clearInterval。
 *   depsが変わる毎にクリーンアップ → 再セット される（ここでは status に依存）。
 */

import React, { createContext, useContext, useReducer, useEffect, useRef, ReactNode } from 'react';
import { gameReducer, initialState, GameState, GameAction } from './gameReducer';

const StateCtx = createContext<GameState>(initialState);
const DispatchCtx = createContext<React.Dispatch<GameAction>>(() => {});

export function GameProvider({ children }: { children: ReactNode }) {
  // useReducer は useState の "action + reducer" 版
  // 戻り値は [現在の state, dispatch 関数]
  const [state, dispatch] = useReducer(gameReducer, initialState);

  // 直近の tick 時刻を保持する ref（レンダー間で永続する変数、変更しても再レンダーは起きない）
  const lastTickRef = useRef<number>(Date.now());

  useEffect(() => {
    if (state.status !== 'playing') {
      lastTickRef.current = Date.now(); // 再開時に大きな delta が入らないようリセット
      return;
    }
    const id = setInterval(() => {
      const now = Date.now();
      const rawDelta = now - lastTickRef.current;
      lastTickRef.current = now;
      // モバイルでバックグラウンド化すると setInterval が停止 → 復帰時に大きな delta が来る。
      // 実プレイ時間として +30 分などは不自然なので 2 秒上限でクランプ。
      const delta = Math.min(rawDelta, 2000);
      dispatch({ type: 'TICK', payload: { deltaMs: delta } });
    }, 1000);
    // クリーンアップ関数 — 次の effect 実行前 / unmount 前に呼ばれる
    return () => clearInterval(id);
  }, [state.status]);

  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>{children}</DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

// カスタム hook：呼び出し側が useContext(...) を直接書かなくて済む
// hook 規則：関数コンポーネントのトップレベルでのみ呼べる、条件付き/ループ内 NG
export const useGameState = () => useContext(StateCtx);
export const useGameDispatch = () => useContext(DispatchCtx);
