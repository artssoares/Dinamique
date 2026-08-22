import { describe, expect, it } from 'vitest';
import { endDateFromInstalments, FIXED_COST_OPTIONS, ONBOARDING_COST_SLUGS } from './fixedCosts';

describe('endDateFromInstalments', () => {
  it('conta os meses que faltam a partir de hoje', () => {
    expect(endDateFromInstalments(18, new Date('2026-01-15T12:00:00Z'))).toBe('2027-07-15');
  });

  it('atravessa a virada do ano sem se perder', () => {
    expect(endDateFromInstalments(3, new Date('2026-11-10T12:00:00Z'))).toBe('2027-02-10');
  });

  // Quem não sabe quantas faltam deixa em branco, e a dívida fica sem data de
  // fim em vez de ganhar uma inventada.
  it('não inventa data quando o número não veio', () => {
    expect(endDateFromInstalments(Number.NaN)).toBeNull();
    expect(endDateFromInstalments(0)).toBeNull();
    expect(endDateFromInstalments(-4)).toBeNull();
  });
});

describe('categorias do onboarding', () => {
  // Um slug fora do seed vira uma linha sem categoria, e a inserção falha em
  // silêncio no fim do cadastro, que é o pior momento possível.
  it('só usa slugs que existem em expense_categories', () => {
    const seeded = [
      'combustivel', 'alimentacao', 'estacionamento', 'pedagio', 'free-flow', 'lavagem',
      'manutencao', 'pneus', 'oleo', 'multas', 'aluguel', 'financiamento', 'seguro',
      'ipva', 'licenciamento', 'celular', 'internet', 'outros',
    ];
    for (const slug of ONBOARDING_COST_SLUGS) {
      expect(seeded).toContain(slug);
    }
  });

  it('não repete uma categoria na lista', () => {
    const slugs = FIXED_COST_OPTIONS.map((option) => option.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
