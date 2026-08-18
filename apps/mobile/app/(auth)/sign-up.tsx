import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { normaliseCode } from '@dinamique/business-logic';
import { Button, Text, useTheme } from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { toFriendlyError } from '@/lib/errors';
import { track } from '@/lib/analytics';
import { BrandMark } from '@/features/brand/BrandMark';

export default function SignUp() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // A referral link opens the app with ?code=ARTHUR26 already filled in.
  const params = useLocalSearchParams<{ code?: string }>();

  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState(params.code ?? '');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    setLoading(true);
    setError(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: firstName.trim() } },
    });

    if (signUpError) {
      setError(toFriendlyError(signUpError).message);
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

  const inputStyle = {
    height: 54,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderPrimary,
    backgroundColor: theme.colors.surfacePrimary,
    paddingHorizontal: theme.spacing.lg,
    color: theme.colors.textPrimary,
    fontSize: 16,
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          padding: theme.spacing['2xl'],
          paddingTop: insets.top + theme.spacing['3xl'],
          gap: theme.spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: theme.spacing.sm, marginBottom: theme.spacing.lg }}>
          <BrandMark size="lg" />
          <Text variant="titleLg">Criar sua conta</Text>
          <Text variant="body" color="secondary">
            Você começa com 7 dias de Pro, sem cartão.
          </Text>
        </View>

        <View style={{ gap: theme.spacing.md }}>
          <TextInput
            accessibilityLabel="Nome"
            placeholder="Seu nome"
            placeholderTextColor={theme.colors.textMuted}
            autoComplete="given-name"
            value={firstName}
            onChangeText={setFirstName}
            style={inputStyle}
          />
          <TextInput
            accessibilityLabel="Email"
            placeholder="Email"
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
            style={inputStyle}
          />
          <TextInput
            accessibilityLabel="Senha"
            placeholder="Senha (mínimo 8 caracteres)"
            placeholderTextColor={theme.colors.textMuted}
            secureTextEntry
            autoComplete="new-password"
            value={password}
            onChangeText={setPassword}
            style={inputStyle}
          />
          <TextInput
            accessibilityLabel="Código de indicação (opcional)"
            placeholder="Código de indicação (opcional)"
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            value={code}
            onChangeText={setCode}
            style={inputStyle}
          />
        </View>

        {error ? (
          <Text variant="caption" color="danger">
            {error}
          </Text>
        ) : null}
        {notice ? (
          <Text variant="caption" color="success">
            {notice}
          </Text>
        ) : null}

        <Button
          label="Criar conta"
          size="lg"
          fullWidth
          loading={loading}
          disabled={firstName.trim() === '' || email.trim() === '' || password.length < 8}
          onPress={handleSignUp}
        />

        <View style={{ alignItems: 'center' }}>
          <Link href="/(auth)/sign-in">
            <Text variant="bodyStrong" color="brand">
              Já tenho conta
            </Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
