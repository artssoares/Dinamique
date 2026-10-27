import type { AppError, AppErrorSeverity, AppErrorStatus } from '@dinamique/types';

/**
 * O que fazer com um erro depois de vê-lo.
 *
 * Duas coisas moram aqui. A primeira é o palpite em português do que a falha
 * significa, para quem abre o painel e não programa. A segunda é o prompt
 * pronto para investigar: a lista de erros só serve se, do lado dela, houver
 * um texto que possa ser colado e já contenha tudo o que quem investiga vai
 * perguntar. Montar esse texto na tela faria dele algo impossível de testar.
 */

export interface ErrorExplanation {
  /** Uma frase sobre o que provavelmente aconteceu. */
  what: string;
  /** Quem sente o problema, e quanto. */
  impact: string;
  /** Se dá para mexer agora ou se é preciso código. */
  nextStep: string;
}

interface Classification {
  what: string;
  nextStep: string;
}

/**
 * Famílias de falha reconhecidas pelo texto. A ordem importa: a primeira que
 * casa ganha, então as pistas mais específicas vêm antes das genéricas.
 */
const FAMILIES: { hints: string[]; classify: Classification }[] = [
  {
    hints: ['network', 'fetch failed', 'timeout', 'offline', 'econnrefused', 'connection'],
    classify: {
      what: 'O aplicativo não conseguiu falar com o servidor. Normalmente é a internet do usuário, não o app.',
      nextStep: 'Se acontece com muita gente ao mesmo tempo, o problema é do servidor. Com uma pessoa só, foi a conexão dela.',
    },
  },
  {
    hints: ['row-level security', 'permission denied', 'not authorized', '42501'],
    classify: {
      what: 'O aplicativo tentou ler ou gravar algo que as regras de segurança do banco não permitem.',
      nextStep: 'Precisa de ajuste no código ou nas permissões do banco. Não dá para resolver pelo painel.',
    },
  },
  {
    hints: ['duplicate key', 'unique constraint', '23505'],
    classify: {
      what: 'Tentou criar algo que já existia — dois registros com a mesma identidade.',
      nextStep: 'Em geral é um toque duplo no botão. Vale conferir se o usuário ficou com o lançamento repetido.',
    },
  },
  {
    hints: ['violates foreign key', 'violates check constraint', '23503', '23514'],
    classify: {
      what: 'Um dado chegou fora das regras do banco (valor inválido ou apontando para algo que não existe).',
      nextStep: 'É falha de validação no app: a tela deixou passar o que o banco recusa. Precisa de código.',
    },
  },
  {
    hints: ['cannot read propert', 'undefined is not an object', 'null is not an object', 'of undefined', 'of null'],
    classify: {
      what: 'Uma tela esperava uma informação que não chegou e quebrou ao tentar usá-la.',
      nextStep: 'É falha no código da tela. Costuma deixar a tela branca ou o botão sem efeito.',
    },
  },
  {
    hints: ['invalid login credentials', 'email not confirmed', 'invalid_grant'],
    classify: {
      what: 'Problema de entrada na conta: senha, email não confirmado ou sessão vencida.',
      nextStep: 'Se é uma pessoa só, orientar a recuperar a senha. Se é muita gente, o login está com defeito.',
    },
  },
  {
    hints: ['rate limit', 'too many requests', '429'],
    classify: {
      what: 'Um serviço recusou o pedido por excesso de tentativas em pouco tempo.',
      nextStep: 'Passa sozinho. Se repete todos os dias, o limite do serviço precisa subir.',
    },
  },
  {
    hints: ['out of memory', 'maximum call stack', 'heap'],
    classify: {
      what: 'O aplicativo consumiu mais memória do que o aparelho tinha e foi encerrado.',
      nextStep: 'É falha de desempenho no código. Costuma travar o aparelho antes de fechar.',
    },
  },
];

const SEVERITY_WORDS: Record<AppErrorSeverity, string> = {
  fatal: 'fechou ou travou o aplicativo',
  error: 'impediu a ação que o usuário tentou fazer',
  warning: 'incomodou, mas o usuário conseguiu continuar',
};

