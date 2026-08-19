import * as XLSX from 'xlsx';
import type { CellFormat, Sheet, Workbook } from './types';

/**
 * Geração dos arquivos.
 *
 * O XLSX sai com nome de aba, cabeçalho, formato de moeda e data, largura de
 * coluna e linha de total. A edição comunitária do SheetJS não aplica estilo
 * de célula (negrito, cor de fundo), então o cabeçalho não vem em negrito –
 * está documentado em EXPORTS.md em vez de fingirmos que vem.
 */

/** Formatos numéricos do Excel, no padrão brasileiro. */
const NUMBER_FORMATS: Record<CellFormat, string | undefined> = {
  text: undefined,
  currency: 'R$ #,##0.00',
  number: '#,##0',
  date: 'dd/mm/yyyy',
  duration: undefined,
  distance: '#,##0.0',
};

export function toXlsx(workbook: Workbook): Uint8Array {
  const book = XLSX.utils.book_new();

  for (const sheet of workbook.sheets) {
    const header = sheet.columns.map((column) => column.header);
    const body = sheet.rows.map((row) => sheet.columns.map((column) => row[column.key] ?? null));

    const matrix: (string | number | null)[][] = [header, ...body];
    if (sheet.totals) {
      matrix.push(sheet.columns.map((column) => sheet.totals?.[column.key] ?? null));
    }

    const worksheet = XLSX.utils.aoa_to_sheet(matrix);

    worksheet['!cols'] = sheet.columns.map((column) => ({ wch: column.width ?? 14 }));
    // Congela o cabeçalho para a planilha continuar legível ao rolar.
    worksheet['!freeze'] = { xSplit: '0', ySplit: '1' };

    applyFormats(worksheet, sheet, matrix.length);

    // O Excel limita o nome da aba a 31 caracteres.
    XLSX.utils.book_append_sheet(book, worksheet, sheet.name.slice(0, 31));
  }

  // `type: 'array'` devolve um ArrayBuffer; quem grava o arquivo precisa de
  // bytes, então convertemos aqui em vez de deixar o chamador descobrir.
  const buffer = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Uint8Array(buffer);
}

function applyFormats(worksheet: XLSX.WorkSheet, sheet: Sheet, rowCount: number): void {
  sheet.columns.forEach((column, columnIndex) => {
    const format = NUMBER_FORMATS[column.format];
    if (!format) return;

    // Linha 0 é o cabeçalho; formatar a partir da 1.
    for (let rowIndex = 1; rowIndex < rowCount; rowIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = worksheet[address] as XLSX.CellObject | undefined;
      if (cell && cell.t === 'n') {
        cell.z = format;
      }
    }
  });
}

/**
 * CSV de uma planilha. Campos com vírgula, aspas ou quebra de linha são
 * escapados – sem isso, uma observação com vírgula quebraria a coluna.
 */
export function toCsv(sheet: Sheet, options: { separator?: string } = {}): string {
  const separator = options.separator ?? ';';

  const escape = (value: string | number | null): string => {
    if (value === null || value === undefined) return '';
    const text = typeof value === 'number' ? formatNumberForCsv(value) : String(value);
    if (text.includes(separator) || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const lines: string[] = [
    sheet.columns.map((column) => escape(column.header)).join(separator),
    ...sheet.rows.map((row) =>
      sheet.columns.map((column) => escape(row[column.key] ?? null)).join(separator),
    ),
  ];

  if (sheet.totals) {
    lines.push(
      sheet.columns.map((column) => escape(sheet.totals?.[column.key] ?? null)).join(separator),
    );
  }

  return lines.join('\r\n');
}

/**
 * Número no padrão brasileiro (vírgula decimal). Combina com o separador `;`,
 * que é o que o Excel em português espera.
 */
function formatNumberForCsv(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ',');
}

/** Um único CSV com todas as abas, separadas por um cabeçalho de seção. */
export function toCsvBundle(workbook: Workbook): string {
  return workbook.sheets
    .map((sheet) => `# ${sheet.name}\r\n${toCsv(sheet)}`)
    .join('\r\n\r\n');
}
