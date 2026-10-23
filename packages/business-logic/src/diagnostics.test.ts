import { describe, expect, it } from 'vitest';
import { buildErrorPrompt, errorPriority, explainError } from './diagnostics';

const base = {
  id: 7,
  title: 'TypeError: Cannot read property name of undefined',
  detail: 'at CloseJourney (app/journey/close.tsx:88)',
  severity: 'fatal' as const,
  source: 'mobile' as const,
  screen: '/journey/close',
  platform: 'android' as const,
  appVersion: '1.0.4',
  occurrences: 12,
  firstSeenAt: '2026-10-20T10:00:00Z',
  lastSeenAt: '2026-10-23T09:30:00Z',
  context: { journeyId: 'abc' },
};

describe('explainError', () => {
  it('reconhece uma tela que quebrou por dado ausente', () => {
    const explained = explainError(base, 4);
    expect(explained.what).toContain('esperava uma informação');
    expect(explained.impact).toBe('Aconteceu 12 vezes, com 4 usuários. Quando acontece, fechou ou travou o aplicativo.');
  });

  it('separa falha de conexão de falha do aplicativo', () => {
    const explained = explainError({ ...base, title: 'TypeError: Network request failed', detail: null }, 30);
    expect(explained.what).toContain('não conseguiu falar com o servidor');
  });

  it('reconhece recusa das regras de segurança', () => {
    const explained = explainError({ ...base, title: 'new row violates row-level security policy', detail: null });
    expect(explained.nextStep).toContain('permissões do banco');
  });

  it('admite quando não sabe, em vez de chutar', () => {
    const explained = explainError({ ...base, title: 'Erro xyz', detail: null, occurrences: 1 });
    expect(explained.what).toContain('Ainda não sabemos classificar');
    expect(explained.impact).toBe('Aconteceu uma vez. Quando acontece, fechou ou travou o aplicativo.');
  });
});

describe('buildErrorPrompt', () => {
  const prompt = buildErrorPrompt(base, { affectedUsers: 4 });

  it('leva tudo o que quem investiga perguntaria de volta', () => {
    for (const fact of ['/journey/close', 'android', '1.0.4', 'fatal', '12', '4']) {
      expect(prompt).toContain(fact);
    }
    expect(prompt).toContain('artssoares/Dinamique');
    expect(prompt).toContain(base.title);
    expect(prompt).toContain('close.tsx:88');
    expect(prompt).toContain('"journeyId": "abc"');
    expect(prompt).toContain('#7');
  });

  it('não escreve "undefined" quando um dado falta', () => {
    // O título vai cru de propósito, então o teste usa um que não contenha
    // essas palavras – o que se verifica aqui são os campos ausentes.
    const thin = buildErrorPrompt(
      {
        ...base,
        title: 'Falha ao salvar o abastecimento',
        screen: null,
        platform: null,
        appVersion: null,
        detail: null,
        context: {},
      },
      {},
    );
    expect(thin).not.toContain('undefined');
    expect(thin).not.toContain('null');
    expect(thin).toContain('não informado');
  });
});

describe('errorPriority', () => {
  it('põe gravidade antes de volume', () => {
    const fatalRare = errorPriority({ severity: 'fatal', occurrences: 3, status: 'new' });
    const warningCommon = errorPriority({ severity: 'warning', occurrences: 300, status: 'new' });
    expect(fatalRare).toBeGreaterThan(warningCommon);
  });

  it('põe o que ninguém olhou ainda à frente do já resolvido', () => {
    const untouched = errorPriority({ severity: 'error', occurrences: 1, status: 'new' });
    const closed = errorPriority({ severity: 'error', occurrences: 1, status: 'resolved' });
    expect(untouched).toBeGreaterThan(closed);
  });
});
