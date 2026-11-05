import { afterEach, describe, expect, it, vi } from 'vitest';
import { layout } from '../tokens/index';

const reported = { width: 390, height: 844 };
const platform = { OS: 'ios' as string };

vi.mock('react-native', () => ({
  Platform: platform,
  useWindowDimensions: () => reported,
}));

// The hook is called as a plain function here, outside a render. Outside
// hydration React reads the client snapshot, which is what this stands in for.
let snapshot: 'client' | 'server' = 'client';
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useSyncExternalStore: (
    _subscribe: unknown,
    getSnapshot: () => unknown,
    getServerSnapshot: () => unknown,
  ) => (snapshot === 'server' ? getServerSnapshot() : getSnapshot()),
}));

const { useResponsive, describeWindow, resolveWindowSize } = await import('./useResponsive');

type FakeWindow = { innerWidth: number; innerHeight: number; addEventListener: () => void };
const globals = globalThis as unknown as { window?: FakeWindow };

afterEach(() => {
  reported.width = 390;
  reported.height = 844;
  platform.OS = 'ios';
  snapshot = 'client';
  delete globals.window;
});

describe('useResponsive', () => {
  it('usa a largura da janela quando ela existe', () => {
    reported.width = 360;
    expect(useResponsive().width).toBe(360);
    expect(useResponsive().isCompact).toBe(true);
  });

  // Na web, `useWindowDimensions` devolve 0 até alguém redimensionar a janela.
  // Quem multiplicava por essa largura produzia zero em silêncio: era assim que
  // a barra flutuante nascia com 18 pixels e os cinco controles vazando dela.
  it('não devolve zero quando a janela ainda não se apresentou', () => {
    const size = resolveWindowSize({ width: 0, height: 0 }, { width: 412, height: 915 });
    expect(size).toEqual({ width: 412, height: 915 });
  });

  it('cai na largura de referência quando não há navegador nenhum', () => {
    reported.width = 0;
    reported.height = 0;
    const responsive = useResponsive();
    expect(responsive.width).toBe(390);
    expect(responsive.contentWidth).toBe(390);
  });

  it('a coluna de leitura nunca passa da largura da tela', () => {
    expect(describeWindow(320, 700).contentWidth).toBe(320);
    expect(describeWindow(1440, 900).contentWidth).toBe(560);
  });
});

describe('na web', () => {
  // A página estática é gerada a 390dp. Se o primeiro render no navegador já
  // usasse a largura real, a hidratação manteria os estilos do HTML e o tablet
  // ficava preso no layout de celular até alguém navegar para outra tela.
  it('hidrata com o tamanho do servidor e só depois usa o da janela', () => {
    platform.OS = 'web';
    globals.window = { innerWidth: 1180, innerHeight: 820, addEventListener: () => {} };

    snapshot = 'server';
    expect(useResponsive().width).toBe(390);

    snapshot = 'client';
    expect(useResponsive().width).toBe(1180);
    expect(useResponsive().navigation).toBe('rail');
  });
});

describe('tablet', () => {
  it('celular em pé fica com a barra de baixo e uma coluna', () => {
    const phone = describeWindow(390, 844);
    expect(phone.navigation).toBe('bar');
    expect(phone.availableWidth).toBe(390);
    expect(phone.isTwoPane).toBe(false);
  });

  // Celular deitado no navegador é largo, mas não tem altura para cinco
  // destinos empilhados: continua com a barra.
  it('celular deitado continua com a barra', () => {
    expect(describeWindow(844, 390).navigation).toBe('bar');
  });

  it('tablet em pé ganha o menu lateral, mas ainda uma coluna', () => {
    for (const [w, h] of [
      [768, 1024],
      [800, 1280],
      [820, 1180],
    ]) {
      const tablet = describeWindow(w!, h!);
      expect(tablet.navigation).toBe('rail');
      expect(tablet.availableWidth).toBe(w! - layout.railWidth);
      expect(tablet.isTwoPane).toBe(false);
    }
  });

  it('tablet deitado ganha o menu lateral e duas colunas', () => {
    for (const [w, h] of [
      [1024, 768],
      [1180, 820],
      [1280, 800],
    ]) {
      const tablet = describeWindow(w!, h!);
      expect(tablet.navigation).toBe('rail');
      expect(tablet.isTwoPane).toBe(true);
    }
  });
});
