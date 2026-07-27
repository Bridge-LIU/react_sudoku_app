/**
 * SavedGame API schema (設計書 §6.3)。
 * - PUT /api/savedGames/:id → savedGameResponseSchema
 *
 * Note: クライアント側は AsyncStorage で snapshot 保存も持つ (両者は独立)。
 *       Task 7 段階では savedGame API はテスト用に契約を確立するのみ、実利用は Task 8+ の Cosmos 連携で。
 */

import { z } from 'zod';
import { boardSchema } from './common';

// notes: { "23": [1,4,7], ... } — キーは cell index の文字列、値は 1..9 の配列
// zod では z.record(keySchema, valueSchema) で自由 key の object を検証
const noteValueSchema = z.array(z.number().int().min(1).max(9));
const notesSchema = z.record(z.string(), noteValueSchema);

export const savedGameRequestSchema = z.object({
  anonymousUserId: z.string().min(1),
  puzzleId: z.string().min(1),
  currentBoard: boardSchema,
  notes: notesSchema,
  elapsedSeconds: z.number().int().min(0),
  mistakes: z.number().int().min(0),
});

export const savedGameResponseSchema = z.object({
  id: z.string().min(1),
  updatedAt: z.string().datetime(),
});

export type SavedGameRequest = z.infer<typeof savedGameRequestSchema>;
export type SavedGameResponse = z.infer<typeof savedGameResponseSchema>;
