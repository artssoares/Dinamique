import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Envia uma falha para a central de erros do painel.
 *
 * Três decisões que importam:
 *
 * 1. **Vai pela função `report_app_error`, não por um insert.** O aplicativo
 *    não tem permissão de escrita em `app_errors`, de propósito: se tivesse,
 *    qualquer um reabriria, reescreveria ou apagaria o histórico de falhas.
 * 2. **Nunca estoura.** Um erro ao reportar um erro não pode virar o segundo
 *    erro na tela de alguém. Todo o corpo está dentro de um try.
 * 3. **Não espera.** Quem chama segue a vida; o envio acontece em paralelo.
 */

/** Falhas iguais em sequência são o mesmo susto: a segunda em diante não sobe. */
const recent = new Map<string, number>();
const DEDUPE_WINDOW_MS = 30_000;

export interface ReportInput {
  /** Primeira linha: o que quebrou. */
  title: string;
  /** Pilha ou texto cru. */
  detail?: string | null;
  /** Rota onde aconteceu, quando se sabe. */
  screen?: string | null;
  severity?: 'warning' | 'error' | 'fatal';
  context?: Record<string, unknown>;
}

function platformName(): string {
  return Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const shape = error as { message?: unknown; code?: unknown };
    if (typeof shape.message === 'string' && shape.message !== '') return shape.message;
    if (typeof shape.code === 'string') return shape.code;
  }
  return String(error);
}

export function reportError(input: ReportInput): void {
  try {
    const title = input.title.trim();
    if (title === '') return;

    const key = `${title}|${input.screen ?? ''}`;
    const now = Date.now();
    const last = recent.get(key);
    if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return;
    recent.set(key, now);

    void supabase
      .rpc('report_app_error', {
        p_source: 'mobile',
        p_title: title.slice(0, 500),
        p_detail: input.detail ?? null,
        p_screen: input.screen ?? null,
        p_severity: input.severity ?? 'error',
        p_app_version: Constants.expoConfig?.version ?? null,
        p_platform: platformName(),
        p_context: input.context ?? {},
      })
      .then(
        () => undefined,
        () => undefined,
      );
  } catch {
    // Reportar um erro nunca pode criar outro.
  }
}

/** Atalho para um `catch`: transforma o que veio em título e detalhe. */
export function reportCaught(
  error: unknown,
  options: { screen?: string | null; severity?: ReportInput['severity']; context?: Record<string, unknown> } = {},
): void {
  reportError({
    title: messageOf(error),
    detail: error instanceof Error ? (error.stack ?? null) : JSON.stringify(error ?? null),
    screen: options.screen ?? null,
    severity: options.severity ?? 'error',
    context: options.context,
  });
}
