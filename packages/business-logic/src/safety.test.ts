import { describe, expect, it } from 'vitest';
import {
  EMERGENCY_NUMBER,
  MAX_EMERGENCY_CONTACTS,
  SOS_GUIDANCE,
  alertRemainingSeconds,
  contactShareMessage,
  describeReach,
  describeSosFailure,
  formatApproxDistance,
  formatRemaining,
  isDiallablePhone,
  mapLink,
  nextContactSlot,
  platePrefix,
  sanitisePhone,
  sosFailureCode,
} from './safety';

describe('platePrefix', () => {
  it('keeps the first three letters and nothing else', () => {
    expect(platePrefix('ABC1D23')).toBe('ABC');
    expect(platePrefix('abc-1234')).toBe('ABC');
    expect(platePrefix('  a b c 1 2 3 4 ')).toBe('ABC');
  });

  it('refuses to invent a prefix it does not have', () => {
    expect(platePrefix('AB1234')).toBeNull();
    expect(platePrefix('1234567')).toBeNull();
    expect(platePrefix('')).toBeNull();
    expect(platePrefix(null)).toBeNull();
  });

  it('never returns more than three characters, whatever the input', () => {
    // A regra inteira da tela de alerta recebido em uma linha: quem chega
    // reconhece o carro, não identifica o dono.
    for (const plate of ['ABCDEFG', 'ABC1D23', 'XYZ-9999']) {
      expect(platePrefix(plate)).toHaveLength(3);
    }
  });
});

describe('sanitisePhone', () => {
  it('keeps the digits and the country plus', () => {
    expect(sanitisePhone('(11) 99999-0000')).toBe('11999990000');
    expect(sanitisePhone('+55 11 99999-0000')).toBe('+5511999990000');
  });

  it('accepts a number the dialler can use and rejects one it cannot', () => {
    expect(isDiallablePhone('(11) 99999-0000')).toBe(true);
    expect(isDiallablePhone('+55 11 99999-0000')).toBe(true);
    expect(isDiallablePhone('9999')).toBe(false);
    expect(isDiallablePhone('')).toBe(false);
  });
});

describe('nextContactSlot', () => {
  it('fills the first gap in the list', () => {
    expect(nextContactSlot([])).toBe(1);
    expect(nextContactSlot([1, 3])).toBe(2);
    expect(nextContactSlot([2])).toBe(1);
  });

  it('reports a full list rather than a fourth contact', () => {
    expect(nextContactSlot([1, 2, 3])).toBeNull();
    expect(MAX_EMERGENCY_CONTACTS).toBe(3);
  });
});

describe('formatApproxDistance', () => {
  it('stays vague up close, on purpose', () => {
    expect(formatApproxDistance(120)).toBe('menos de 500 m');
    expect(formatApproxDistance(700)).toBe('cerca de 1 km');
  });

  it('reads in kilometres further out', () => {
    expect(formatApproxDistance(1200)).toBe('cerca de 1,2 km');
    expect(formatApproxDistance(4800)).toBe('cerca de 4,8 km');
  });

  it('never shows a negative distance', () => {
    expect(formatApproxDistance(-10)).toBe('menos de 500 m');
  });
});

describe('alert countdown', () => {
  const now = Date.parse('2026-09-16T12:00:00Z');

  it('counts what is left of the sharing window', () => {
    expect(alertRemainingSeconds('2026-09-16T12:28:00Z', now)).toBe(1680);
    expect(formatRemaining(1680)).toBe('faltam 28 minutos');
  });

  it('clamps a window that already closed', () => {
    expect(alertRemainingSeconds('2026-09-16T11:00:00Z', now)).toBe(0);
    expect(formatRemaining(0)).toBe('encerrando');
  });

  it('survives a timestamp it cannot read', () => {
    expect(alertRemainingSeconds('nem uma data', now)).toBe(0);
  });

  it('says the last minute in the singular', () => {
    expect(formatRemaining(45)).toBe('falta 1 minuto');
  });
});

describe('failures', () => {
  it('reads the database error out of whatever wrapped it', () => {
    expect(sosFailureCode('sos_rate_limited')).toBe('sos_rate_limited');
    expect(sosFailureCode('P0001: sos_daily_limit')).toBe('sos_daily_limit');
    expect(sosFailureCode('connection reset')).toBe('sos_unknown');
    expect(sosFailureCode(null)).toBe('sos_unknown');
  });

  it('always leaves 190 on the table', () => {
    // Um alerta recusado não pode terminar numa tela sem saída: a ligação é a
    // ação que não depende de nada nosso.
    for (const code of ['sos_rate_limited', 'sos_daily_limit', 'sos_invalid_position', 'sos_unknown'] as const) {
      expect(describeSosFailure(code)).toContain(EMERGENCY_NUMBER);
    }
  });

  it('points at the consent screen when the feature is off', () => {
    expect(describeSosFailure('sos_consent_required')).toContain('Botão de emergência');
  });
});

describe('describeReach', () => {
  it('says plainly when nobody is around, and what to do instead', () => {
    const text = describeReach(0);
    expect(text).toContain('Nenhum motorista');
    expect(text).toContain('5 km');
    expect(text).toContain('190');
  });

  it('counts the drivers it reached', () => {
    expect(describeReach(1)).toBe('1 motorista por perto foi avisado.');
    expect(describeReach(4)).toBe('4 motoristas por perto foram avisados.');
  });
});

describe('contact message', () => {
  it('carries who, where and the fallback', () => {
    const message = contactShareMessage({ driverName: 'Arthur', lat: -23.5505, lon: -46.6333 });
    expect(message).toContain('Arthur');
    expect(message).toContain(mapLink(-23.5505, -46.6333));
    expect(message).toContain(EMERGENCY_NUMBER);
  });

  it('works without a name', () => {
    expect(contactShareMessage({ driverName: null, lat: 0, lon: 0 })).toContain('Um motorista');
    expect(contactShareMessage({ driverName: '   ', lat: 0, lon: 0 })).toContain('Um motorista');
  });
});

describe('guidance', () => {
  it('tells people to stay away and call, never to go there', () => {
    expect(SOS_GUIDANCE).toBe('Não se aproxime. Ligue 190 e informe a localização.');
    expect(SOS_GUIDANCE.toLowerCase()).not.toContain('vá até');
    expect(SOS_GUIDANCE.toLowerCase()).not.toContain('ajude');
  });
});
