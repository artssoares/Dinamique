import type { Cents, DateOnly } from '@dinamique/types';

/**
 * Descrição de uma planilha, independente do formato final.
 *
 * A montagem dos dados é separada da geração do arquivo: assim a mesma
 * definição vira XLSX ou CSV, e os testes verificam o conteúdo sem precisar
 * abrir um binário.
 */

export type CellFormat = 'text' | 'currency' | 'number' | 'date' | 'duration' | 'distance';

export interface Column {
  key: string;
  header: string;
  format: CellFormat;
  /** Largura em caracteres, para o Excel não cortar o cabeçalho. */
  width?: number;
}

export type CellValue = string | number | null;

export interface Sheet {
  name: string;
  columns: Column[];
  rows: Record<string, CellValue>[];
  /** Linha de totais, quando faz sentido somar a planilha. */
  totals?: Record<string, CellValue>;
}

export interface Workbook {
  fileName: string;
  sheets: Sheet[];
}

/** Dados crus vindos do banco, no formato que a montagem espera. */
export interface ExportData {
  period: { start: DateOnly; end: DateOnly };
  daily: {
    date: DateOnly;
    grossRevenue: Cents;
    totalExpenses: Cents;
    netProfit: Cents;
    workedSeconds: number;
    distance: number;
    tripCount: number;
  }[];
  journeys: {
    startedAt: string;
    endedAt: string | null;
    workedSeconds: number;
    distance: number | null;
  }[];
  revenues: {
    date: DateOnly;
    platform: string | null;
    amount: Cents;
    tips: Cents;
    tripCount: number | null;
    note: string | null;
  }[];
  expenses: {
    date: DateOnly;
    category: string;
    amount: Cents;
    note: string | null;
  }[];
  fuel: {
    date: DateOnly;
    fuelType: string;
    totalAmount: Cents;
    pricePerLitre: Cents | null;
    volume: number | null;
    odometer: number | null;
    station: string | null;
  }[];
  maintenance: {
    date: DateOnly;
    type: string;
    amount: Cents;
    odometer: number | null;
    note: string | null;
  }[];
}
