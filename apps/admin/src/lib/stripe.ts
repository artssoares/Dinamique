import Stripe from 'stripe';

/**
 * Cliente do Stripe. Servidor apenas.
 *
 * A chave secreta cobra dinheiro de verdade. Ela não tem prefixo
 * `NEXT_PUBLIC_`, então o Next se recusa a incluí-la no pacote do navegador —
 * a garantia é do bundler, não da disciplina de quem escreve o import.
 */

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (client) return client;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY não configurada. Veja apps/admin/.env.example.');
  }

  client = new Stripe(key, {
    // Fixar a versão evita que uma atualização do Stripe mude o formato dos
    // webhooks sem aviso.
    apiVersion: '2025-02-24.acacia',
    typescript: true,
    appInfo: { name: 'Dinamique', version: '0.1.0' },
  });

  return client;
}

export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET não configurado. Veja apps/admin/.env.example.');
  }
  return secret;
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}
