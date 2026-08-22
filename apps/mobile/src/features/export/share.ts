import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { buildWorkbook, toCsvBundle, toXlsx, type ExportData } from '@dinamique/exports';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';

export type ExportFormat = 'xlsx' | 'csv';

const MIME: Record<ExportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
};

/**
 * Gera o arquivo e entrega ao usuário (§55).
 *
 * No celular usa a folha de compartilhamento nativa; na web, um download
 * comum. O arquivo é montado no aparelho – os dados não passam por servidor
 * nenhum além do Supabase de onde vieram.
 */
export async function exportAndShare(
  userId: string,
  data: ExportData,
  format: ExportFormat,
): Promise<{ ok: boolean; reason?: string }> {
  const workbook = buildWorkbook(data);
  const fileName = `${workbook.fileName}.${format}`;

  const rowCount = workbook.sheets.reduce((acc, sheet) => acc + sheet.rows.length, 0);

  // Toda exportação fica registrada – é um evento de privacidade (§95).
  await supabase.from('exports').insert({
    user_id: userId,
    scope: 'user_data',
    format,
    filters: { start: data.period.start, end: data.period.end },
    row_count: rowCount,
  });
  void track('export_created', { format, rows: rowCount });

  if (Platform.OS === 'web') {
    return downloadOnWeb(workbook, format, fileName);
  }

  const uri = `${FileSystem.cacheDirectory}${fileName}`;

  if (format === 'csv') {
    await FileSystem.writeAsStringAsync(uri, toCsvBundle(workbook), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } else {
    await FileSystem.writeAsStringAsync(uri, bytesToBase64(toXlsx(workbook)), {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  if (!(await Sharing.isAvailableAsync())) {
    return { ok: false, reason: 'Compartilhamento não disponível neste aparelho.' };
  }

  await Sharing.shareAsync(uri, { mimeType: MIME[format], dialogTitle: 'Exportar dados' });
  return { ok: true };
}

function downloadOnWeb(
  workbook: ReturnType<typeof buildWorkbook>,
  format: ExportFormat,
  fileName: string,
): { ok: boolean } {
  const blob =
    format === 'csv'
      ? new Blob([toCsvBundle(workbook)], { type: MIME.csv })
      : new Blob([toXlsx(workbook) as BlobPart], { type: MIME.xlsx });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
  return { ok: true };
}

/**
 * Base64 sem depender de Buffer, que não existe no React Native.
 * Convertido em blocos para não estourar a pilha em arquivos grandes.
 */
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return globalThis.btoa(binary);
}
