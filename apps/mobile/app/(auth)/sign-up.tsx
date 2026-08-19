import { useState } from 'react';
import { View } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import { normaliseCode } from '@dinamique/business-logic';
import { Button, Field, Text, useTheme } from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { toFriendlyError } from '@/lib/errors';
import { track } from '@/lib/analytics';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { ErrorNote } from '@/features/auth/ErrorNote';

export default function SignUp() {
  const theme = useTheme();
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
    setNotice(null);

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

    // Conta criada sem sessão significa que o projeto exige confirmação por
    // email. Antes a tela simplesmente parava de girar e não dizia nada — do
    // lado de quem clicou, indistinguível de "não fez nada".
    if (!data.session) {
      setNotice(
        'Conta criada! Enviamos um link de confirmação para o seu email. ' +
          'Confirme para entrar — veja também a caixa de spam.',
      );
    }

    setLoading(false);
  }

  return (
    <AuthScreen
      title="Criar sua conta"
      subtitle="Você começa com 7 dias de Pro, sem cartão."
      footer={
        <>
          <Button
            label="Criar conta"
            size="lg"
            fullWidth
            loading={loading}
            disabled={
              firstName.trim() === '' || email.trim() === '' || password.length < 8
            }
            onPress={handleSignUp}
          />

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: theme.spacing.xs,
            }}
          >
            <Text variant="body" color="secondary">
              Já tem conta?
            </Text>
            <Link href="/(auth)/sign-in" replace>
              <Text variant="bodyStrong" color="brand">
                Entrar
              </Text>
            </Link>
          </View>
        </>
      }
    >
      <Field
        label="Nome"
        placeholder="Seu nome"
        autoComplete="given-name"
        value={firstName}
        onChangeText={setFirstName}
      />
      <Field
        label="Email"
        placeholder="voce@email.com"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <Field
        label="Senha"
        placeholder="Mínimo de 8 caracteres"
        hint="Use 8 caracteres ou mais."
        secureTextEntry
        autoComplete="new-password"
        value={password}
        onChangeText={setPassword}
      />
      <Field
        label="Código de indicação"
        optional
        placeholder="Ex.: ARTHUR26"
        autoCapitalize="characters"
        autoCorrect={false}
        value={code}
        onChangeText={setCode}
      />

      <ErrorNote message={error} detail={errorDetail} />
      <ErrorNote message={notice} tone="success" />
    </AuthScreen>
  );
}
