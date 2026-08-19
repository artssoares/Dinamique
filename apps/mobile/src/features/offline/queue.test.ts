import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A fila guarda dados que o motorista já registrou. Um erro aqui não é um bug
 * de interface – é trabalho de um dia perdido. Por isso ela é testada isolada
 * do Supabase e do React Native.
 */

const store = new Map<string, string>();

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: async (key: string) => {
      store.delete(key);
    },
  },
}));

const {
  MAX_ATTEMPTS,
  clearQueue,
  enqueue,
  markAttempt,
  markPermanentFailure,
  pendingOperations,
  readQueue,
  removeFromQueue,
  stuckOperations,
} = await import('./queue');

beforeEach(async () => {
  store.clear();
  await clearQueue();
});

describe('fila de sincronização', () => {
  it('começa vazia', async () => {
    expect(await readQueue()).toEqual([]);
  });

  it('guarda a operação com o client_id no payload', async () => {
    await enqueue('revenues', { amount: 1000 }, 'abc-123');
    const queue = await readQueue();

    expect(queue).toHaveLength(1);
    expect(queue[0]!.table).toBe('revenues');
    // É o client_id que torna o reenvio seguro; ele precisa ir no payload.
    expect(queue[0]!.payload.client_id).toBe('abc-123');
    expect(queue[0]!.attempts).toBe(0);
  });

  it('mantém a ordem de registro', async () => {
    await enqueue('revenues', { amount: 100 }, 'a');
    await enqueue('expenses', { amount: 200 }, 'b');
    await enqueue('journeys', {}, 'c');

    expect((await readQueue()).map((op) => op.id)).toEqual(['a', 'b', 'c']);
  });

  it('remove só a operação indicada', async () => {
    await enqueue('revenues', { amount: 100 }, 'a');
    await enqueue('expenses', { amount: 200 }, 'b');

    await removeFromQueue('a');
    const queue = await readQueue();
    expect(queue.map((op) => op.id)).toEqual(['b']);
  });

  it('conta as tentativas e guarda o último erro', async () => {
    await enqueue('revenues', { amount: 100 }, 'a');
    await markAttempt('a', 'sem rede');
    await markAttempt('a', 'sem rede de novo');

    const [operation] = await readQueue();
    expect(operation!.attempts).toBe(2);
    expect(operation!.lastError).toBe('sem rede de novo');
  });

  it('falha permanente vai direto ao limite', async () => {
    await enqueue('revenues', { amount: 100 }, 'a');
    await markPermanentFailure('a', 'categoria não existe');

    const [operation] = await readQueue();
    expect(operation!.attempts).toBe(MAX_ATTEMPTS);
  });

  it('separa o que ainda vale tentar do que travou', async () => {
    await enqueue('revenues', { amount: 100 }, 'ok');
    await enqueue('revenues', { amount: 200 }, 'travado');
    await markPermanentFailure('travado', 'erro');

    const queue = await readQueue();
    expect(pendingOperations(queue).map((op) => op.id)).toEqual(['ok']);
    expect(stuckOperations(queue).map((op) => op.id)).toEqual(['travado']);
  });

  it('sobrevive a um armazenamento corrompido em vez de derrubar o app', async () => {
    store.set('@dinamique/sync-queue', 'isto não é json');
    expect(await readQueue()).toEqual([]);
  });

  it('ignora conteúdo válido mas do formato errado', async () => {
    store.set('@dinamique/sync-queue', '{"nao":"e um array"}');
    expect(await readQueue()).toEqual([]);
  });

  it('preserva a fila entre leituras, como se o app tivesse fechado', async () => {
    await enqueue('journeys', { started_at: '2026-08-18T07:00:00Z' }, 'j1');

    // Nova leitura, mesmo armazenamento – é o que acontece ao reabrir.
    const queue = await readQueue();
    expect(queue[0]!.payload.started_at).toBe('2026-08-18T07:00:00Z');
  });
});
