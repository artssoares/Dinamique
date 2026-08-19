import { supabase } from '@/lib/supabase';
import {
  markAttempt,
  markPermanentFailure,
  pendingOperations,
  readQueue,
  removeFromQueue,
  type QueuedOperation,
} from './queue';

export interface SyncResult {
  synced: number;
  failed: number;
  remaining: number;
}

/**
 * Envia a fila. Chamada quando a conexão volta e ao abrir o aplicativo.
 *
 * As operações vão em ordem, uma a uma. Enviar em lote seria mais rápido, mas
 * um erro no lote inteiro esconderia qual linha falhou – e aqui saber qual
 * linha falhou vale mais que a velocidade.
 */
export async function syncQueue(): Promise<SyncResult> {
  const queue = await readQueue();
  const pending = pendingOperations(queue);

  let synced = 0;
  let failed = 0;

  for (const operation of pending) {
    const ok = await sendOne(operation);
    if (ok) synced += 1;
    else failed += 1;
  }

  const remaining = (await readQueue()).length;
  return { synced, failed, remaining };
}

async function sendOne(operation: QueuedOperation): Promise<boolean> {
  const { error } = await supabase.from(operation.table).insert(operation.payload);

  if (!error) {
    await removeFromQueue(operation.id);
    return true;
  }

  // 23505 é violação de índice único: a linha JÁ chegou numa tentativa
  // anterior. Isso é sucesso, não erro – é exatamente o que o client_id
  // existe para permitir.
  if (error.code === '23505') {
    await removeFromQueue(operation.id);
    return true;
  }

  // 23503/23514 são violações de chave estrangeira e de constraint: reenviar
  // não resolve, então a operação vai direto para o limite e o usuário é
  // avisado agora, não daqui a cinco tentativas.
  if (error.code === '23503' || error.code === '23514') {
    await markPermanentFailure(operation.id, error.message);
    return false;
  }

  await markAttempt(operation.id, error.message);
  return false;
}
