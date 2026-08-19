import { View } from 'react-native';
import { Text, useTheme } from '@dinamique/ui';

export interface ErrorNoteProps {
  message: string | null;
  /** Texto cru do servidor. Só aparece quando existe (§113). */
  detail?: string | null;
  tone?: 'danger' | 'success';
}

/**
 * O aviso de erro das telas de entrada.
 *
 * Antes era uma linha vermelha solta no meio do formulário, fácil de não ver.
 * Aqui ele é um bloco com fundo próprio: quem errou a senha percebe na hora
 * que algo respondeu, sem precisar procurar.
 *
 * O detalhe técnico continua discreto embaixo — serve para ser lido em voz
 * alta no suporte, não para assustar quem só digitou a senha errada.
 */
export function ErrorNote({ message, detail, tone = 'danger' }: ErrorNoteProps) {
  const theme = useTheme();
  if (!message) return null;

  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: tone === 'danger' ? theme.colors.dangerSubtle : theme.colors.successSubtle,
        borderRadius: theme.radius.xl,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        gap: theme.spacing.xs,
      }}
    >
      <Text variant="bodyStrong" color={tone === 'danger' ? 'danger' : 'success'}>
        {message}
      </Text>
      {detail ? (
        <Text variant="caption" color="muted">
          Detalhe técnico: {detail}
        </Text>
      ) : null}
    </View>
  );
}