/** Palpite em português do que a falha significa, para quem não programa. */
export function explainError(
  error: Pick<AppError, 'title' | 'detail' | 'severity' | 'occurrences' | 'screen'>,
  affectedUsers: number | null = null,
): ErrorExplanation {
  const haystack = `${error.title} ${error.detail ?? ''}`.toLowerCase();
  const family = FAMILIES.find((candidate) =>
    candidate.hints.some((hint) => haystack.includes(hint)),
  );

  const times = error.occurrences === 1 ? 'uma vez' : `${error.occurrences} vezes`;
  const people =
    affectedUsers === null || affectedUsers === 0
      ? ''
      : affectedUsers === 1
        ? ', com 1 usuário'
        : `, com ${affectedUsers} usuários`;

  return {
    what:
      family?.classify.what ??
      'Ainda não sabemos classificar essa falha pelo texto dela. O prompt abaixo serve justamente para isso.',
    impact: `Aconteceu ${times}${people}. Quando acontece, ${SEVERITY_WORDS[error.severity]}.`,
    nextStep:
      family?.classify.nextStep ??
      'Copie o prompt e cole numa conversa com o Claude para descobrir a causa.',
  };
}

/**
 * O prompt de avaliação, pronto para colar.
 *
 * Carrega tudo o que quem investiga perguntaria de volta — tela, versão,
 * aparelho, quantas vezes, desde quando, pilha — porque uma ida e volta a
 * mais é uma ida e volta que o dono do painel não tem como responder.
 */
export function buildErrorPrompt(
  error: Pick<
    AppError,
    'id' | 'title' | 'detail' | 'severity' | 'source' | 'screen' | 'platform' | 'appVersion' | 'occurrences' | 'firstSeenAt' | 'lastSeenAt' | 'context'
  >,
  options: { affectedUsers?: number | null; repository?: string } = {},
): string {
  const repo = options.repository ?? 'artssoares/Dinamique';
  const unknown = 'não informado';

  const facts: [string, string][] = [
    ['Onde', error.screen ?? unknown],
    ['Origem', error.source === 'mobile' ? 'aplicativo' : error.source === 'admin' ? 'painel' : 'servidor'],
    ['Aparelho', error.platform ?? unknown],
    ['Versão do app', error.appVersion ?? unknown],
    ['Gravidade', error.severity],
    ['Vezes', String(error.occurrences)],
    ['Usuários atingidos', options.affectedUsers == null ? unknown : String(options.affectedUsers)],
    ['Primeira vez', error.firstSeenAt],
    ['Última vez', error.lastSeenAt],
  ];

  const contextKeys = Object.keys(error.context ?? {});

  return [
    `Investigue este erro do aplicativo Dinamique (repositório ${repo}).`,
    '',
    '## O erro',
    '',
    '```',
    error.title,
    '```',
    '',
    ...facts.map(([label, value]) => `- **${label}:** ${value}`),
    '',
    ...(error.detail
      ? ['## Detalhe técnico', '', '```', error.detail.slice(0, 4000), '```', '']
      : []),
    ...(contextKeys.length > 0
      ? ['## Contexto enviado pelo app', '', '```json', JSON.stringify(error.context, null, 2), '```', '']
      : []),
    '## O que eu preciso',
    '',
    '1. A causa provável, em uma frase que alguém que não programa entenda.',
    '2. O arquivo e a linha mais prováveis no repositório, com o trecho de código.',
    '3. A correção, como alteração pronta para aplicar.',
    '4. Como eu confirmo que foi resolvido, em passos que eu possa seguir no celular.',
    '5. Se for problema do usuário e não do app, diga isso e o que responder a ele.',
    '',
    `Referência interna deste erro: #${error.id}.`,
  ].join('\n');
}

const STATUS_WORDS: Record<AppErrorStatus, string> = {
  new: 'Novo',
  investigating: 'Investigando',
  resolved: 'Resolvido',
  ignored: 'Ignorado',
};

export function describeErrorStatus(status: AppErrorStatus): string {
  return STATUS_WORDS[status];
}

/**
 * A ordem em que os erros merecem atenção: gravidade primeiro, depois se
 * alguém já olhou, depois quantas vezes. Um erro fatal que aconteceu três
 * vezes vem antes de um aviso que aconteceu trezentas.
 *
 * Quando aconteceu de propósito não entra: a lista já vem ordenada por data do
 * banco, e misturar as duas coisas num número só faria um erro antigo e grave
 * desaparecer sob um recente e bobo.
 */
export function errorPriority(
  error: Pick<AppError, 'severity' | 'occurrences' | 'status'>,
): number {
  const severityWeight = { fatal: 3, error: 2, warning: 1 }[error.severity];
  const statusWeight = error.status === 'new' ? 2 : error.status === 'investigating' ? 1 : 0;
  return severityWeight * 1000 + statusWeight * 100 + Math.min(error.occurrences, 99);
}
