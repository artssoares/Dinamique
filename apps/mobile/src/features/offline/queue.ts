import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Fila de sincronização (§111).
 *
 * Um motorista fica sem sinal com frequência. O que ele registrou tem que
 * sobreviver a isso — e sobreviver a fechar o aplicativo, ficar dois dias
 * offline e voltar.
 *
 * A fila é deliberadamente burra: uma lista de operações de inserção, cada uma
 * com um `client_id` gerado no aparelho. É esse id que torna o reenvio seguro —
 * o banco tem índice único em (user_id, client_id), então mandar duas vezes
 * cria uma linha só. Nada de resolução de conflito, nada de CRDT: em V1,
 * confiabilidade vale mais que sofisticação.
 */

const STORAGE_KEY = '@dinamique/sync-queue';

/** Tabelas que aceitam gravação offline. Nenhuma outra entra na fila. */
export const SYNCABLE_TABLES = ['journeys', 'revenues', 'expenses', 'fuel_logs'] as const;
export type SyncableTable = (typeof SYNCABLE_TABLES)[number];

export interface QueuedOperation {
  /** Também é o `client_id` da linha — é o que garante idempotência. */
  id: string;
  table: SyncableTable;
  payload: Record<string, unknown>;
  createdAt: string;
  /** Quantas vezes já tentamos enviar. */
  attempts: number;
  lastError?: string;
}

/** Depois disso, a operação para de ser tentada e é reportada ao usuário. */
export const MAX_ATTEMPTS = 5;

export async function readQueue(): Promise<QueuedOperation[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedOperation[]) : [];
  } catch {
    // Fila corrompida não pode derrubar o aplicativo; começamos vazia.
    return [];
  }
}

async function writeQueue(operations: QueuedOperation[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(operations));
}

export async function enqueue(
  table: SyncableTable,
  payload: Record<string, unknown>,
  clientId: string,
): Promise<QueuedOperation> {
  const operation: QueuedOperation = {
    id: clientId,
    table,
    payload: { ...payload, client_id: clientId },
    createdAt: new Date().toISOString(),
    attempts: 0,
  };

  const queue = await readQueue();
  await writeQueue([...queue, operation]);
  return operation;
}

export async function removeFromQueue(id: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.filter((operation) => operation.id !== id));
}

export async function markAttempt(id: string, error: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(
    queue.map((operation) =>
      operation.id === id
        ? { ...operation, attempts: operation.attempts + 1, lastError: error }
        : operation,
    ),
  );
}

/**
 * Erro que reenviar não resolve (chave estrangeira, constraint violada).
 * Vai direto para o limite: insistir 5 vezes no mesmo erro só atrasa o aviso
 * ao usuário.
 */
export async function markPermanentFailure(id: string, error: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(
    queue.map((operation) =>
      operation.id === id
        ? { ...operation, attempts: MAX_ATTEMPTS, lastError: error }
        : operation,
    ),
  );
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

/** Operações que já esgotaram as tentativas e precisam de decisão do usuário. */
export function stuckOperations(queue: QueuedOperation[]): QueuedOperation[] {
  return queue.filter((operation) => operation.attempts >= MAX_ATTEMPTS);
}

export function pendingOperations(queue: QueuedOperation[]): QueuedOperation[] {
  return queue.filter((operation) => operation.attempts < MAX_ATTEMPTS);
}
