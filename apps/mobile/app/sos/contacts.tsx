import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { MAX_EMERGENCY_CONTACTS } from '@dinamique/business-logic';
import {
  Button,
  Card,
  Field,
  Notice,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
} from '@dinamique/ui';
import { useSafety } from '@/features/safety/useSafety';

/**
 * Contatos de emergência: até três, e o banco é quem garante o três.
 *
 * Três campos fixos em vez de uma lista que cresce. A lista seria mais
 * elegante e pior: aqui o limite é visível antes de ser atingido, cada lugar
 * tem um endereço estável ("o primeiro contato"), e não existe o estado de
 * "adicionar" que some depois do terceiro.
 */
export default function EmergencyContacts() {
  const theme = useTheme();
  const router = useRouter();
  const { contacts, saveContact, removeContact } = useSafety();

  return (
    <Screen
      header={<ScreenHeader title="Contatos de emergência" onBack={() => router.back()} />}
      gap="lg"
    >
      <Card padding="xl" style={{ gap: theme.spacing.sm }}>
        <Text variant="bodyStrong">Quem é avisado quando você dispara</Text>
        <Text variant="caption" color="muted">
          Estas pessoas recebem sua localização no momento em que o alerta é ativado. Avise cada
          uma delas antes de cadastrar: quem recebe uma mensagem dessas no meio da noite precisa
          saber o que ela significa.
        </Text>
        <Text variant="caption" color="muted">
          Ninguém além de você lê esta lista. Nem o suporte do Dinamique.
        </Text>
      </Card>

      {Array.from({ length: MAX_EMERGENCY_CONTACTS }, (_, index) => index + 1).map((slot) => (
        <ContactSlot
          key={slot}
          slot={slot}
          existing={contacts.find((contact) => contact.slot === slot) ?? null}
          onSave={saveContact}
          onRemove={removeContact}
        />
      ))}
    </Screen>
  );
}

function ContactSlot({
  slot,
  existing,
  onSave,
  onRemove,
}: {
  slot: number;
  existing: { name: string; phone: string } | null;
  onSave: (slot: number, name: string, phone: string) => Promise<string | null>;
  onRemove: (slot: number) => Promise<boolean>;
}) {
  const theme = useTheme();
  const [name, setName] = useState(existing?.name ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Os contatos chegam do banco depois da primeira pintura, e o cartão é
  // montado antes disso. Sem esta sincronia os campos ficariam vazios para
  // quem já cadastrou, e salvar por cima apagaria o contato.
  useEffect(() => {
    setName(existing?.name ?? '');
    setPhone(existing?.phone ?? '');
  }, [existing?.name, existing?.phone]);

  const dirty = name !== (existing?.name ?? '') || phone !== (existing?.phone ?? '');

  async function save() {
    setSaving(true);
    setError(null);
    const message = await onSave(slot, name, phone);
    setSaving(false);
    if (message) {
      setError(message);
      return;
    }
    setSaved(true);
  }

  async function remove() {
    setSaving(true);
    const ok = await onRemove(slot);
    setSaving(false);
    if (!ok) {
      setError('Não conseguimos apagar. Tente de novo.');
      return;
    }
    setName('');
    setPhone('');
    setSaved(false);
  }

  return (
    <Card padding="xl" style={{ gap: theme.spacing.md }}>
      <Text variant="captionStrong" color="secondary">
        CONTATO {slot}
      </Text>

      <Field
        label="Nome"
        placeholder="Mãe, irmão, amigo"
        value={name}
        onChangeText={(text) => {
          setName(text);
          setSaved(false);
        }}
        maxLength={60}
      />
      <Field
        label="Telefone com DDD"
        placeholder="(11) 99999-0000"
        value={phone}
        keyboardType="phone-pad"
        onChangeText={(text) => {
          setPhone(text);
          setSaved(false);
        }}
        maxLength={20}
      />

      {error ? <Notice tone="danger" message={error} /> : null}

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <Button
          label={saved && !dirty ? 'Salvo' : 'Salvar'}
          variant={saved && !dirty ? 'secondary' : 'primary'}
          iconName={saved && !dirty ? 'check' : undefined}
          loading={saving}
          style={{ flex: 1 }}
          onPress={() => void save()}
        />
        {existing ? (
          <Button
            label="Apagar"
            variant="ghost"
            iconName="trash"
            loading={saving}
            onPress={() => void remove()}
          />
        ) : null}
      </View>
    </Card>
  );
}
