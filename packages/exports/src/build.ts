import { summarisePeriod } from '@dinamique/business-logic';
import { formatDuration, metresToKm, millilitresToLitres } from '@dinamique/utils';
import type { ExportData, Sheet, Workbook } from './types';

/**
 * Monta as planilhas a partir dos dados crus (§55).
 *
 * Valores monetários saem em REAIS como número decimal, não em centavos: uma
 * planilha é para a pessoa ler e somar, e ninguém quer ver 28470 onde deveria
 * estar 284,70. A conversão acontece só aqui, na fronteira.
 */

function toReais(cents: number): number {
  return Math.round(cents) / 100;
}

function sum(rows: Record<string, unknown>[], key: string): number {
  return rows.reduce((acc, row) => acc + (typeof row[key] === 'number' ? (row[key] as number) : 0), 0);
}

export function buildWorkbook(data: ExportData): Workbook {
  const sheets: Sheet[] = [
    buildSummarySheet(data),
    buildDailySheet(data),
    buildJourneysSheet(data),
    buildRevenuesSheet(data),
    buildExpensesSheet(data),
    buildFuelSheet(data),
    buildMaintenanceSheet(data),
  ];

  return {
    fileName: `dinamique-${data.period.start}-a-${data.period.end}`,
    // Planilhas sem nenhuma linha só atrapalham quem abre o arquivo.
    sheets: sheets.filter((sheet) => sheet.rows.length > 0 || sheet.name === 'Resumo'),
  };
}

function buildSummarySheet(data: ExportData): Sheet {
  const summary = summarisePeriod({
    journeys: data.journeys.map((journey, index) => ({
      id: String(index),
      startedAt: journey.startedAt,
      endedAt: journey.endedAt,
      pausedSeconds: 0,
      odometerStart: null,
      odometerEnd: null,
      distanceOverride: journey.distance,
    })),
    revenues: data.revenues.map((revenue) => ({
      date: revenue.date,
      amount: revenue.amount,
      tips: revenue.tips,
      tripCount: revenue.tripCount,
      platformId: revenue.platform,
    })),
    expenses: data.expenses.map((expense) => ({
      date: expense.date,
      amount: expense.amount,
      isVehicleCost: true,
    })),
  });

  // Métricas sem denominador aparecem em branco, não como zero — a planilha
  // segue a mesma regra do aplicativo (§6).
  const rows: Record<string, string | number | null>[] = [
    { item: 'Período', valor: `${data.period.start} a ${data.period.end}` },
    { item: 'Faturamento', valor: toReais(summary.grossRevenue) },
    { item: 'Despesas', valor: toReais(summary.totalExpenses) },
    { item: 'Lucro estimado', valor: toReais(summary.netProfit) },
    { item: 'Tempo trabalhado', valor: formatDuration(summary.workedSeconds) },
    { item: 'Distância (km)', valor: summary.distance > 0 ? metresToKm(summary.distance) : null },
    {
      item: 'Faturamento por hora',
      valor: summary.revenuePerHour !== null ? toReais(summary.revenuePerHour) : null,
    },
    {
      item: 'Lucro por hora',
      valor: summary.profitPerHour !== null ? toReais(summary.profitPerHour) : null,
    },
    {
      item: 'Faturamento por km',
      valor: summary.revenuePerKm !== null ? toReais(summary.revenuePerKm) : null,
    },
    {
      item: 'Custo por km',
      valor: summary.costPerKm !== null ? toReais(summary.costPerKm) : null,
    },
    { item: 'Corridas ou entregas', valor: summary.tripCount || null },
    {
      item: 'Ticket médio',
      valor: summary.averageTicket !== null ? toReais(summary.averageTicket) : null,
    },
  ];

  return {
    name: 'Resumo',
    columns: [
      { key: 'item', header: 'Item', format: 'text', width: 26 },
      { key: 'valor', header: 'Valor', format: 'text', width: 20 },
    ],
    rows,
  };
}

function buildDailySheet(data: ExportData): Sheet {
  const rows = data.daily.map((day) => ({
    data: day.date,
    faturamento: toReais(day.grossRevenue),
    despesas: toReais(day.totalExpenses),
    lucro: toReais(day.netProfit),
    tempo: formatDuration(day.workedSeconds),
    km: day.distance > 0 ? metresToKm(day.distance) : null,
    corridas: day.tripCount || null,
  }));

  return {
    name: 'Por dia',
    columns: [
      { key: 'data', header: 'Data', format: 'date', width: 12 },
      { key: 'faturamento', header: 'Faturamento', format: 'currency', width: 14 },
      { key: 'despesas', header: 'Despesas', format: 'currency', width: 14 },
      { key: 'lucro', header: 'Lucro estimado', format: 'currency', width: 16 },
      { key: 'tempo', header: 'Tempo', format: 'text', width: 12 },
      { key: 'km', header: 'KM', format: 'distance', width: 10 },
      { key: 'corridas', header: 'Corridas', format: 'number', width: 10 },
    ],
    rows,
    totals: {
      data: 'Total',
      faturamento: sum(rows, 'faturamento'),
      despesas: sum(rows, 'despesas'),
      lucro: sum(rows, 'lucro'),
      km: sum(rows, 'km') || null,
      corridas: sum(rows, 'corridas') || null,
    },
  };
}

