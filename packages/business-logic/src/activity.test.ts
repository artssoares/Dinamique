import { describe, expect, it } from 'vitest';
import { describeActivity, describeActivitySource, describeWhen } from './activity';

describe('describeActivity', () => {
  it('traduz um evento conhecido para o português', () => {
    expect(describeActivity({ code: 'journey_completed', detail: {} })).toBe('encerrou a jornada');
  });

  it('diz o motivo quando um plano é concedido', () => {
    expect(describeActivity({ code: 'plan_granted', detail: { plan: 'pro', source: 'courtesy' } }))
      .toBe('recebeu o PRO por cortesia');
  });

  it('aceita um motivo de plano que ainda não tem tradução', () => {
    expect(describeActivity({ code: 'plan_granted', detail: { plan: 'pro', source: 'rifa' } }))
      .toBe('recebeu o PRO por rifa');
  });

  it('cita o erro quando a linha é um erro', () => {
    expect(describeActivity({ code: 'app_error', detail: { title: 'Cannot read x' } }))
      .toBe('esbarrou num erro: Cannot read x');
  });

  it('não devolve vazio para um evento que ainda não foi traduzido', () => {
    // O código novo chega antes da tradução; a linha tem de continuar legível.
    expect(describeActivity({ code: 'tarifa_dinamica_vista', detail: {} }))
      .toBe('tarifa dinamica vista');
  });
});

describe('describeActivitySource', () => {
  it('junta aparelho e versão', () => {
    expect(describeActivitySource({ platform: 'android', appVersion: '1.0.2' }))
      .toBe('Android · versão 1.0.2');
  });

  it('não inventa complemento quando nada é conhecido', () => {
    expect(describeActivitySource({ platform: null, appVersion: null })).toBe('');
  });
});

describe('describeWhen', () => {
  const now = Date.parse('2026-10-23T12:00:00Z');

  it('usa minutos e horas enquanto isso ajuda', () => {
    expect(describeWhen('2026-10-23T11:52:00Z', now)).toBe('há 8 min');
    expect(describeWhen('2026-10-23T09:00:00Z', now)).toBe('há 3 h');
    expect(describeWhen('2026-10-23T11:59:50Z', now)).toBe('agora');
  });

  it('passa para a data quando o relativo deixa de dizer algo', () => {
    expect(describeWhen('2026-09-01T12:00:00Z', now)).toBe('01/09/2026');
  });
});
