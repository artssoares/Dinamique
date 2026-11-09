import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BAKE_SILENCE_MS,
  bakeKey,
  createBakery,
  fingerprint,
  type BakedFilm,
  type FilmIo,
} from './store';

/** Lets pending promise callbacks run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function memoryIo(seed: Record<string, BakedFilm> = {}): FilmIo & { saved: string[] } {
  const files = { ...seed };
  const saved: string[] = [];
  return {
    saved,
    load: async (key) => files[key] ?? null,
    save: async (key, base64, mime) => {
      saved.push(base64);
      files[key] = { uri: `file:///${key}.mp4`, mime };
      return files[key]!;
    },
  };
}

/** Sends a complete, successful bake through the store, in two pieces. */
function deliver(bakery: ReturnType<typeof createBakery<string>>, key: string) {
  bakery.handleMessage(key, { type: 'progress', phase: 'tiles', value: 1 });
  bakery.handleMessage(key, { type: 'progress', phase: 'render', value: 1 });
  bakery.handleMessage(key, { type: 'begin', mime: 'video/mp4', size: 6, chunks: 2 });
  bakery.handleMessage(key, { type: 'chunk', index: 0, total: 2, data: 'AAAA' });
  bakery.handleMessage(key, { type: 'chunk', index: 1, total: 2, data: 'BBBB' });
  bakery.handleMessage(key, { type: 'done', mime: 'video/mp4', size: 6, chunks: 2 });
}

