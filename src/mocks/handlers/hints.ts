/**
 * Hints handler (Mock)。
 * - POST /hints → currentBoard + puzzleId から solution を検索、level に応じたヒントを返す
 *
 * === 信用境界 (仕様書 §4.2, §8.2 → engine/hintVerifier で担保) ===
 *   本番の Azure OpenAI は「もっともらしいが間違ってる」返答をする可能性がある。
 *   Mock は通常 UX では常に正しい hint を返し、
 *   verify 分支は engine/hintVerifier.test.ts と _setHintErrorRate(1) 付きの
 *   mocks/__tests__/hints.test.ts で明示的にテストされる。
 *
 * === 制約 ===
 *   Mock は cache に入ってる puzzle の solution を「知ってる」前提。
 *   実 Azure では AI に current board を送って推論させる形になる。
 */

import { hintRequestSchema, HintResponse } from '@/mocks/schemas/hint';
import { peersOf } from '@/engine/board';
import { solve } from '@/engine/solver';
import type { Board } from '@/types/domain';

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

/**
 * puzzles cache に依存すると循環依存になるので、cache を参照するのではなく
 * ヒント要求時に「currentBoard から差分を計算してその中の 1 マスを候補にする」形にする。
 * ただし solution は AI 実装での回答なので、Mock では別途 solution を渡す必要がある。
 * → 現状は cache 参照式で実装 (循環避けるため import は関数内で)。
 */
export function handleRequestHint(rawBody: unknown): { status: number; body: unknown } {
  const parsed = hintRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return { status: 400, body: { errorCode: 'INVALID_REQUEST' } };
  }
  const { currentBoard, level, focusCell } = parsed.data;

  // solution を currentBoard から solver で計算する (実 Azure OpenAI も current board を推論する形)。
  // puzzleId には依存しない: mock cache は in-memory でリフレッシュで消えるため、
  // snapshot 復元経由でも動くようにこの設計にする。
  const solutions = solve(currentBoard as Board, { maxSolutions: 1 });
  if (solutions.length === 0) {
    // 現在の盤面から解ける状態でない (矛盾状態)。空ヒントで返す。
    return { status: 200, body: buildEmptyHint(level) };
  }
  const solution = solutions[0]!;

  // 空マスを列挙。既に埋まっているセルはヒント対象外。
  const empties: number[] = [];
  for (let i = 0; i < 81; i++) {
    if (currentBoard[i] === 0) empties.push(i);
  }
  if (empties.length === 0) {
    return { status: 200, body: buildEmptyHint(level) };
  }

  // focusCell が指定されていて空マスなら優先 (ユーザーが「このセルで詰まってる」の合図)。
  // 指定なし or focusCell が既に埋まっていれば、空マスからランダム。
  let pickIdx: number;
  if (focusCell) {
    const focusIdx = focusCell.row * 9 + focusCell.col;
    if (currentBoard[focusIdx] === 0) {
      pickIdx = focusIdx;
    } else {
      pickIdx = empties[Math.floor(Math.random() * empties.length)]!;
    }
  } else {
    pickIdx = empties[Math.floor(Math.random() * empties.length)]!;
  }
  const pickRow = Math.floor(pickIdx / 9);
  const pickCol = pickIdx % 9;
  const correctNumber = solution[pickIdx]!;

  // 意図的エラー注入: hintErrorRate の確率で「間違った number」を返す。
  // engine.hintVerifier で reject されるはず。
  const shouldInject = Math.random() < hintErrorRate;
  const injectedNumber = shouldInject ? pickBadNumber(currentBoard, pickIdx, correctNumber) : correctNumber;

  const response: HintResponse = {
    level,
    cell: level === 'weak' ? undefined : { row: pickRow, col: pickCol },
    number: level === 'strong' ? injectedNumber : undefined,
    explanation_i18n: buildExplanation(pickRow, pickCol, injectedNumber, level),
  };
  return { status: 200, body: response };
}

// weak level で cell/number 省略パターン
function buildEmptyHint(level: 'weak' | 'medium' | 'strong'): HintResponse {
  return {
    level,
    explanation_i18n: {
      ja: '空マスがないので提示できません。',
      zh: '没有空格可以提示。',
      en: 'No empty cells to hint.',
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

function buildExplanation(row: number, col: number, num: number, level: 'weak' | 'medium' | 'strong') {
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
  return {
    ja: `${row + 1}行${col + 1}列には ${num} が入ります。`,
    zh: `第${row + 1}行第${col + 1}列填 ${num}。`,
    en: `Place ${num} at row ${row + 1}, col ${col + 1}.`,
  };
}
