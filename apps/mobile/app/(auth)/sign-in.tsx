import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Text, useTheme } from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { toFriendlyError } from '@/lib/errors';
import { BrandMark } from '@/features/brand/BrandMark';

export default function SignIn() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setLoading(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) setError(toFriendlyError(signInError).message);
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
        <View style={{ gap: theme.spacing.sm, marginBottom: theme.spacing.xl }}>
          <BrandMark size="lg" />
          <Text variant="titleLg">Bem-vindo de volta</Text>
          <Text variant="body" color="secondary">
            Entre para acompanhar seus ganhos e suas metas.
          </Text>
        </View>

        <View style={{ gap: theme.spacing.md }}>
          <TextInput
            accessibilityLabel="Email"
            placeholder="Email"
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            style={inputStyle}
          />
          <TextInput
            accessibilityLabel="Senha"
            placeholder="Senha"
            placeholderTextColor={theme.colors.textMuted}
            secureTextEntry
            autoComplete="current-password"
            value={password}
            onChangeText={setPassword}
            style={inputStyle}
          />
        </View>

        {error ? (
          <Text variant="caption" color="danger">
            {error}
          </Text>
        ) : null}

        <Button
          label="Entrar"
          size="lg"
          fullWidth
          loading={loading}
          disabled={email.trim() === '' || password === ''}
          onPress={handleSignIn}
        />

        <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
          <Link href="/(auth)/sign-up">
            <Text variant="bodyStrong" color="brand">
              Criar uma conta
            </Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
