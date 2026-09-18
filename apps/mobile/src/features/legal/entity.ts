/**
 * Quem responde pelo aplicativo.
 *
 * As duas lojas e a LGPD pedem a mesma coisa: um responsável identificável e
 * uma forma de falar com ele. O que ainda não foi fornecido fica `null` e
 * simplesmente não é impresso: uma política com "[preencher]" na tela é pior
 * do que uma política mais curta.
 *
 * O e-mail é obrigatório para publicar na Google Play (ele aparece na ficha da
 * loja) e para o campo de contato da App Store. Preencha antes de enviar.
 */
export const LEGAL = {
  brand: 'Dinamique',
  site: 'https://dinamique.com.br',
  app: 'https://app.dinamique.com.br',
  /** Razão social, quando houver CNPJ. */
  legalName: null as string | null,
  taxId: null as string | null,
  /** Canal oficial de privacidade. Preencha antes de publicar nas lojas. */
  email: null as string | null,
  /** Data da última revisão destes documentos. */
  updatedAt: '18 de setembro de 2026',
} as const;

/** Como o texto se refere ao responsável, com ou sem razão social. */
export function controllerLine(): string {
  if (LEGAL.legalName && LEGAL.taxId) {
    return `${LEGAL.legalName} (CNPJ ${LEGAL.taxId}), responsável pelo ${LEGAL.brand}`;
  }
  return `A equipe do ${LEGAL.brand}`;
}
