/**
 * Hints handler (Mock)。
 * - POST /hints → request.solution から level に応じたヒントを返す。
 *
 * === 設計変更（旧: currentBoard から solve() する方式）===
 *   以前は Mock 側で currentBoard を solve() して解を導出していたため、
 *   盤面に誤りが 2 箇所以上あると solve() が返答不能で「ヒント提示不可」に落ちていた。
 *   現在は client が保持している真の solution を request に載せて送るので、
 *   Mock は常に確実なヒント / 訂正ヒントを返せる。
 *
 * === 信用境界 (仕様書 §4.2, §8.2 → engine/hintVerifier で担保) ===
 *   本番の Azure OpenAI は「もっともらしいが間違ってる」返答をする可能性がある。
 *   Mock は通常 UX では常に正しい hint を返し、
 *   verify 分支は engine/hintVerifier.test.ts と _setHintErrorRate(1) 付きの
 *   mocks/__tests__/hints.test.ts で明示的にテストされる。
 */

import { hintRequestSchema, HintResponse } from '@/mocks/schemas/hint';
import { peersOf, isValidPlacement } from '@/engine/board';
import type { Board, Digit } from '@/types/domain';

// エラー注入率。デフォルト 0 (仕様書には無い仕組みなので通常 UX は常に正しい hint)。
// verify 分支の網羅は engine/hintVerifier.test.ts + mocks/__tests__/hints.test.ts で
// 明示的にカバー済み (_setHintErrorRate(1) で強制注入テスト実施)。
let hintErrorRate = 0;

/**
 * テスト専用：エラー注入率を設定 (0..1)。返り値は変更前の値。
 * 本番 (production build) では no-op で 0 を返す (改変不能を担保)。
 */
export function _setHintErrorRate(rate: number): number {
  const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : true;   // Node/Vitest は __DEV__ 未定義 → 有効
  if (!isDev) return 0;
  const prev = hintErrorRate;
  hintErrorRate = rate;
  return prev;
}

export function handleRequestHint(rawBody: unknown): { status: number; body: unknown } {
  const parsed = hintRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return { status: 400, body: { errorCode: 'INVALID_REQUEST' } };
  }
  const { currentBoard, solution, level, focusCell } = parsed.data;

  // 訂正候補: currentBoard に埋まっているが solution と一致しないセル。
  const wrongIndices: number[] = [];
  // 空マス候補: currentBoard が 0 のセル。
  const empties: number[] = [];
  for (let i = 0; i < 81; i++) {
    const cur = currentBoard[i]!;
    if (cur === 0) {
      empties.push(i);
    } else if (cur !== solution[i]) {
      wrongIndices.push(i);
    }
  }

  // 完全一致 (全マス正解) → 提示すべきものが無い。
  // 通常ここには来ない (status='complete' に遷移するので UI が hint ボタンを無効化)。
  if (empties.length === 0 && wrongIndices.length === 0) {
    return { status: 200, body: buildAllDoneHint(level) };
  }

  // 「安全な空マス」= 正解を置いても盤面既存の (誤入力含む) peer と衝突しないもの。
  // これを使わないと、ユーザーが誤って peer に同じ数字を入れているとき hint が verifier で
  // CONFLICT 拒否され、UI に「AIの回答が無効でした」が出てしまう。
  // zod digitSchema is z.number().int().min(0).max(9) — runtime narrows to Digit
  // but TS still sees number[]. Runtime-validated data → safe to cast.
  const safeEmpties = empties.filter((idx) =>
    isValidPlacement(currentBoard as unknown as Board, idx, solution[idx]! as Digit)
  );

  // 優先度 (誤りセル訂正は最後の手段):
  //   1. focusCell が誤りセル → 訂正 hint (ユーザーの明示的な選択を尊重)
  //   2. focusCell が「安全な空マス」→ 埋める hint
  //   3. safeEmpties が空でない → 安全な空マスからランダム fill
  //   4. safeEmpties が空 + wrongIndices がある → 誤りセルからランダム correction
  //   5. 両方空 → 全マス正解済み扱いで buildAllDoneHint フォールバック
  const focusIdx = focusCell ? focusCell.row * 9 + focusCell.col : null;
  let pickIdx: number | null = null;
  let isCorrection = false;

  if (focusIdx !== null && wrongIndices.includes(focusIdx)) {
    pickIdx = focusIdx;
    isCorrection = true;
  } else if (focusIdx !== null && safeEmpties.includes(focusIdx)) {
    pickIdx = focusIdx;
    isCorrection = false;
  } else if (safeEmpties.length > 0) {
    pickIdx = safeEmpties[Math.floor(Math.random() * safeEmpties.length)]!;
    isCorrection = false;
  } else if (wrongIndices.length > 0) {
    pickIdx = wrongIndices[Math.floor(Math.random() * wrongIndices.length)]!;
    isCorrection = true;
  }

  if (pickIdx === null) {
    // 両方空 → 実質「全マス正解 or 提示可能なマスが存在しない」の防御的フォールバック。
    return { status: 200, body: buildAllDoneHint(level) };
  }

  const pickRow = Math.floor(pickIdx / 9);
  const pickCol = pickIdx % 9;
  const correctNumber = solution[pickIdx]!;

  // 意図的エラー注入: hintErrorRate の確率で「間違った number」を返す。
  // engine.hintVerifier で reject されるはず。
  const shouldInject = Math.random() < hintErrorRate;
  const injectedNumber = shouldInject ? pickBadNumber(currentBoard, pickIdx, correctNumber) : correctNumber;

  const response: HintResponse & { isCorrection?: boolean } = {
    level,
    cell: level === 'weak' ? undefined : { row: pickRow, col: pickCol },
    number: level === 'strong' ? injectedNumber : undefined,
    explanation_i18n: buildExplanation(pickRow, pickCol, injectedNumber, level, isCorrection),
  };
  if (isCorrection) response.isCorrection = true;
  return { status: 200, body: response };
}

