import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { DateOnly } from '@dinamique/types';
import { addDays, endOfMonth, lastDays, startOfMonth, toDateOnly } from '@dinamique/utils';
import {
  Button,
  Calendar,
  Card,
  DayStrip,
  IconButton,
  Sheet,
  Text,
  useTheme,
  type DayMark,
} from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { useReloadOnFocus } from '@/hooks/useReloadOnFocus';
import { useSession } from '@/hooks/useSession';

/** Quantos dias a faixa mostra. Uma semana cabe em sete colunas num telefone. */
const STRIP_DAYS = 7;

/**
 * O caminho curto para outro dia, na Home.
 *
 * Poder corrigir um dia que passou existia só dentro do Histórico, atrás de um
 * botão dentro de uma aba. Quem abre o aplicativo lembrando do combustível de
 * ontem tinha de saber que aquilo estava lá. Aqui a semana está à vista: um
 * toque no dia abre o dia.
 *
 * A faixa termina em hoje em vez de terminar no domingo. Numa segunda-feira uma
 * semana de calendário mostra um dia de histórico e seis quadrados apagados,
 * que é o contrário do que alguém que quer consertar a sexta precisa.
 *
 * O mês inteiro continua a um toque, no botão ao lado: sete dias resolvem
 * "ontem" e "anteontem", não "aquela terça de duas semanas atrás".
 */
export function DayJump() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();

  const today = toDateOnly(new Date());
  const days = lastDays(today, STRIP_DAYS);

  const [marks, setMarks] = useState<Record<string, DayMark>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => startOfMonth(today));

  const loadMarks = useCallback(
    async (start: DateOnly, end: DateOnly) => {
      if (!session?.user) return;
      const { data } = await supabase
        .from('daily_totals')
        .select('date, net_profit')
        .eq('user_id', session.user.id)
        .gte('date', start)
        .lte('date', end);

      const next: Record<string, DayMark> = {};
      for (const row of (data as { date: string; net_profit: number }[] | null) ?? []) {
        next[row.date] = row.net_profit < 0 ? 'negative' : 'positive';
      }
      // Mesclado, e não substituído: a folha do mês e a faixa preenchem
      // janelas diferentes do mesmo mapa.
      setMarks((current) => ({ ...current, ...next }));
    },
    [session?.user?.id],
  );

  const loadStrip = useCallback(
    () => loadMarks(days[0] ?? today, today),
    // `days` é derivado de `today`, que só muda quando o dia vira.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadMarks, today],
  );

  // Ao voltar o foco: lançar um gasto em ontem tem de acender o ponto de ontem
  // assim que a pessoa volta para a Home.
  useReloadOnFocus(loadStrip);

  useEffect(() => {
    if (!pickerOpen) return;
    // A grade também mostra o fim do mês anterior e o começo do próximo, daí a
    // folga de uma semana de cada lado.
    void loadMarks(addDays(startOfMonth(pickerMonth), -7), addDays(endOfMonth(pickerMonth), 7));
  }, [pickerOpen, pickerMonth, loadMarks]);

  function openDay(date: DateOnly) {
    router.push({ pathname: '/journey/day', params: { date } });
  }

  return (
    <>
      <Card padding="lg" style={{ gap: theme.spacing.md }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="captionStrong" color="secondary">
              SEUS DIAS
            </Text>
            <Text variant="caption" color="muted">
              Toque num dia para ver ou corrigir
            </Text>
          </View>
          <IconButton
            icon="calendar"
            label="Abrir o calendário e escolher outro dia"
            tone="surface"
            size={38}
            onPress={() => {
              setPickerMonth(startOfMonth(today));
              setPickerOpen(true);
            }}
          />
        </View>

        <DayStrip days={days} marks={marks} today={today} onSelect={openDay} />
      </Card>

      <Sheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Qual dia você quer abrir?"
        description="Os dias marcados já têm algo registrado. Toque em qualquer um para conferir e ajustar."
        footer={
          <Button label="Fechar" variant="secondary" fullWidth onPress={() => setPickerOpen(false)} />
        }
      >
        <Calendar
          month={pickerMonth}
          onMonthChange={setPickerMonth}
          marks={marks}
          onSelect={(date) => {
            setPickerOpen(false);
            openDay(date);
          }}
        />
      </Sheet>
    </>
  );
}
