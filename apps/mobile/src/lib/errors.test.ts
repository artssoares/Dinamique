import { describe, expect, it } from 'vitest';
import { toFriendlyError } from './errors';

describe('toFriendlyError', () => {
  it('nunca devolve uma mensagem em inglês para o motorista', () => {
    const cases = [
      new Error('Database error saving new user'),
      new Error('Error sending confirmation email'),
      new Error('Invalid login credentials'),
      new Error('network request failed'),
      new Error('alguma coisa que nunca vimos'),
    ];
    for (const error of cases) {
      const { message } = toFriendlyError(error);
      expect(message).not.toMatch(/error|failed|invalid/i);
      expect(message.length).toBeGreaterThan(20);
    }
  });

  // Estes três chegam de um projeto Supabase recém-configurado e caíam todos no
  // mesmo texto genérico, o que tornava impossível saber qual era o problema.
  it('separa a falha do banco da falha de envio de email', () => {
    const banco = toFriendlyError(new Error('Database error saving new user'));
    const email = toFriendlyError(new Error('Error sending confirmation email'));
    expect(banco.message).not.toBe(email.message);
    expect(banco.message).toContain('banco de dados');
    expect(email.message).toContain('email de confirmação');
  });

  it('carrega o texto cru do servidor como detalhe técnico', () => {
    const { detail } = toFriendlyError(new Error('Database error saving new user'));
    expect(detail).toBe('Database error saving new user');
  });

  it('carrega o detalhe também quando a falha é desconhecida', () => {
    // É justamente o caso sem tradução que precisa da pista: sem o detalhe,
    // "tente novamente em instantes" é tudo o que sobra para investigar.
    const { detail } = toFriendlyError(new Error('boom inesperado'));
    expect(detail).toBe('boom inesperado');
  });

  it('não inventa detalhe quando não há texto nenhum', () => {
    expect(toFriendlyError(null).detail).toBeUndefined();
  });

  it('não expõe detalhe técnico em falhas que o motorista resolve sozinho', () => {
    // Senha curta e email/senha errados são erros DELE, não nossos: mostrar
    // texto técnico aqui só assusta sem ajudar.
    expect(toFriendlyError(new Error('Invalid login credentials')).detail).toBeUndefined();
    expect(toFriendlyError(new Error('Password should be at least 8 characters')).detail)
      .toBeUndefined();
  });

  // O Supabase não lança: devolve `{ error }`, e esse erro é um objeto simples.
  // Passar por String() dava "[object Object]", que não bate com nenhuma regra
  // e apagava a única linha útil.
  it('lê a mensagem de um erro do Supabase, que não é um Error', () => {
    const { title, detail } = toFriendlyError({
      message: 'new row violates row-level security policy for table "journeys"',
      code: '42501',
    });
    expect(title).toBe('Sem permissão');
    expect(detail).toContain('row-level security');
    expect(detail).toContain('42501');
  });

  it('trata a falta de conexão como dado preservado, não como perda', () => {
    const { message } = toFriendlyError(new Error('Network request failed'));
    expect(message).toContain('continuam neste aparelho');
  });
});