// 全て正解済み (レアケース、通常は status=complete で UI が呼ばない)
function buildAllDoneHint(level: 'weak' | 'medium' | 'strong'): HintResponse {
  return {
    level,
    explanation_i18n: {
      ja: '既に全マス正解です。',
      zh: '所有格子已全部正确。',
      en: 'All cells are already correct.',
    },
  };
}

// 「明らかに間違い」な数字を選ぶ (peer に既にある数字を優先)
function pickBadNumber(board: readonly number[], idx: number, correct: number): number {
  for (const p of peersOf(idx)) {
    const v = board[p];
    if (v !== undefined && v !== 0 && v !== correct) return v;
  }
  // fallback: 1..9 から correct 以外を返す
  for (let d = 1; d <= 9; d++) {
    if (d !== correct) return d;
  }
  return correct;
}

function buildExplanation(
  row: number,
  col: number,
  num: number,
  level: 'weak' | 'medium' | 'strong',
  isCorrection: boolean
) {
  if (level === 'weak') {
    return {
      ja: '注意深く盤面を見直しましょう。',
      zh: '仔细看一下盘面。',
      en: 'Look carefully at the board.',
    };
  }
  if (level === 'medium') {
    return {
      ja: `${row + 1}行${col + 1}列付近を確認してみましょう。`,
      zh: `请检查第${row + 1}行第${col + 1}列附近。`,
      en: `Look near row ${row + 1}, col ${col + 1}.`,
    };
  }
  if (isCorrection) {
    return {
      ja: `${row + 1}行${col + 1}列に誤りがあります。正しくは ${num} です。`,
      zh: `第${row + 1}行第${col + 1}列有错误。正确的数字是 ${num}。`,
      en: `Wrong entry at row ${row + 1}, col ${col + 1}. Correct value: ${num}.`,
    };
  }
  return {
    ja: `${row + 1}行${col + 1}列には ${num} が入ります。`,
    zh: `第${row + 1}行第${col + 1}列填 ${num}。`,
    en: `Place ${num} at row ${row + 1}, col ${col + 1}.`,
  };
}