describe('a fila de vídeos', () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.useRealTimers());

  // A segunda vez que o motorista abre o mesmo dia, o vídeo já existe: nada
  // de montar de novo.
  it('usa o vídeo já guardado sem montar de novo', async () => {
    const io = memoryIo({ 'j1-x': { uri: 'file:///j1-x.mp4', mime: 'video/mp4' } });
    const bakery = createBakery<string>(io);
    bakery.request('j1-x', 'film');
    await settle();
    expect(bakery.state('j1-x').status).toBe('ready');
    expect(bakery.state('j1-x').baked?.uri).toBe('file:///j1-x.mp4');
    expect(bakery.active()).toBeNull();
  });

  it('monta, junta os pedaços na ordem e guarda', async () => {
    const io = memoryIo();
    const bakery = createBakery<string>(io);
    bakery.request('j1-x', 'film');
    await settle();
    expect(bakery.state('j1-x').status).toBe('baking');
    expect(bakery.active()).toEqual({ key: 'j1-x', recap: 'film' });

    deliver(bakery, 'j1-x');
    await settle();

    expect(io.saved).toEqual(['AAAABBBB']);
    expect(bakery.state('j1-x').status).toBe('ready');
    expect(bakery.state('j1-x').progress).toBe(1);
    expect(bakery.active()).toBeNull();
  });

  // Dois filmes ao mesmo tempo dividem a mesma linha de execução e o mesmo
  // codificador: os dois ficam mais lentos que um depois do outro.
  it('monta um de cada vez, e o urgente passa na frente', async () => {
    const bakery = createBakery<string>(memoryIo());
    bakery.request('a-1', 'A');
    bakery.request('b-1', 'B');
    bakery.request('c-1', 'C', { urgent: true });
    await settle();

    expect(bakery.active()?.key).toBe('a-1');
    expect(bakery.state('b-1').status).toBe('queued');
    expect(bakery.state('c-1').status).toBe('queued');

    deliver(bakery, 'a-1');
    await settle();
    expect(bakery.active()?.key).toBe('c-1');
  });

  it('ignora mensagens de um filme que não é o que está sendo montado', async () => {
    const bakery = createBakery<string>(memoryIo());
    bakery.request('a-1', 'A');
    bakery.request('b-1', 'B');
    await settle();
    bakery.handleMessage('b-1', { type: 'progress', phase: 'render', value: 0.5 });
    expect(bakery.state('b-1').progress).toBe(0);
  });

  it('o progresso só anda para a frente entre as fases', async () => {
    const bakery = createBakery<string>(memoryIo());
    bakery.request('a-1', 'A');
    await settle();
    const seen: number[] = [];
    for (const [phase, value] of [
      ['tiles', 0.5],
      ['tiles', 1],
      ['render', 0.2],
      ['render', 1],
    ] as const) {
      bakery.handleMessage('a-1', { type: 'progress', phase, value });
      seen.push(bakery.state('a-1').progress);
    }
    expect([...seen].sort((x, y) => x - y)).toEqual(seen);
    expect(seen[seen.length - 1]).toBeLessThan(1);
  });

  // Um pedaço que se perdeu vira um arquivo que abre e mostra lixo.
  it('recusa um vídeo com pedaço faltando', async () => {
    const bakery = createBakery<string>(memoryIo());
    bakery.request('a-1', 'A');
    await settle();
    bakery.handleMessage('a-1', { type: 'begin', mime: 'video/mp4', size: 6, chunks: 2 });
    bakery.handleMessage('a-1', { type: 'chunk', index: 1, total: 2, data: 'BBBB' });
    bakery.handleMessage('a-1', { type: 'done', mime: 'video/mp4', size: 6, chunks: 2 });
    expect(bakery.state('a-1').status).toBe('failed');
    expect(bakery.state('a-1').errorCode).toBe('incomplete');
  });

  // Sem WebCodecs não adianta tentar os outros: o app volta ao fluxo antigo.
  it('aparelho sem codificador marca este e os que esperam como sem suporte', async () => {
    const bakery = createBakery<string>(memoryIo());
    bakery.request('a-1', 'A');
    bakery.request('b-1', 'B');
    await settle();
    bakery.handleMessage('a-1', { type: 'error', code: 'no-encoder', message: '' });
    expect(bakery.state('a-1').status).toBe('unsupported');
    expect(bakery.state('b-1').status).toBe('unsupported');

    bakery.request('c-1', 'C');
    await settle();
    expect(bakery.state('c-1').status).toBe('unsupported');
    expect(bakery.active()).toBeNull();
  });

  it('uma falha passageira libera a fila e pode ser tentada de novo', async () => {
    const bakery = createBakery<string>(memoryIo());
    bakery.request('a-1', 'A');
    bakery.request('b-1', 'B');
    await settle();
    bakery.handleMessage('a-1', { type: 'error', code: 'encoder-failed', message: 'falhou' });
    expect(bakery.state('a-1').status).toBe('failed');
    expect(bakery.active()?.key).toBe('b-1');

    bakery.retry('a-1');
    expect(bakery.state('a-1').status).toBe('queued');
    deliver(bakery, 'b-1');
    await settle();
    expect(bakery.active()).toEqual({ key: 'a-1', recap: 'A' });
  });

  // Em segundo plano ninguém vê uma montagem travada. Sem isso ela ficava
  // em 40% para sempre e segurava a fila.
  it('uma página que para de responder é dada como falha', async () => {
    vi.useFakeTimers();
    const bakery = createBakery<string>(memoryIo());
    bakery.request('a-1', 'A');
    await vi.advanceTimersByTimeAsync(0);
    expect(bakery.state('a-1').status).toBe('baking');

    await vi.advanceTimersByTimeAsync(BAKE_SILENCE_MS - 1000);
    bakery.handleMessage('a-1', { type: 'progress', phase: 'render', value: 0.4 });
    await vi.advanceTimersByTimeAsync(BAKE_SILENCE_MS - 1000);
    expect(bakery.state('a-1').status).toBe('baking');

    await vi.advanceTimersByTimeAsync(2000);
    expect(bakery.state('a-1').status).toBe('failed');
    expect(bakery.state('a-1').errorCode).toBe('timeout');
  });

  it('o mesmo pedido duas vezes não entra duas vezes na fila', async () => {
    const io = memoryIo();
    const load = vi.spyOn(io, 'load');
    const bakery = createBakery<string>(io);
    bakery.request('a-1', 'A');
    bakery.request('a-1', 'A');
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('a chave do vídeo', () => {
  it('muda quando qualquer coisa do filme muda', () => {
    expect(fingerprint('lucro 100')).not.toBe(fingerprint('lucro 101'));
    expect(fingerprint('igual')).toBe(fingerprint('igual'));
  });

  it('começa pelo id da jornada, para limpar as versões antigas dela', () => {
    const id = '0b6c1f9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
    const key = bakeKey(id, '<html>');
    expect(key.startsWith(`${id}-`)).toBe(true);
    expect(key.slice(key.lastIndexOf('-') + 1)).toBe(fingerprint('<html>'));
  });
});
