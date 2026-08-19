import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, useTheme } from '@dinamique/ui';
import { BrandMark } from '@/features/brand/BrandMark';

export interface AuthScreenProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  /** Rodapé fixo: o botão principal e o atalho para a outra tela. */
  footer: ReactNode;
}

/**
 * Moldura das telas de entrada — login e cadastro (§16, manual de marca §05).
 *
 * O topo é uma faixa do azul da marca com o wordmark negativo, que é o uso que
 * o manual prescreve para superfícies azuis. A folha branca sobe por cima dela
 * com o canto superior bem aberto: é o que dá a leitura de aplicativo e não de
 * formulário, e é de onde vem o "respiro" que o manual pede.
 *
 * As duas telas dividem esta moldura de propósito. Login e cadastro que mudam
 * de layout entre si é o tipo de detalhe que faz um produto parecer remendado.
 */
export function AuthScreen({ title, subtitle, children, footer }: AuthScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.brandSurface }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Faixa da marca */}
        <View
          style={{
            backgroundColor: theme.colors.brandSurface,
            paddingTop: insets.top + theme.spacing['3xl'],
            paddingBottom: theme.spacing['3xl'],
            paddingHorizontal: theme.spacing['2xl'],
            gap: theme.spacing.lg,
          }}
        >
          <BrandMark size="lg" tone="negative" />
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="titleLg" style={{ color: theme.colors.textOnBrand }}>
              {title}
            </Text>
            <Text variant="body" style={{ color: theme.colors.textOnBrandMuted }}>
              {subtitle}
            </Text>
          </View>
        </View>

        {/* Folha do formulário */}
        <View
          style={{
            flex: 1,
            backgroundColor: theme.colors.backgroundPrimary,
            borderTopLeftRadius: 36,
            borderTopRightRadius: 36,
            paddingHorizontal: theme.spacing['2xl'],
            paddingTop: theme.spacing['2xl'],
            paddingBottom: insets.bottom + theme.spacing['2xl'],
          }}
        >
          <View style={{ gap: theme.spacing.lg }}>{children}</View>
          <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.xl }}>{footer}</View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
