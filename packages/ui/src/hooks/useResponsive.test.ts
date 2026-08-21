import { afterEach, describe, expect, it, vi } from 'vitest';

const reported = { width: 390, height: 844 };

vi.mock('react-native', () => ({
  useWindowDimensions: () => reported,
}));

const { useResponsive } = await import('./useResponsive');

afterEach(() => {
  reported.width = 390;
  reported.height = 844;
  delete (globalThis as { innerWidth?: number }).innerWidth;
  delete (globalThis as { innerHeight?: number }).innerHeight;
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
    reported.width = 0;
    reported.height = 0;
    (globalThis as { innerWidth?: number }).innerWidth = 412;
    (globalThis as { innerHeight?: number }).innerHeight = 915;

    const responsive = useResponsive();
    expect(responsive.width).toBe(412);
    expect(responsive.height).toBe(915);
    expect(responsive.contentWidth).toBeGreaterThan(0);
  });

  it('cai na largura de referência quando não há navegador nenhum', () => {
    reported.width = 0;
    reported.height = 0;
    const responsive = useResponsive();
    expect(responsive.width).toBe(390);
    expect(responsive.contentWidth).toBe(390);
  });

  it('a coluna de leitura nunca passa da largura da tela', () => {
    reported.width = 320;
    expect(useResponsive().contentWidth).toBe(320);
    reported.width = 1440;
    expect(useResponsive().contentWidth).toBe(560);
  });
});
