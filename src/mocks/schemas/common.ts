/**
 * 共通 zod schema：Board / Difficulty / エラー形式。
 *
 * === zod とは ===
 *   ランタイム型検証ライブラリ。TS の型と実行時の検証を「一つの定義」から生成できる。
 *   Vue で言うなら `vee-validate` の型付き版、あるいは Pydantic 相当。
 *
 * === なぜ Mock/API 境界で zod を使うか ===
 *   1. Azure Functions の実装（今は空）と Mock 実装、両方が同じ contract に従うことを担保
 *   2. AI 由来のレスポンス (hints) は特に信用できないので schema violation を早期検出
 *   3. TS 型は開発時のみ、zod は実行時にも「実際に来たデータ」を検証する
 */

import { z } from 'zod';

// Digit = 0..9 (0 は空). z.number().int().min(0).max(9) を一発で。
// 注意：ドメイン型 (Digit / Board / Difficulty) は @/types/domain が単一 source of truth。
// ここで再 export しない (二重定義防止)。
export const digitSchema = z.number().int().min(0).max(9);

// Board = 81 個の Digit を厳密に。長さ違うと reject。
export const boardSchema = z.array(digitSchema).length(81);

// Difficulty enum は union of literals。zod は自動で 3 択に narrow。
export const difficultySchema = z.enum(['easy', 'medium', 'hard']);

// エラー形式（設計書 §6.2 に準拠）：Azure 側もこの形で返す約束。
export const errorResponseSchema = z.object({
  errorCode: z.string().min(1),
  message: z.string().optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
