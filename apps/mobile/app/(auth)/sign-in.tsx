import { useState } from 'react';
import { View } from 'react-native';
import { Link } from 'expo-router';
import { Button, Field, Text, useTheme } from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { toFriendlyError } from '@/lib/errors';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { ErrorNote } from '@/features/auth/ErrorNote';

export default function SignIn() {
  const theme = useTheme();
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
    <AuthScreen
      title="Bem-vindo de volta"
      subtitle="Entre para acompanhar seus ganhos e suas metas."
      footer={
        <>
          <Button
            label="Entrar"
            size="lg"
            fullWidth
            loading={loading}
            disabled={email.trim() === '' || password === ''}
            onPress={handleSignIn}
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
              Ainda não tem conta?
            </Text>
            <Link href="/(auth)/sign-up">
              <Text variant="bodyStrong" color="brand">
                Criar conta
              </Text>
            </Link>
          </View>
        </>
      }
    >
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
        placeholder="Sua senha"
        secureTextEntry
        autoComplete="current-password"
        value={password}
        onChangeText={setPassword}
      />

      <ErrorNote message={error} detail={errorDetail} />
    </AuthScreen>
  );
}
