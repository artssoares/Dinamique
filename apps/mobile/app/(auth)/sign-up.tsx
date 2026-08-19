import { useState } from 'react';
import { View } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import { normaliseCode } from '@dinamique/business-logic';
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
import { track } from '@/lib/analytics';
import { BrandMark } from '@/features/brand/BrandMark';

export default function SignUp() {
  const theme = useTheme();
  const { scale } = useResponsive();
  // A referral link opens the app with ?code=ARTHUR26 already filled in.
  const params = useLocalSearchParams<{ code?: string }>();

  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState(params.code ?? '');
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    setLoading(true);
    setError(null);
    setErrorDetail(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: firstName.trim() } },
    });

    if (signUpError) {
      const friendly = toFriendlyError(signUpError);
      setError(friendly.message);
      setErrorDetail(friendly.detail ?? null);
      setLoading(false);
      return;
    }

    void track('signup_completed', { has_code: code.trim() !== '' });

    // Redeeming is server-side and every antifraud rule lives there. A failed
    // code must never block the account that was just created.
    if (data.session && code.trim() !== '') {
      const { data: result } = await supabase.rpc('redeem_code', {
        p_code: normaliseCode(code),
      });
      const outcome = result as { ok?: boolean; reason?: string } | null;
      setNotice(
        outcome?.ok
          ? 'Código aplicado! Você tem R$ 10 de desconto na primeira assinatura Pro.'
          : 'Sua conta foi criada, mas não conseguimos aplicar esse código.',
      );
    }

    setLoading(false);
  }

  const passwordTooShort = password.length > 0 && password.length < 8;

  return (
    <Screen padding="2xl" gap="2xl" center>
      <View style={{ gap: theme.spacing.md }}>
        <BrandMark size="lg" />
        <Text
          variant="titleLg"
          style={{ fontSize: scale(30, { min: 26, max: 36 }), lineHeight: scale(36, { min: 32, max: 42 }) }}
        >
          Criar sua conta
        </Text>
        <Text variant="body" color="secondary">
          Leva menos de um minuto. Você começa com 7 dias de Pro, sem cartão.
        </Text>
      </View>

      <View style={{ gap: theme.spacing.lg }}>
        <Field
          label="Nome"
          iconName="user"
          placeholder="Como podemos te chamar?"
          autoComplete="given-name"
          value={firstName}
          onChangeText={setFirstName}
        />
        <Field
          label="Email"
          iconName="phone"
          placeholder="voce@email.com"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />
        <Field
          label="Senha"
          iconName="shield"
          password
          placeholder="Pelo menos 8 caracteres"
          autoComplete="new-password"
          value={password}
          onChangeText={setPassword}
          error={passwordTooShort ? 'Use pelo menos 8 caracteres.' : null}
          hint={passwordTooShort ? undefined : 'Pelo menos 8 caracteres.'}
        />
        <Field
          label="Código de indicação"
          iconName="gift"
          optional
          placeholder="Se alguém te indicou, digite aqui"
          autoCapitalize="characters"
          autoCorrect={false}
          value={code}
          onChangeText={setCode}
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

      {notice ? (
        <Card
          padding="lg"
          style={{
            flexDirection: 'row',
            gap: theme.spacing.md,
            backgroundColor: theme.colors.successSubtle,
          }}
        >
          <Icon name="check" size={20} color={theme.colors.successText} />
          <Text variant="body" color="success" style={{ flex: 1 }}>
            {notice}
          </Text>
        </Card>
      ) : null}

      <View style={{ gap: theme.spacing.lg }}>
        <Button
          label="Criar minha conta"
          size="lg"
          fullWidth
          loading={loading}
          disabled={firstName.trim() === '' || email.trim() === '' || password.length < 8}
          onPress={handleSignUp}
        />

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: theme.spacing.xs }}>
          <Text variant="body" color="secondary">
            Já tem conta?
          </Text>
          <Link href="/(auth)/sign-in">
            <Text variant="bodyStrong" color="brand">
              Entrar
            </Text>
          </Link>
        </View>
      </View>
    </Screen>
  );
}
