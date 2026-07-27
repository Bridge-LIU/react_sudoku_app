/**
 * Puzzle 関連 API schema (設計書 §6.1, §6.2)。
 * - POST /api/puzzles/generate → puzzleObjectSchema
 * - GET  /api/puzzles/:id      → puzzleObjectSchema | errorResponseSchema
 */

import { z } from 'zod';
import { boardSchema, difficultySchema } from './common';

// パズル本体：Azure Cosmos DB の puzzles container document を表す形。
export const puzzleObjectSchema = z.object({
  id: z.string().min(1),
  difficulty: difficultySchema,
  puzzle: boardSchema,       // 0 で穴が空いている初期盤
  solution: boardSchema,     // 完全解
  clueCount: z.number().int().min(17).max(81),   // 数独の最小 clue 数は 17
  isUnique: z.boolean(),
  createdAt: z.string().datetime(),   // ISO 8601
  generatorVersion: z.string().min(1),
});

// POST /api/puzzles/generate request
export const generatePuzzleRequestSchema = z.object({
  difficulty: difficultySchema,
});

export type PuzzleObject = z.infer<typeof puzzleObjectSchema>;
export type GeneratePuzzleRequest = z.infer<typeof generatePuzzleRequestSchema>;
