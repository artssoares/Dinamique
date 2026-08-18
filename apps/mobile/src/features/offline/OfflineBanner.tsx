import { Pressable } from 'react-native';
import { Text, useTheme } from '@dinamique/ui';
import { useOffline } from './useOfflineSync';

/**
 * Barra de estado da sincronização.
 *
 * Um motorista sem sinal precisa saber que o registro dele foi guardado, e não
 * perdido. Só aparece quando há algo a dizer — sem sinal ou com fila pendente.
 */
export function OfflineBanner() {
  const theme = useTheme();
  const { isOnline, pendingCount, stuckCount, sync } = useOffline();

  if (isOnline && pendingCount === 0 && stuckCount === 0) return null;

  const isProblem = stuckCount > 0;

  const message = isProblem
    ? `${stuckCount} ${stuckCount === 1 ? 'registro não foi salvo' : 'registros não foram salvos'}. Toque para tentar de novo.`
    : !isOnline
      ? pendingCount > 0
        ? `Sem conexão. ${pendingCount} ${pendingCount === 1 ? 'registro guardado' : 'registros guardados'} neste aparelho.`
        : 'Sem conexão. O que você registrar fica guardado aqui.'
      : `Enviando ${pendingCount} ${pendingCount === 1 ? 'registro' : 'registros'}…`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={message}
      onPress={() => void sync()}
      style={{
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.lg,
        backgroundColor: isProblem ? theme.colors.dangerSubtle : theme.colors.warningSubtle,
      }}
    >
      <Text variant="caption" color={isProblem ? 'danger' : 'warning'} align="center">
        {message}
      </Text>
    </Pressable>
  );
}
