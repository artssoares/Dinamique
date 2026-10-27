import type { ActivityRow } from '@dinamique/types';

/**
 * Atividade dos usuários em português corrido.
 *
 * O painel mostra texto, não códigos. `journey_completed` não diz nada a quem
 * abre a tela; "encerrou a jornada do dia" diz. A tradução vive aqui, e não na
 * tela, porque é a única parte que dá para testar — e porque a mesma frase é
 * usada na linha do tempo do usuário e na avaliação de um erro.
 */

/** O que cada evento quer dizer, na voz de quem fez. */
const EVENT_SENTENCES: Record<string, string> = {
  signup_completed: 'criou a conta',
  account_created: 'criou a conta',
  onboarding_completed: 'terminou o primeiro acesso',
  profile_photo_added: 'colocou foto no perfil',
  vehicle_added: 'cadastrou um veículo',
  journey_started: 'começou uma jornada',
  journey_paused: 'pausou a jornada',
  journey_completed: 'encerrou a jornada',
  revenue_added: 'lançou um ganho',
  expense_added: 'lançou um gasto',
  fuel_added: 'lançou um abastecimento',
  goal_created: 'criou uma meta',
  goal_reached: 'bateu a meta',
  insight_viewed: 'leu os insights',
  notification_opened: 'abriu uma notificação',
  export_created: 'exportou os dados',
  trial_started: 'começou o teste grátis de 7 dias',
  trial_expired: 'ficou sem o teste grátis',
  subscription_started: 'assinou o Pro',
  subscription_cancelled: 'cancelou a assinatura',
  support_ticket_created: 'abriu um pedido de suporte',
  support_message_sent: 'escreveu no suporte',
  support_ticket_resolved: 'teve o suporte resolvido',
  referral_shared: 'compartilhou o código de indicação',
  referral_signup_completed: 'entrou por indicação de alguém',
  referral_discount_created: 'ganhou um desconto por indicação',
  referral_discount_used: 'usou um desconto',
  promotion_code_used: 'resgatou um código',
  influencer_application_submitted: 'se candidatou a influencer',
  influencer_approved: 'foi aprovado como influencer',
  plan_granted: 'recebeu um plano',
  app_error: 'esbarrou num erro',
};

const PLAN_SOURCE_WORDS: Record<string, string> = {
  subscription: 'assinatura paga',
  trial: 'teste grátis',
  courtesy: 'cortesia',
  partnership: 'parceria',
  promotion: 'promoção',
};

const PLATFORM_WORDS: Record<string, string> = {
  ios: 'iPhone',
  android: 'Android',
  web: 'navegador',
  admin: 'painel',
};

/**
 * A frase principal: o que a pessoa fez.
 *
 * Um evento desconhecido não vira linha em branco nem "undefined": vira o
 * próprio nome com os sublinhados trocados, que é feio mas legível. Isso
 * importa porque o código novo entra antes de esta lista crescer.
 */
export function describeActivity(row: Pick<ActivityRow, 'code' | 'detail'>): string {
  const base = EVENT_SENTENCES[row.code];
  if (base === undefined) return row.code.replace(/_/g, ' ');

  if (row.code === 'plan_granted') {
    const source = typeof row.detail?.source === 'string' ? row.detail.source : null;
    const word = source === null ? null : (PLAN_SOURCE_WORDS[source] ?? source);
    const plan = typeof row.detail?.plan === 'string' ? row.detail.plan.toUpperCase() : 'PRO';
    return word === null ? `recebeu o ${plan}` : `recebeu o ${plan} por ${word}`;
  }

  if (row.code === 'app_error') {
    const title = typeof row.detail?.title === 'string' ? row.detail.title : null;
    return title === null ? base : `esbarrou num erro: ${title}`;
  }

  return base;
}

/** O complemento discreto: de onde veio e em qual versão. Vazio quando não se sabe. */
export function describeActivitySource(
  row: Pick<ActivityRow, 'platform' | 'appVersion'>,
): string {
  const where = row.platform === null ? null : (PLATFORM_WORDS[row.platform] ?? row.platform);
  const version = row.appVersion === null ? null : `versão ${row.appVersion}`;
  return [where, version].filter((part): part is string => part !== null).join(' · ');
}

/** "agora", "há 8 min", e uma data quando o relativo deixa de ajudar. */
export function describeWhen(at: string, now: number = Date.now()): string {
  const minutes = Math.round((now - Date.parse(at)) / 60_000);
  if (!Number.isFinite(minutes)) return at;
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 1440) return `há ${Math.floor(minutes / 60)} h`;
  if (minutes < 10_080) return `há ${Math.floor(minutes / 1440)} d`;
  return new Date(at).toLocaleDateString('pt-BR');
}
