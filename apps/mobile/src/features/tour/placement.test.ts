import { describe, expect, it } from 'vitest';
import { placeCard, usableRect } from './placement';

/** Um celular comum, com entalhe em cima e barra de gestos embaixo. */
const SCREEN = {
  screenHeight: 844,
  insetTop: 47,
  insetBottom: 34,
  gap: 14,
  margin: 16,
};

const SAFE_TOP = SCREEN.insetTop + SCREEN.margin;
const SAFE_BOTTOM = SCREEN.screenHeight - SCREEN.insetBottom - SCREEN.margin;

describe('placeCard', () => {
  it('fica embaixo do alvo quando cabe', () => {
    const result = placeCard({
      ...SCREEN,
      hole: { x: 20, y: 200, width: 340, height: 120 },
      cardHeight: 240,
    });
    expect(result.placement).toBe('below');
    expect(result.top).toBe(200 + 120 + SCREEN.gap);
  });

  it('sobe para cima do alvo quando não cabe embaixo', () => {
    const result = placeCard({
      ...SCREEN,
      hole: { x: 20, y: 520, width: 340, height: 120 },
      cardHeight: 240,
    });
    expect(result.placement).toBe('above');
    expect(result.top).toBe(520 - SCREEN.gap - 240);
  });

  // Este é o caso que travava a tela: alvo no meio, cartão alto demais para
  // qualquer um dos lados. A versão antiga jogava o cartão para baixo e os
  // botões saíam da tela, sem nenhuma outra saída porque o fundo não aceita
  // toque.
  it('nunca deixa o cartão sair da área segura', () => {
    const result = placeCard({
      ...SCREEN,
      hole: { x: 20, y: 380, width: 340, height: 160 },
      cardHeight: 520,
    });
    expect(result.top).toBeGreaterThanOrEqual(SAFE_TOP);
    expect(result.top + 520).toBeLessThanOrEqual(SAFE_BOTTOM + 0.001);
    expect(result.placement).toBe('floating');
  });

  it('mantém o rodapé do cartão visível com o alvo colado no fim da tela', () => {
    const result = placeCard({
      ...SCREEN,
      hole: { x: 20, y: 760, width: 340, height: 70 },
      cardHeight: 300,
    });
    expect(result.top + 300).toBeLessThanOrEqual(SAFE_BOTTOM + 0.001);
  });

  it('limita a altura do cartão à área segura, para o texto rolar por dentro', () => {
    const result = placeCard({ ...SCREEN, hole: null, cardHeight: 0 });
    expect(result.maxHeight).toBe(SAFE_BOTTOM - SAFE_TOP);
  });

  it('centraliza enquanto ainda não sabe a altura do cartão', () => {
    const result = placeCard({
      ...SCREEN,
      hole: { x: 20, y: 200, width: 340, height: 120 },
      cardHeight: 0,
    });
    expect(result.placement).toBe('floating');
    expect(result.top).toBeGreaterThanOrEqual(SAFE_TOP);
  });

  it('em tela minúscula ainda devolve uma posição dentro da tela', () => {
    const tiny = { screenHeight: 320, insetTop: 0, insetBottom: 0, gap: 14, margin: 16 };
    const result = placeCard({ ...tiny, hole: { x: 0, y: 100, width: 200, height: 60 }, cardHeight: 400 });
    expect(result.top).toBeGreaterThanOrEqual(16);
    expect(result.maxHeight).toBe(288);
  });
});

describe('usableRect', () => {
  it('aceita um alvo visível', () => {
    expect(usableRect({ x: 10, y: 100, width: 200, height: 60 }, 390, 844)).not.toBeNull();
  });

  it('recusa um alvo que rolou para fora da tela', () => {
    expect(usableRect({ x: 10, y: 900, width: 200, height: 60 }, 390, 844)).toBeNull();
    expect(usableRect({ x: 10, y: -200, width: 200, height: 60 }, 390, 844)).toBeNull();
  });

  it('recusa uma medida vazia, que é o que um alvo não montado devolve', () => {
    expect(usableRect({ x: 0, y: 0, width: 0, height: 0 }, 390, 844)).toBeNull();
    expect(usableRect(null, 390, 844)).toBeNull();
  });

  // Recortar quase a tela inteira não destaca nada: some o escurecimento e
  // sobra um retângulo com borda em volta de tudo.
  it('recusa um alvo grande demais para virar recorte', () => {
    expect(usableRect({ x: 0, y: 0, width: 390, height: 700 }, 390, 844)).toBeNull();
  });
});