function buildJourneysSheet(data: ExportData): Sheet {
  const rows = data.journeys.map((journey) => ({
    inicio: journey.startedAt,
    fim: journey.endedAt ?? '',
    tempo: formatDuration(journey.workedSeconds),
    km: journey.distance !== null && journey.distance > 0 ? metresToKm(journey.distance) : null,
  }));

  return {
    name: 'Jornadas',
    columns: [
      { key: 'inicio', header: 'Início', format: 'text', width: 22 },
      { key: 'fim', header: 'Fim', format: 'text', width: 22 },
      { key: 'tempo', header: 'Tempo', format: 'text', width: 12 },
      { key: 'km', header: 'KM', format: 'distance', width: 10 },
    ],
    rows,
    totals: { inicio: 'Total', km: sum(rows, 'km') || null },
  };
}

function buildRevenuesSheet(data: ExportData): Sheet {
  const rows = data.revenues.map((revenue) => ({
    data: revenue.date,
    plataforma: revenue.platform ?? '—',
    valor: toReais(revenue.amount),
    gorjeta: revenue.tips > 0 ? toReais(revenue.tips) : null,
    corridas: revenue.tripCount,
    observacao: revenue.note ?? '',
  }));

  return {
    name: 'Receitas',
    columns: [
      { key: 'data', header: 'Data', format: 'date', width: 12 },
      { key: 'plataforma', header: 'Plataforma', format: 'text', width: 16 },
      { key: 'valor', header: 'Valor', format: 'currency', width: 14 },
      { key: 'gorjeta', header: 'Gorjeta', format: 'currency', width: 12 },
      { key: 'corridas', header: 'Corridas', format: 'number', width: 10 },
      { key: 'observacao', header: 'Observação', format: 'text', width: 30 },
    ],
    rows,
    totals: {
      data: 'Total',
      valor: sum(rows, 'valor'),
      gorjeta: sum(rows, 'gorjeta') || null,
      corridas: sum(rows, 'corridas') || null,
    },
  };
}

function buildExpensesSheet(data: ExportData): Sheet {
  const rows = data.expenses.map((expense) => ({
    data: expense.date,
    categoria: expense.category,
    valor: toReais(expense.amount),
    observacao: expense.note ?? '',
  }));

  return {
    name: 'Despesas',
    columns: [
      { key: 'data', header: 'Data', format: 'date', width: 12 },
      { key: 'categoria', header: 'Categoria', format: 'text', width: 18 },
      { key: 'valor', header: 'Valor', format: 'currency', width: 14 },
      { key: 'observacao', header: 'Observação', format: 'text', width: 30 },
    ],
    rows,
    totals: { data: 'Total', valor: sum(rows, 'valor') },
  };
}

function buildFuelSheet(data: ExportData): Sheet {
  const rows = data.fuel.map((log) => ({
    data: log.date,
    combustivel: log.fuelType,
    valor: toReais(log.totalAmount),
    precoLitro: log.pricePerLitre !== null ? toReais(log.pricePerLitre) : null,
    litros: log.volume !== null ? millilitresToLitres(log.volume) : null,
    odometro: log.odometer !== null ? metresToKm(log.odometer) : null,
    posto: log.station ?? '',
  }));

  return {
    name: 'Abastecimentos',
    columns: [
      { key: 'data', header: 'Data', format: 'date', width: 12 },
      { key: 'combustivel', header: 'Combustível', format: 'text', width: 14 },
      { key: 'valor', header: 'Valor', format: 'currency', width: 14 },
      { key: 'precoLitro', header: 'Preço por litro', format: 'currency', width: 16 },
      { key: 'litros', header: 'Litros', format: 'number', width: 10 },
      { key: 'odometro', header: 'Odômetro (km)', format: 'distance', width: 14 },
      { key: 'posto', header: 'Posto', format: 'text', width: 22 },
    ],
    rows,
    totals: {
      data: 'Total',
      valor: sum(rows, 'valor'),
      litros: sum(rows, 'litros') || null,
    },
  };
}

function buildMaintenanceSheet(data: ExportData): Sheet {
  const rows = data.maintenance.map((log) => ({
    data: log.date,
    tipo: log.type,
    valor: toReais(log.amount),
    odometro: log.odometer !== null ? metresToKm(log.odometer) : null,
    observacao: log.note ?? '',
  }));

  return {
    name: 'Manutenção',
    columns: [
      { key: 'data', header: 'Data', format: 'date', width: 12 },
      { key: 'tipo', header: 'Tipo', format: 'text', width: 18 },
      { key: 'valor', header: 'Valor', format: 'currency', width: 14 },
      { key: 'odometro', header: 'Odômetro (km)', format: 'distance', width: 14 },
      { key: 'observacao', header: 'Observação', format: 'text', width: 30 },
    ],
    rows,
    totals: { data: 'Total', valor: sum(rows, 'valor') },
  };
}
