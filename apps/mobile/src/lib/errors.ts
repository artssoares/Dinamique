/**
 * Human error messages (§113). A driver should never see "Error 500"; they
 * should see what happened to their data and what to do next.
 *
 * Junto com a mensagem humana vai um `detail` técnico opcional. A primeira
 * tentativa de cadastro em produção falhou com "Não conseguimos concluir
 * agora", que é verdade e não ajuda ninguém: nem o motorista, nem quem vai
 * atender o motorista. A mensagem humana continua em primeiro plano; o detalhe
 * fica pequeno e discreto embaixo, para poder ser lido em voz alta no suporte.
 */

export interface FriendlyError {
  title: string;
  message: string;
  /** Texto cru do servidor. Só aparece quando existe, em tamanho reduzido. */
  detail?: string;
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

  // As três falhas de cadastro que aparecem em projeto recém-configurado. Sem
  // estas linhas, todas caem no texto genérico e ficam indistinguíveis – o que
  // aconteceu de verdade na primeira instalação.
  if (lowered.includes('database error saving new user')) {
    return {
      title: 'Não conseguimos criar sua conta',
      message: 'O cadastro chegou, mas a criação do seu perfil falhou no banco de dados. É um problema do nosso lado, avise o suporte.',
      detail: raw,
    };
  }

  if (lowered.includes('error sending confirmation email') || lowered.includes('error sending email')) {
    return {
      title: 'Não conseguimos enviar o email',
      message: 'Sua conta não foi criada porque o email de confirmação não pôde ser enviado. É um problema do nosso lado, avise o suporte.',
      detail: raw,
    };
  }

  if (lowered.includes('email rate limit exceeded') || lowered.includes('over_email_send_rate_limit')) {
    return {
      title: 'Muitas tentativas',
      message: 'O limite de emails desta hora foi atingido. Tente de novo daqui a pouco.',
      detail: raw,
    };
  }

  if (lowered.includes('signups not allowed') || lowered.includes('signup is disabled')) {
    return {
      title: 'Cadastro desativado',
      message: 'O cadastro de novas contas está desligado no momento.',
      detail: raw,
    };
  }

  if (lowered.includes('password should be at least') || lowered.includes('weak_password')) {
    return {
      title: 'Senha muito curta',
      message: 'Escolha uma senha com pelo menos 8 caracteres.',
    };
  }

  if (lowered.includes('row-level security') || lowered.includes('permission denied')) {
    return {
      title: 'Sem permissão',
      message: 'Você não tem acesso a essa informação. Se isso parecer errado, fale com o suporte.',
      detail: raw,
    };
  }

  return {
    title: 'Algo deu errado',
    message: 'Não conseguimos concluir agora. Tente novamente em instantes.',
    // O texto cru é a única pista quando a falha não é nenhuma das conhecidas.
    // Sem ele, "tente novamente" é tudo o que sobra para investigar.
    detail: raw || undefined,
  };
}
