/**
 * Analytics API schema (設計書 §6.5)。
 * - POST /api/analytics/play → 202 fire-and-forget
 *
 * Application Insights CustomEvents に対応するイベント名 + properties。
 * eventName は enum で固定 (typo で欠損データを作らないため)。
 */

import { z } from 'zod';
import { difficultySchema } from './common';

export const analyticsEventNameSchema = z.enum([
  'PuzzleStarted',
  'PuzzleCompleted',
  'PuzzleAbandoned',
  'HintUsed',
  'HintRejected',
  'DifficultyChanged',
  'LanguageChanged',
]);

// properties: 任意のイベントで共通的に持ちたいものを optional で並べる。
// 個別イベント固有のフィールドはこの union の外側 (Record) で受ける。
export const analyticsRequestSchema = z.object({
  eventName: analyticsEventNameSchema,
  properties: z.object({
    difficulty: difficultySchema.optional(),
    puzzleId: z.string().optional(),
    sessionId: z.string().optional(),
    anonymousUserId: z.string().optional(),
    durationMs: z.number().int().min(0).optional(),
    mistakes: z.number().int().min(0).optional(),
    hintsUsed: z.number().int().min(0).optional(),
    undoCount: z.number().int().min(0).optional(),
    appVersion: z.string().optional(),
    // 将来イベント固有プロパティも許容
  }).catchall(z.union([z.string(), z.number(), z.boolean()])),
});

// 202 Accepted：ボディは空 object。fire-and-forget 契約。
export const analyticsResponseSchema = z.object({}).strict();

export type AnalyticsEventName = z.infer<typeof analyticsEventNameSchema>;
export type AnalyticsRequest = z.infer<typeof analyticsRequestSchema>;
export type AnalyticsResponse = z.infer<typeof analyticsResponseSchema>;
