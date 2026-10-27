import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Screen, Text, ThemeProvider } from '@dinamique/ui';
import { reportCaught } from '@/lib/report';

/**
 * A última rede antes da tela branca.
 *
 * Uma tela que quebra ao renderizar derruba a árvore inteira do React, e o
 * resultado para o motorista é um app que abre em branco e não volta. Aqui ele
 * vê o que houve, pode tentar de novo, e a falha chega ao painel com a pilha —
 * que é a única pista para corrigir.
 */
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    reportCaught(error, {
      severity: 'fatal',
      context: { componentStack: info.componentStack?.slice(0, 2000) ?? null },
    });
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;

    // O próprio ThemeProvider pode ser o que quebrou, e esta tela precisa de
    // tokens para se desenhar. Ela traz o seu, com o tema do sistema.
    return (
      <ThemeProvider initialPreference="system">
        <Screen>
          <View style={styles.body}>
            <Text variant="titleLg">Algo quebrou nesta tela</Text>
            <Text variant="body" color="secondary">
              Seus lançamentos estão salvos. Toque abaixo para voltar — e já avisamos a equipe do
              que aconteceu.
            </Text>
            <Text variant="caption" color="secondary">
              {error.message}
            </Text>
            <Button label="Tentar de novo" onPress={() => this.setState({ error: null })} />
          </View>
        </Screen>
      </ThemeProvider>
    );
  }
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', gap: 16, paddingHorizontal: 4 },
});
