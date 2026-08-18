import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildWorkbook } from './build';
import { toCsv, toCsvBundle, toXlsx } from './render';
import type { ExportData } from './types';

const data: ExportData = {
  period: { start: '2026-08-01', end: '2026-08-31' },
  daily: [
    {
      date: '2026-08-01',
      grossRevenue: 34200,
      totalExpenses: 9100,
      netProfit: 25100,
      workedSeconds: 28800,
      distance: 200000,
      tripCount: 12,
    },
    {
      date: '2026-08-02',
      grossRevenue: 28000,
      totalExpenses: 7000,
      netProfit: 21000,
      workedSeconds: 25200,
      distance: 180000,
      tripCount: 10,
    },
  ],
  journeys: [
    {
      startedAt: '2026-08-01T07:00:00.000Z',
      endedAt: '2026-08-01T15:00:00.000Z',
      workedSeconds: 28800,
      distance: 200000,
    },
  ],
  revenues: [
    { date: '2026-08-01', platform: 'Uber', amount: 21000, tips: 500, tripCount: 8, note: null },
    {
      date: '2026-08-01',
      platform: '99',
      amount: 12700,
      tips: 0,
      tripCount: 4,
      note: 'corrida longa, saiu de Guarulhos',
    },
  ],
  expenses: [
    { date: '2026-08-01', category: 'Combustível', amount: 7000, note: null },
    { date: '2026-08-01', category: 'Alimentação', amount: 2100, note: null },
  ],
  fuel: [
    {
      date: '2026-08-01',
      fuelType: 'gasoline',
      totalAmount: 18000,
      pricePerLitre: 589,
      volume: 30560,
      odometer: 82000000,
      station: 'Posto Ipiranga',
    },
  ],
  maintenance: [
    { date: '2026-08-01', type: 'Troca de óleo', amount: 30000, odometer: 82000000, note: null },
  ],
};

describe('buildWorkbook', () => {
  it('cria as abas esperadas', () => {
    const workbook = buildWorkbook(data);
    expect(workbook.sheets.map((sheet) => sheet.name)).toEqual([
      'Resumo',
      'Por dia',
      'Jornadas',
      'Receitas',
      'Despesas',
      'Abastecimentos',
      'Manutenção',
    ]);
  });

  it('converte centavos em reais na planilha', () => {
    const workbook = buildWorkbook(data);
    const daily = workbook.sheets.find((sheet) => sheet.name === 'Por dia')!;
    expect(daily.rows[0]!.faturamento).toBe(342);
    expect(daily.rows[0]!.lucro).toBe(251);
  });

  it('soma os totais de cada aba', () => {
    const workbook = buildWorkbook(data);
    const daily = workbook.sheets.find((sheet) => sheet.name === 'Por dia')!;
    expect(daily.totals?.faturamento).toBe(622);
    expect(daily.totals?.lucro).toBe(461);
    expect(daily.totals?.km).toBe(380);
  });

  it('deixa em branco a métrica sem denominador, em vez de zero (§6)', () => {
    const semKm = buildWorkbook({
      ...data,
      journeys: [{ ...data.journeys[0]!, distance: null }],
      daily: data.daily.map((day) => ({ ...day, distance: 0 })),
    });
    const resumo = semKm.sheets[0]!;
    const porKm = resumo.rows.find((row) => row.item === 'Faturamento por km');
    expect(porKm?.valor).toBeNull();

    const comKm = buildWorkbook(data).sheets[0]!;
    expect(comKm.rows.find((row) => row.item === 'Faturamento por km')?.valor).toBe(1.71);
  });

  it('omite abas vazias, mas mantém o resumo', () => {
    const vazio = buildWorkbook({
      ...data,
      journeys: [],
      revenues: [],
      expenses: [],
      fuel: [],
      maintenance: [],
      daily: [],
    });
    expect(vazio.sheets.map((sheet) => sheet.name)).toEqual(['Resumo']);
  });

  it('usa o período no nome do arquivo', () => {
    expect(buildWorkbook(data).fileName).toBe('dinamique-2026-08-01-a-2026-08-31');
  });
});

describe('toCsv', () => {
  it('escapa campos que contêm o separador em uso', () => {
    const sheet = {
      name: 'Teste',
      columns: [{ key: 'a', header: 'A', format: 'text' as const }],
      rows: [{ a: 'corrida longa; saiu de Guarulhos' }],
    };
    expect(toCsv(sheet)).toContain('"corrida longa; saiu de Guarulhos"');

    // Com vírgula como separador, é a vírgula que passa a exigir escape.
    const comVirgula = toCsv(
      { ...sheet, rows: [{ a: 'corrida longa, saiu de Guarulhos' }] },
      { separator: ',' },
    );
    expect(comVirgula).toContain('"corrida longa, saiu de Guarulhos"');
  });

  it('usa vírgula decimal, como o Excel em português espera', () => {
    const workbook = buildWorkbook(data);
    const fuel = workbook.sheets.find((sheet) => sheet.name === 'Abastecimentos')!;
    const csv = toCsv(fuel);
    expect(csv).toContain('5,89');
  });

  it('inclui cabeçalho e linha de total', () => {
    const workbook = buildWorkbook(data);
    const despesas = workbook.sheets.find((sheet) => sheet.name === 'Despesas')!;
    const lines = toCsv(despesas).split('\r\n');
    expect(lines[0]).toContain('Categoria');
    expect(lines[lines.length - 1]).toContain('Total');
  });

  it('escapa aspas duplicando-as', () => {
    const csv = toCsv({
      name: 'Teste',
      columns: [{ key: 'a', header: 'A', format: 'text' }],
      rows: [{ a: 'ele disse "oi"' }],
    });
    expect(csv).toContain('"ele disse ""oi"""');
  });

  it('junta todas as abas no pacote', () => {
    const bundle = toCsvBundle(buildWorkbook(data));
    expect(bundle).toContain('# Resumo');
    expect(bundle).toContain('# Receitas');
  });
});

describe('toXlsx', () => {
  it('gera um arquivo que abre de volta com as abas certas', () => {
    const bytes = toXlsx(buildWorkbook(data));
    expect(bytes.length).toBeGreaterThan(0);

    const reopened = XLSX.read(bytes, { type: 'array' });
    expect(reopened.SheetNames).toContain('Resumo');
    expect(reopened.SheetNames).toContain('Receitas');
  });

  it('preserva os valores ao reabrir', () => {
    const bytes = toXlsx(buildWorkbook(data));
    const reopened = XLSX.read(bytes, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(reopened.Sheets['Por dia']!);

    expect(rows[0]!['Faturamento']).toBe(342);
    expect(rows[0]!['Lucro estimado']).toBe(251);
  });

  it('aplica formato de moeda nas colunas de dinheiro', () => {
    const bytes = toXlsx(buildWorkbook(data));
    const reopened = XLSX.read(bytes, { type: 'array', cellStyles: true });
    const sheet = reopened.Sheets['Por dia']!;
    // B2 é o primeiro valor de faturamento.
    expect((sheet['B2'] as { z?: string }).z).toBe('R$ #,##0.00');
  });

  it('define largura de coluna para o cabeçalho não ficar cortado', () => {
    // A largura é gravada no arquivo, mas o SheetJS não a devolve numa leitura
    // simples — conferimos na definição, que é a fonte da informação.
    const workbook = buildWorkbook(data);
    const daily = workbook.sheets.find((sheet) => sheet.name === 'Por dia')!;
    expect(daily.columns.every((column) => (column.width ?? 0) >= 10)).toBe(true);
  });
});
