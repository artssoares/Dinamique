import type { Cents, Metres, Seconds } from '@dinamique/types';
import type { PeriodSummary } from '@dinamique/business-logic';
import { formatCents, formatDistanceKm, formatDuration } from '@dinamique/utils';
import type { RecapTrack } from './track';

/**
 * What a recap is *about*, separated from how it moves.
 *
 * The storyboard consumes this and produces a camera path; the renderer
 * consumes both and paints. Keeping the three apart is what makes it possible
 * to unit-test "does this journey produce honest numbers" without a canvas
 * anywhere near the test.
 */

export type RecapMetricKey =
  | 'gross'
  | 'expenses'
  | 'time'
  | 'distance'
  | 'profitPerHour'
  | 'revenuePerKm'
  | 'trips';

export interface RecapMetric {
  key: RecapMetricKey;
  label: string;
  /** Null renders a dash and `reason`, exactly as a metric tile does (§6). */
  value: string | null;
  reason?: string;
}

export interface RecapStats {
  /** "Sexta, 15 de agosto", already localised; the renderer never formats. */
  dateLabel: string;
  driverName: string | null;
  netProfit: Cents;
  netProfitLabel: string;
  grossRevenue: Cents;
  workedSeconds: Seconds;
  /** From the odometer or the manual figure, never from GPS (§6). */
  distance: Metres | null;
  metrics: RecapMetric[];
}

export interface RecapBrand {
  /** Shown in the corner throughout, and large in the closing card. */
  wordmark: string;
  handle: string;
  /** Hex. Defaults come from the design tokens at the call site. */
  primary: string;
  accent: string;
  ink: string;
}

export interface RecapBasemap {
  /**
   * Slippy tile template, `{z}/{x}/{y}`. Null renders the tileless variant:
   * a dark field with the route glowing on it. That variant is a designed
   * fallback, not a broken map, an account with no tile key still gets
   * something worth sending.
   */
  urlTemplate: string | null;
  attribution: string | null;
  tileSize: number;
  /** Highest zoom the provider serves; the camera never asks for more. */
  maxZoom: number;
}

export interface RecapScene {
  id: string;
  stats: RecapStats;
  track: RecapTrack | null;
  basemap: RecapBasemap;
  brand: RecapBrand;
  /** 9:16 by default, the aspect every place this gets sent expects. */
  width: number;
  height: number;
}

export const DEFAULT_BRAND: RecapBrand = {
  wordmark: 'Dinamique',
  handle: 'dinamique.com.br',
  primary: '#0137F7',
  accent: '#FF6A54',
  ink: '#0D1016',
};

export const TILELESS_BASEMAP: RecapBasemap = {
  urlTemplate: null,
  attribution: null,
  tileSize: 256,
  maxZoom: 18,
};

/**
 * The basemap the app ships with: Esri's World Imagery, served as raster
 * tiles with no key and with CORS headers, which is the pair of things a
 * canvas that will be recorded needs. Note the order of the placeholders:
 * this service takes `{z}/{y}/{x}`, y before x, unlike most. The painter
 * substitutes by name, so both orders work; rewritten by hand the wrong way
 * round it loads the wrong piece of the planet without an error.
 *
 * Attribution is drawn on every frame, as the terms require.
 */
export const ESRI_WORLD_IMAGERY: RecapBasemap = {
  urlTemplate:
    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Esri, Maxar, Earthstar Geographics',
  tileSize: 256,
  maxZoom: 19,
};

const WEEKDAYS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** "Sexta-feira, 15 de agosto", the caption under the opening title. */
export function recapDateLabel(date: Date): string {
  const weekday = WEEKDAYS[date.getDay()] ?? '';
  const month = MONTHS[date.getMonth()] ?? '';
  return `${weekday}, ${date.getDate()} de ${month}`;
}

/**
 * The finale's numbers, drawn straight from the period summary.
 *
 * Two rules survive intact from PRODUCT_RULES into the video, because a video
 * gets shared and a shared number is the one people quote:
 *
 *  - gross revenue is never called profit, and the hero figure is labelled
 *    "lucro estimado" rather than "lucro";
 *  - a metric with no denominator is a dash and a reason, never a zero and
 *    never a figure interpolated to look good on camera.
 *
 * It is also why the money never counts up *along the route*. We know what
 * the day earned; we do not know what it had earned by the corner of Faria
 * Lima, and animating a number through values nobody measured would be
 * inventing data for decoration. The money lands at the end, in one count-up.
 */
export function buildRecapStats(input: {
  summary: PeriodSummary;
  date: Date;
  driverName?: string | null;
}): RecapStats {
  const { summary } = input;

  const metrics: RecapMetric[] = [
    { key: 'gross', label: 'Faturamento', value: formatCents(summary.grossRevenue) },
    { key: 'expenses', label: 'Custos', value: formatCents(summary.totalExpenses) },
    {
      key: 'time',
      label: 'Tempo trabalhado',
      value: summary.workedSeconds > 0 ? formatDuration(summary.workedSeconds) : null,
      reason: 'sem tempo registrado',
    },
    {
      key: 'distance',
      label: 'Distância',
      value: summary.distance > 0 ? formatDistanceKm(summary.distance, 1) : null,
      reason: 'sem km informado',
    },
    {
      key: 'profitPerHour',
      label: 'Lucro por hora',
      value: summary.profitPerHour === null ? null : formatCents(summary.profitPerHour),
      reason: 'sem tempo registrado',
    },
    {
      key: 'revenuePerKm',
      label: 'Faturamento por km',
      value: summary.revenuePerKm === null ? null : formatCents(summary.revenuePerKm),
      reason: 'sem km informado',
    },
  ];

  // Four tiles is what fits on a phone screen at arm's length. Prefer the ones
  // that have a figure, but keep the order above so the card does not
  // reshuffle itself between two similar days.
  const chosen = [
    ...metrics.filter((metric) => metric.value !== null),
    ...metrics.filter((metric) => metric.value === null),
  ].slice(0, 4);

  return {
    dateLabel: recapDateLabel(input.date),
    driverName: input.driverName?.trim() ? input.driverName.trim() : null,
    netProfit: summary.netProfit,
    netProfitLabel: formatCents(summary.netProfit),
    grossRevenue: summary.grossRevenue,
    workedSeconds: summary.workedSeconds,
    distance: summary.distance > 0 ? summary.distance : null,
    metrics: metrics
      .filter((metric) => chosen.includes(metric))
      .sort((a, b) => metrics.indexOf(a) - metrics.indexOf(b)),
  };
}
