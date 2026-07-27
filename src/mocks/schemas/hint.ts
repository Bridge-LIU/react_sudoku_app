/**
 * Hint API schema (設計書 §6.4)。
 * - POST /api/hints → hintResponseSchema
 *
 * === セキュリティ観点 ===
 *   AI (Azure OpenAI) 由来のレスポンスは信用境界の外。
 *   zod で形式検証しても「値の正しさ」は保証されないので、
 *   engine.hintVerifier で「そのセルにその数字が本当に入るか」を再検証する。
 */

import { z } from 'zod';
import { boardSchema, difficultySchema } from './common';

// hint level：weak = 大まかな示唆、medium = 場所限定、strong = セル + 数字を提示
export const hintLevelSchema = z.enum(['weak', 'medium', 'strong']);

// セル座標 (row/col は 0..8)
export const cellCoordSchema = z.object({
  row: z.number().int().min(0).max(8),
  col: z.number().int().min(0).max(8),
});

// リクエスト
// focusCell はユーザーが選択中のセル (optional)。指定されていて空マスなら、
// hint はそのセルを優先する (「ここで詰まってる」の意図)。
export const hintRequestSchema = z.object({
  puzzleId: z.string().min(1),
  currentBoard: boardSchema,
  level: hintLevelSchema,
  difficulty: difficultySchema,
  focusCell: cellCoordSchema.optional(),
});

// レスポンス：level に応じて cell/number は optional
// (weak: 説明のみ, medium: cell 情報のみ, strong: cell + number)
export const hintResponseSchema = z.object({
  level: hintLevelSchema,
  cell: cellCoordSchema.optional(),
  number: z.number().int().min(1).max(9).optional(),
  explanation_i18n: z.object({
    ja: z.string(),
    zh: z.string(),
    en: z.string(),
  }),
});

export type HintLevel = z.infer<typeof hintLevelSchema>;
export type CellCoord = z.infer<typeof cellCoordSchema>;
export type HintRequest = z.infer<typeof hintRequestSchema>;
export type HintResponse = z.infer<typeof hintResponseSchema>;
