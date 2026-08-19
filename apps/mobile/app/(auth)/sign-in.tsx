import { useState } from 'react';
import { View } from 'react-native';
import { Link } from 'expo-router';
import {
  Button,
  Card,
  Field,
  Icon,
  Screen,
  Text,
  useResponsive,
  useTheme,
} from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { toFriendlyError } from '@/lib/errors';
import { BrandMark } from '@/features/brand/BrandMark';

export default function SignIn() {
  const theme = useTheme();
  const { scale } = useResponsive();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setLoading(true);
    setError(null);
    setErrorDetail(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      const friendly = toFriendlyError(signInError);
      setError(friendly.message);
      setErrorDetail(friendly.detail ?? null);
    }
    setLoading(false);
  }

  return (
    <Screen padding="2xl" gap="2xl" center>
      <View style={{ gap: theme.spacing.md }}>
        <BrandMark size="lg" />
        <Text
          variant="titleLg"
          style={{ fontSize: scale(30, { min: 26, max: 36 }), lineHeight: scale(36, { min: 32, max: 42 }) }}
        >
          Que bom te ver de novo
        </Text>
        <Text variant="body" color="secondary">
          Entre para acompanhar seus ganhos, seus custos e a sua meta.
        </Text>
      </View>

      <View style={{ gap: theme.spacing.lg }}>
        <Field
          label="Email"
          iconName="user"
          placeholder="voce@email.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Field
          label="Senha"
          iconName="shield"
          password
          placeholder="Sua senha"
          autoComplete="current-password"
          value={password}
          onChangeText={setPassword}
        />
      </View>

      {error ? (
        <Card
          padding="lg"
          style={{
            flexDirection: 'row',
            gap: theme.spacing.md,
            backgroundColor: theme.colors.dangerSubtle,
          }}
        >
          <Icon name="alert" size={20} color={theme.colors.dangerText} />
          <View style={{ flex: 1, gap: theme.spacing.xxs }}>
            <Text variant="bodyStrong" color="danger">
              {error}
            </Text>
            {errorDetail ? (
              <Text variant="caption" color="muted">
                Detalhe técnico: {errorDetail}
              </Text>
            ) : null}
          </View>
        </Card>
      ) : null}

      <View style={{ gap: theme.spacing.lg }}>
        <Button
          label="Entrar"
          size="lg"
          fullWidth
          loading={loading}
          disabled={email.trim() === '' || password === ''}
          onPress={handleSignIn}
        />

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: theme.spacing.xs }}>
          <Text variant="body" color="secondary">
            Ainda não tem conta?
          </Text>
          <Link href="/(auth)/sign-up">
            <Text variant="bodyStrong" color="brand">
              Criar agora
            </Text>
          </Link>
        </View>
      </View>
    </Screen>
  );
}
