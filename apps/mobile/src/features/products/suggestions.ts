/**
 * The things drivers actually sell in the car, as one-tap starting points.
 *
 * A blank "nome do produto" field is a small wall: it asks someone to invent
 * the wording before they can type a price. These are the answers we already
 * know, so the common case becomes tap, type the price, done. The list is not
 * a limit; "Outro" opens the same field it always was.
 *
 * Prices are deliberately absent. What a bottle of water sells for varies by
 * city and by driver, and a pre-filled price is a number the app made up.
 */
export interface ProductSuggestion {
  name: string;
  hint: string;
}

export const PRODUCT_SUGGESTIONS: ProductSuggestion[] = [
  { name: 'Água', hint: 'Garrafinha gelada' },
  { name: 'Bala', hint: 'Bala ou chiclete' },
  { name: 'Refrigerante', hint: 'Lata ou garrafinha' },
  { name: 'Salgadinho', hint: 'Pacote pequeno' },
  { name: 'Perfume', hint: 'Frasco de revenda' },
  { name: 'Carregador', hint: 'Cabo ou carregador' },
  { name: 'Fone de ouvido', hint: 'Fone simples' },
  { name: 'Suporte de celular', hint: 'Para o painel' },
];
