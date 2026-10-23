/**
 * Erros do aplicativo e a área de testes do painel.
 *
 * Cada enum aqui tem um enum do Postgres com os mesmos valores em
 * packages/database/migrations/20261023000100_admin_observability.sql.
 */

import type { Timestamp } from './primitives';

export const APP_ERROR_SOURCES = ['mobile', 'admin', 'server'] as const;
export type AppErrorSource = (typeof APP_ERROR_SOURCES)[number];

/** Em ordem crescente de gravidade, como no enum do banco. */
export const APP_ERROR_SEVERITIES = ['warning', 'error', 'fatal'] as const;
export type AppErrorSeverity = (typeof APP_ERROR_SEVERITIES)[number];

export const APP_ERROR_STATUSES = ['new', 'investigating', 'resolved', 'ignored'] as const;
export type AppErrorStatus = (typeof APP_ERROR_STATUSES)[number];

export interface AppError {
  id: number;
  fingerprint: string;
  source: AppErrorSource;
  severity: AppErrorSeverity;
  /** Primeira linha da falha, já recortada. */
  title: string;
  /** Pilha ou texto cru do servidor, quando existe. */
  detail: string | null;
  /** Rota do aplicativo onde aconteceu, quando o reporte soube dizer. */
  screen: string | null;
  appVersion: string | null;
  platform: 'ios' | 'android' | 'web' | 'admin' | null;
  occurrences: number;
  context: Record<string, unknown>;
  status: AppErrorStatus;
  note: string | null;
  firstSeenAt: Timestamp;
  lastSeenAt: Timestamp;
}

export const QA_RESULT_STATUSES = ['pass', 'fail', 'blocked', 'skipped'] as const;
export type QaResultStatus = (typeof QA_RESULT_STATUSES)[number];

export interface QaSuite {
  id: string;
  name: string;
  description: string | null;
  position: number;
  isActive: boolean;
}

export interface QaCase {
  id: string;
  suiteId: string;
  title: string;
  steps: string | null;
  expected: string | null;
  isCritical: boolean;
  position: number;
  isActive: boolean;
}

export interface QaRun {
  id: string;
  label: string;
  appVersion: string | null;
  platform: string | null;
  startedAt: Timestamp;
  finishedAt: Timestamp | null;
  note: string | null;
}

export interface QaResult {
  runId: string;
  caseId: string;
  status: QaResultStatus;
  note: string | null;
  errorId: number | null;
  testedAt: Timestamp;
}

/** Uma linha da linha do tempo de atividade, como a view `admin_activity_feed` devolve. */
export interface ActivityRow {
  kind: 'event' | 'account' | 'plan' | 'error';
  at: Timestamp;
  userId: string | null;
  code: string;
  detail: Record<string, unknown>;
  platform: string | null;
  appVersion: string | null;
}
