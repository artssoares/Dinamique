import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Avatar,
  Button,
  Card,
  Chip,
  Field,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
} from '@dinamique/ui';
import type { WorkMode } from '@dinamique/types';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { useSession } from '@/hooks/useSession';
import { avatarUrl, pickAndUploadAvatar, removeAvatar } from '@/features/profile/avatar';

const WORK_MODES: { value: WorkMode; label: string }[] = [
  { value: 'rideshare', label: 'Aplicativo' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'taxi', label: 'Táxi' },
  { value: 'private', label: 'Particular' },
];

const GENDERS = ['Masculino', 'Feminino', 'Outro', 'Prefiro não informar'];

/**
 * Perfil (§19). Só nome e cidade importam de verdade; todo o resto é
 * opcional e está marcado como tal, porque nada aqui destrava função nenhuma.
 */
export default function Profile() {
  const theme = useTheme();
  const router = useRouter();
  const { session, profile, refresh } = useSession();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState<string | null>(null);
  const [workModes, setWorkModes] = useState<WorkMode[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!session?.user) return;
    void supabase
      .from('profiles')
      .select('first_name, last_name, preferred_name, phone, city, state, birth_date, gender, work_modes, avatar_path')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setFirstName(data.first_name ?? '');
          setLastName(data.last_name ?? '');
          setPreferredName(data.preferred_name ?? '');
          setPhone(data.phone ?? '');
          setCity(data.city ?? '');
          setState(data.state ?? '');
          setBirthDate(data.birth_date ?? '');
          setGender(data.gender ?? null);
          setWorkModes((data.work_modes as WorkMode[] | null) ?? []);
          setPhoto(avatarUrl(data.avatar_path));
        }
        setLoading(false);
      });
  }, [session?.user?.id]);

  async function save() {
    if (!session?.user) return;
    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim() || null,
        preferred_name: preferredName.trim() || null,
        phone: phone.trim() || null,
        city: city.trim() || null,
        state: state.trim().toUpperCase() || null,
        // Uma data em branco precisa virar null, não string vazia.
        birth_date: birthDate.trim() === '' ? null : birthDate.trim(),
        gender,
        work_modes: workModes,
      })
      .eq('id', session.user.id);

    setSaving(false);

    if (error) {
      Alert.alert('Não conseguimos salvar', 'Tente novamente em instantes.');
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    await refresh();
  }

  async function changePhoto() {
    if (!session?.user) return;
    const result = await pickAndUploadAvatar(session.user.id);
    if (result) {
      setPhoto(result.publicUrl);
      void track('profile_photo_added', {});
      await refresh();
    }
  }

  async function clearPhoto() {
    if (!session?.user) return;
    await removeAvatar(session.user.id);
    setPhoto(null);
    await refresh();
  }

  if (loading) return null;

  const displayName = preferredName || firstName || profile?.firstName || '';

  return (
    <Screen
      header={<ScreenHeader title="Meu perfil" onBack={() => router.back()} />}
      gap="lg"
    >
        <Card padding="xl" style={{ alignItems: 'center', gap: theme.spacing.md }}>
          <Avatar url={photo} name={displayName} size={96} />
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Button label={photo ? 'Trocar foto' : 'Adicionar foto'} variant="secondary" size="sm" onPress={changePhoto} />
            {photo ? (
              <Pressable accessibilityRole="button" onPress={clearPhoto} style={{ justifyContent: 'center' }}>
                <Text variant="captionStrong" color="danger">
                  Remover
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Text variant="caption" color="muted">
            A foto é opcional. Sem ela mostramos suas iniciais.
          </Text>
        </Card>

        <View style={{ gap: theme.spacing.lg }}>
          <Field label="Nome" value={firstName} onChangeText={setFirstName} autoComplete="given-name" />
          <Field label="Sobrenome" optional value={lastName} onChangeText={setLastName} autoComplete="family-name" />
          <Field
            label="Como prefere ser chamado"
            optional
            hint="É esse nome que aparece na tela inicial."
            value={preferredName}
            onChangeText={setPreferredName}
          />
          <Field
            label="Telefone"
            optional
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
          />

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <View style={{ flex: 3 }}>
              <Field label="Cidade" value={city} onChangeText={setCity} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="UF" value={state} onChangeText={setState} maxLength={2} autoCapitalize="characters" />
            </View>
          </View>

          <Field
            label="Data de nascimento"
            optional
            hint="No formato AAAA-MM-DD."
            value={birthDate}
            onChangeText={setBirthDate}
            placeholder="1990-05-21"
          />
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="captionStrong" color="secondary">
            COMO VOCÊ TRABALHA
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {WORK_MODES.map((mode) => (
              <Chip
                key={mode.value}
                label={mode.label}
                multiple
                selected={workModes.includes(mode.value)}
                onPress={() =>
                  setWorkModes(
                    workModes.includes(mode.value)
                      ? workModes.filter((m) => m !== mode.value)
                      : [...workModes, mode.value],
                  )
                }
              />
            ))}
          </View>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: theme.spacing.xs, alignItems: 'baseline' }}>
            <Text variant="captionStrong" color="secondary">
              GÊNERO
            </Text>
            <Text variant="caption" color="muted">
              opcional
            </Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {GENDERS.map((option) => (
              <Chip
                key={option}
                label={option}
                selected={gender === option}
                onPress={() => setGender(gender === option ? null : option)}
              />
            ))}
          </View>
        </View>

        <Button
          label={saved ? 'Salvo' : 'Salvar alterações'}
          size="lg"
          fullWidth
          loading={saving}
          disabled={firstName.trim() === ''}
          onPress={save}
        />
    </Screen>
  );
}
