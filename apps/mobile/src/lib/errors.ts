/**
 * Human error messages (§113). A driver should never see "Error 500"; they
 * should see what happened to their data and what to do next.
 */

export interface FriendlyError {
  title: string;
  message: string;
}

const NETWORK_HINTS = ['network', 'fetch', 'timeout', 'offline', 'connection'];

export function toFriendlyError(error: unknown): FriendlyError {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const lowered = raw.toLowerCase();

  if (NETWORK_HINTS.some((hint) => lowered.includes(hint))) {
    return {
      title: 'Sem conexão',
      message: 'Não conseguimos salvar agora. Seus dados continuam neste aparelho e vamos sincronizar assim que a conexão voltar.',
    };
  }

  if (lowered.includes('invalid login credentials')) {
    return { title: 'Não foi possível entrar', message: 'Email ou senha incorretos.' };
  }

  if (lowered.includes('user already registered')) {
    return { title: 'Conta já existe', message: 'Esse email já tem uma conta no Dinamique. Tente entrar.' };
  }

  if (lowered.includes('email not confirmed')) {
    return { title: 'Confirme seu email', message: 'Enviamos um link de confirmação para o seu email.' };
  }

  if (lowered.includes('row-level security') || lowered.includes('permission denied')) {
    return {
      title: 'Sem permissão',
      message: 'Você não tem acesso a essa informação. Se isso parecer errado, fale com o suporte.',
    };
  }

  return {
    title: 'Algo deu errado',
    message: 'Não conseguimos concluir agora. Tente novamente em instantes.',
  };
}
