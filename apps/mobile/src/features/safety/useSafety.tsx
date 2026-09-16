import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  MAX_EMERGENCY_CONTACTS,
  describeSosFailure,
  isDiallablePhone,
  platePrefix as prefixOf,
  sanitisePhone,
  sosFailureCode,
} from '@dinamique/business-logic';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { useSession } from '@/hooks/useSession';
import { currentFix, type SafetyFix } from './position';

/**
 * Estado do botão de emergência para o aplicativo inteiro.
 *
 * Existe como contexto por um motivo concreto: o botão fica no cabeçalho, a
 * contagem regressiva é uma folha por cima de qualquer tela, o alerta ativo é
 * outra tela e as configurações são uma terceira. Quatro lugares perguntando
 * "tem alerta ativo?" por conta própria dariam quatro respostas diferentes, e
 * a errada seria um botão de socorro que não faz nada porque acha que já tem um
 * alerta rodando.
 *
 * Toda decisão que importa (consentimento, limite, quem é avisado) é do banco.
 * Este arquivo chama e mostra.
 */

export interface SafetyPreferences {
  consentAt: string | null;
  networkOptIn: boolean;
  vehicleColour: string | null;
  platePrefix: string | null;
}

export interface EmergencyContact {
  slot: number;
  name: string;
  phone: string;
}

export interface SosAlert {
  id: string;
  userId: string;
  lat: number | null;
  lon: number | null;
  status: string;
  vehicleLabel: string | null;
  vehicleColour: string | null;
  platePrefix: string | null;
  notifiedCount: number;
  createdAt: string;
  expiresAt: string;
  isDemo: boolean;
}

export interface IncomingAlert extends SosAlert {
  /** Metros até o alerta, da linha que o próprio destinatário consegue ler. */
  distanceM: number | null;
}

export interface SosFireOutcome {
  ok: boolean;
  alertId: string | null;
  notified: number;
  demo: boolean;
  /** Preenchido só quando falhou, já em português e terminando no 190. */
  message: string | null;
}

interface SafetyState {
  /** Falso até a primeira leitura das preferências responder. */
  ready: boolean;
  prefs: SafetyPreferences;
  consented: boolean;
  updatePrefs: (patch: Partial<SafetyPreferences>) => Promise<boolean>;
  grantConsent: () => Promise<boolean>;
  revokeConsent: () => Promise<boolean>;

  contacts: EmergencyContact[];
  saveContact: (slot: number, name: string, phone: string) => Promise<string | null>;
  removeContact: (slot: number) => Promise<boolean>;

  /** O alerta do próprio motorista, se houver um ativo. */
  alert: SosAlert | null;
  /** Alertas ativos de outros motoristas que chegaram até aqui. */
  incoming: IncomingAlert[];
  /** Os últimos disparos, cancelados incluídos: a auditoria que a pessoa lê. */
  history: SosAlert[];

  /** True enquanto a contagem regressiva está na tela. */
  armed: boolean;
  arm: (options?: { demo?: boolean }) => void;
  abort: () => Promise<void>;
  /** Fecha a contagem sem registrar cancelamento, para uma falha de envio. */
  dismiss: () => void;
  fire: () => Promise<SosFireOutcome>;
  close: () => Promise<boolean>;

  refresh: () => Promise<void>;
}

const PREF_COLUMNS =
  'sos_consent_at, sos_network_opt_in, sos_vehicle_colour, sos_plate_prefix';

const ALERT_COLUMNS =
  'id, user_id, lat, lon, status, vehicle_label, vehicle_colour, plate_prefix, ' +
  'notified_count, created_at, expires_at, is_demo';

const DEFAULTS: SafetyPreferences = {
  consentAt: null,
  networkOptIn: false,
  vehicleColour: null,
  platePrefix: null,
};

/**
 * De quanto em quanto tempo a presença é publicada e os alertas recebidos são
 * relidos.
 *
 * Noventa segundos porque a rede tem 5 km de raio: um carro em movimento cruza
 * isso em minutos, não em segundos, e uma consulta a cada dez segundos custaria
 * bateria de todo mundo para adiantar nada. O aviso não depende só disto (a
 * notificação chega pelo mesmo canal do sino), isto é o que mantém a lista
 * fresca com o aplicativo aberto.
 */
const HEARTBEAT_MS = 90_000;

/** Enquanto existe um alerta MEU, a tela precisa acompanhar de perto. */
const ACTIVE_POLL_MS = 15_000;

const SafetyContext = createContext<SafetyState | null>(null);

function alertFromRow(row: Record<string, unknown>): SosAlert {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    lat: (row.lat as number | null) ?? null,
    lon: (row.lon as number | null) ?? null,
    status: String(row.status),
    vehicleLabel: (row.vehicle_label as string | null) ?? null,
    vehicleColour: (row.vehicle_colour as string | null) ?? null,
    platePrefix: (row.plate_prefix as string | null) ?? null,
    notifiedCount: Number(row.notified_count ?? 0),
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    isDemo: Boolean(row.is_demo),
  };
}

export function SafetyProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  const [ready, setReady] = useState(false);
  const [prefs, setPrefs] = useState<SafetyPreferences>(DEFAULTS);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [alert, setAlert] = useState<SosAlert | null>(null);
  const [incoming, setIncoming] = useState<IncomingAlert[]>([]);
  const [history, setHistory] = useState<SosAlert[]>([]);
  const [armed, setArmed] = useState(false);

  // A leitura do GPS começa junto com a contagem regressiva, não depois dela:
  // são cinco segundos de folga que o aparelho pode usar para achar o satélite,
  // e gastá-los é a diferença entre disparar na hora e disparar em oito
  // segundos. `armedDemo` viaja junto porque o disparo acontece depois.
  const pendingFix = useRef<Promise<SafetyFix> | null>(null);
  const armedDemo = useRef(false);

  const loadPrefs = useCallback(async () => {
    if (!userId) {
      setPrefs(DEFAULTS);
      setReady(true);
      return;
    }
    const { data, error } = await supabase
      .from('user_preferences')
      .select(PREF_COLUMNS)
      .eq('user_id', userId)
      .maybeSingle();

    // Uma leitura que falhou não é uma resposta. Pintar os padrões por cima
    // mostraria a função como desligada para quem a ligou, e o botão de
    // emergência mandaria a pessoa para a tela de consentimento no pior
    // momento possível.
    if (error) {
      setReady(true);
      return;
    }

    const row = (data ?? null) as Record<string, unknown> | null;
    setPrefs(
      row
        ? {
            consentAt: (row.sos_consent_at as string | null) ?? null,
            networkOptIn: Boolean(row.sos_network_opt_in),
            vehicleColour: (row.sos_vehicle_colour as string | null) ?? null,
            platePrefix: (row.sos_plate_prefix as string | null) ?? null,
          }
        : DEFAULTS,
    );
    setReady(true);
  }, [userId]);

  const loadContacts = useCallback(async () => {
    if (!userId) {
      setContacts([]);
      return;
    }
    const { data } = await supabase
      .from('emergency_contacts')
      .select('slot, name, phone')
      .eq('user_id', userId)
      .order('slot');
    setContacts(((data ?? []) as Record<string, unknown>[]).map((row) => ({
      slot: Number(row.slot),
      name: String(row.name),
      phone: String(row.phone),
    })));
  }, [userId]);

  /**
   * Uma consulta só para os dois lados do alerta.
   *
   * O RLS já devolve exatamente o que esta pessoa pode ver: os alertas dela e
   * os alertas ativos de quem a avisou. Separar em duas consultas seria
   * reimplementar no cliente a regra que a política já aplica, e as duas
   * divergiriam na primeira mudança.
   */
  const loadAlerts = useCallback(async () => {
    if (!userId) {
      setAlert(null);
      setIncoming([]);
      setHistory([]);
      return;
    }

    const now = new Date().toISOString();

    const [liveResult, distanceResult, historyResult] = await Promise.all([
      supabase
        .from('sos_alerts')
        .select(ALERT_COLUMNS)
        .eq('status', 'active')
        .gt('expires_at', now)
        .order('created_at', { ascending: false }),
      supabase.from('sos_alert_recipients').select('alert_id, distance_m'),
      supabase
        .from('sos_alerts')
        .select(ALERT_COLUMNS)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    // `as unknown as` porque `ALERT_COLUMNS` é uma string montada em tempo de
    // execução: o supabase-js só consegue tipar a resposta quando o `select`
    // é um literal que ele lê no próprio código.
    const live = ((liveResult.data ?? []) as unknown as Record<string, unknown>[]).map(
      alertFromRow,
    );
    const distances = new Map(
      ((distanceResult.data ?? []) as unknown as Record<string, unknown>[]).map((row) => [
        String(row.alert_id),
        Number(row.distance_m),
      ]),
    );

    setAlert(live.find((item) => item.userId === userId) ?? null);
    setIncoming(
      live
        .filter((item) => item.userId !== userId)
        .map((item) => ({ ...item, distanceM: distances.get(item.id) ?? null })),
    );
    setHistory(
      ((historyResult.data ?? []) as unknown as Record<string, unknown>[]).map(alertFromRow),
    );
  }, [userId]);

  const refresh = useCallback(async () => {
    await Promise.all([loadPrefs(), loadContacts(), loadAlerts()]);
  }, [loadAlerts, loadContacts, loadPrefs]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * A batida do coração da rede: publica a própria posição e relê o que chegou.
   *
   * Só roda para quem entrou na rede. Quem apenas ativou o SOS para si mesmo
   * nunca tem posição publicada: é a diferença entre as duas escolhas da tela
   * de configuração, e ela é respeitada aqui e no banco.
   */
  useEffect(() => {
    if (!userId || !prefs.networkOptIn || prefs.consentAt === null) return undefined;

    let cancelled = false;

    async function beat() {
      // Sem `prompt`: a presença é publicada sozinha, e uma caixa de permissão
      // que aparece sem ninguém ter tocado em nada gasta a única chance de
      // pedir. Quem nunca liberou a localização simplesmente não publica, e o
      // disparo do SOS, que é onde a caixa faz sentido, continua pedindo.
      const fix = await currentFix({ prompt: false });
      if (cancelled) return;
      // O ponto de demonstração não entra na rede: ele colocaria um motorista
      // que está em casa, num notebook, no meio de São Paulo para os outros.
      if (!fix.demo) {
        await supabase.rpc('sos_share_location', {
          p_lat: fix.lat,
          p_lon: fix.lon,
          p_accuracy: fix.accuracy,
        });
      }
      if (!cancelled) await loadAlerts();
    }

    void beat();
    const timer = setInterval(() => void beat(), HEARTBEAT_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [loadAlerts, prefs.consentAt, prefs.networkOptIn, userId]);

  // Com um alerta meu no ar, o número de avisados e o prazo mudam sozinhos.
  useEffect(() => {
    if (!alert) return undefined;
    const timer = setInterval(() => void loadAlerts(), ACTIVE_POLL_MS);
    return () => clearInterval(timer);
  }, [alert, loadAlerts]);

  const updatePrefs = useCallback(
    async (patch: Partial<SafetyPreferences>): Promise<boolean> => {
      if (!userId) return false;
      const before = prefs;
      setPrefs((current) => ({ ...current, ...patch }));

      const payload: Record<string, unknown> = {};
      if (patch.consentAt !== undefined) payload.sos_consent_at = patch.consentAt;
      if (patch.networkOptIn !== undefined) payload.sos_network_opt_in = patch.networkOptIn;
      if (patch.vehicleColour !== undefined) {
        payload.sos_vehicle_colour = patch.vehicleColour?.trim() || null;
      }
      if (patch.platePrefix !== undefined) {
        payload.sos_plate_prefix = prefixOf(patch.platePrefix);
      }

      // `select()` porque um update que não casou com linha nenhuma volta sem
      // erro do PostgREST: o consentimento apareceria como salvo enquanto o
      // servidor continuava dizendo que não havia consentimento.
      const { data, error } = await supabase
        .from('user_preferences')
        .update(payload)
        .eq('user_id', userId)
        .select('user_id')
        .maybeSingle();

      if (error || data === null) {
        setPrefs(before);
        return false;
      }

      // Sair da rede apaga a presença na hora, e não na limpeza dos trinta
      // minutos: a tela promete "para agora", e uma linha que sobrevive à
      // escolha é a promessa quebrada onde ninguém olha.
      if (patch.networkOptIn === false) {
        await supabase.from('driver_locations').delete().eq('user_id', userId);
      }

      await loadPrefs();
      return true;
    },
    [loadPrefs, prefs, userId],
  );

  const grantConsent = useCallback(async () => {
    const ok = await updatePrefs({ consentAt: new Date().toISOString() });
    if (ok) void track('sos_consent_granted');
    return ok;
  }, [updatePrefs]);

  /**
   * Retirar o consentimento desliga a função inteira e apaga a presença.
   *
   * Sair da rede junto não é zelo extra: a presença só existe porque houve
   * consentimento, e deixá-la no banco depois de a pessoa dizer "não" seria
   * exatamente o que a tela promete que não acontece.
   */
  const revokeConsent = useCallback(async () => {
    const ok = await updatePrefs({ consentAt: null, networkOptIn: false });
    if (!ok) return false;
    if (userId) await supabase.from('driver_locations').delete().eq('user_id', userId);
    void track('sos_consent_revoked');
    await loadAlerts();
    return true;
  }, [loadAlerts, updatePrefs, userId]);

  const saveContact = useCallback(
    async (slot: number, name: string, phone: string): Promise<string | null> => {
      if (!userId) return 'Entre na sua conta para salvar um contato.';
      if (slot < 1 || slot > MAX_EMERGENCY_CONTACTS) return 'Essa posição da lista não existe.';
      if (name.trim().length === 0) return 'Escreva o nome de quem você quer avisar.';
      if (!isDiallablePhone(phone)) return 'Confira o telefone: faltam números.';

      const { error } = await supabase.from('emergency_contacts').upsert(
        {
          user_id: userId,
          slot,
          name: name.trim(),
          phone: sanitisePhone(phone),
        },
        { onConflict: 'user_id,slot' },
      );

      if (error) return 'Não conseguimos salvar. Confira sua conexão e tente de novo.';
      await loadContacts();
      return null;
    },
    [loadContacts, userId],
  );

  const removeContact = useCallback(
    async (slot: number) => {
      if (!userId) return false;
      const { error } = await supabase
        .from('emergency_contacts')
        .delete()
        .eq('user_id', userId)
        .eq('slot', slot);
      if (error) return false;
      await loadContacts();
      return true;
    },
    [loadContacts, userId],
  );

  const arm = useCallback((options?: { demo?: boolean }) => {
    armedDemo.current = options?.demo === true;
    // A leitura começa agora, em paralelo com a contagem.
    pendingFix.current = currentFix();
    setArmed(true);
  }, []);

  /**
   * Cancelar durante a contagem. Ninguém é avisado, e fica registrado.
   *
   * O registro é o que permite auditar alarme falso, e a proporção entre
   * disparo e cancelamento é a única medida que diz se três segundos de toque
   * são suficientes. Um cancelamento sem linha nenhuma é indistinguível de um
   * disparo que nunca houve.
   */
  const dismiss = useCallback(() => {
    setArmed(false);
    pendingFix.current = null;
  }, []);

  const abort = useCallback(async () => {
    setArmed(false);
    const fix = await (pendingFix.current ?? Promise.resolve(null));
    pendingFix.current = null;
    void track('sos_alert_aborted');
    try {
      await supabase.rpc('sos_log_aborted', {
        p_lat: fix && !fix.demo ? fix.lat : null,
        p_lon: fix && !fix.demo ? fix.lon : null,
      });
    } catch {
      // Um cancelamento nunca pode falhar na cara de quem cancelou. O registro
      // é para nós; a vontade da pessoa já foi respeitada na linha de cima.
    }
    await loadAlerts();
  }, [loadAlerts]);

  /**
   * Dispara.
   *
   * NÃO fecha a contagem: quem fecha é a folha, depois de saber o que
   * aconteceu. Fechar aqui apagava a folha no meio do envio, e a falha
   * seguinte ("você já disparou um alerta hoje") era escrita numa tela que
   * já tinha desaparecido.
   */
  const fire = useCallback(async (): Promise<SosFireOutcome> => {
    const demo = armedDemo.current;
    const fix = await (pendingFix.current ?? currentFix());
    pendingFix.current = null;

    // Leitura falhou e isto NÃO é uma demonstração pedida: recusar é mais
    // honesto que disparar. Um alerta marcado como demonstração não acorda
    // ninguém, e disparar um em cima de um GPS que não respondeu deixaria a
    // pessoa achando que pediu socorro de verdade. A falha coloca o 190 na
    // tela, que é o que resolve quando a localização não sai.
    if (fix.demo && !demo) {
      void track('sos_alert_triggered', { ok: false, reason: 'sos_invalid_position' });
      return {
        ok: false,
        alertId: null,
        notified: 0,
        demo: false,
        message: describeSosFailure('sos_invalid_position'),
      };
    }

    const { data, error } = await supabase.rpc('sos_trigger', {
      p_lat: fix.lat,
      p_lon: fix.lon,
      p_accuracy: fix.accuracy,
      p_demo: demo,
    });

    if (error) {
      const code = sosFailureCode(error.message);
      void track('sos_alert_triggered', { ok: false, reason: code });
      return { ok: false, alertId: null, notified: 0, demo, message: describeSosFailure(code) };
    }

    const result = (data ?? {}) as { alert_id?: string; notified?: number; is_demo?: boolean };
    const notified = Number(result.notified ?? 0);

    void track('sos_alert_triggered', { ok: true, notified, demo: Boolean(result.is_demo) });

    // O Push é um canal ADICIONAL, e por isso não é esperado: o aviso dentro do
    // aplicativo já foi criado pelo banco junto com o alerta. Travar a tela de
    // socorro numa requisição HTTP seria pagar com o pior segundo possível por
    // algo que já aconteceu.
    if (result.alert_id && !result.is_demo) {
      void supabase.functions
        .invoke('sos-dispatch', { body: { alertId: result.alert_id } })
        .catch(() => undefined);
    }

    await loadAlerts();

    return {
      ok: true,
      alertId: result.alert_id ?? null,
      notified,
      demo: Boolean(result.is_demo),
      message: null,
    };
  }, [loadAlerts]);

  const close = useCallback(async () => {
    if (!alert) return false;
    const { data, error } = await supabase.rpc('sos_close', {
      p_alert_id: alert.id,
      p_cancelled: false,
    });
    if (error) return false;
    void track('sos_alert_ended');
    await loadAlerts();
    return Boolean(data);
  }, [alert, loadAlerts]);

  const value = useMemo<SafetyState>(
    () => ({
      ready,
      prefs,
      consented: prefs.consentAt !== null,
      updatePrefs,
      grantConsent,
      revokeConsent,
      contacts,
      saveContact,
      removeContact,
      alert,
      incoming,
      history,
      armed,
      arm,
      abort,
      dismiss,
      fire,
      close,
      refresh,
    }),
    [
      abort,
      alert,
      arm,
      armed,
      close,
      contacts,
      dismiss,
      fire,
      grantConsent,
      history,
      incoming,
      prefs,
      ready,
      refresh,
      removeContact,
      revokeConsent,
      saveContact,
      updatePrefs,
    ],
  );

  return <SafetyContext.Provider value={value}>{children}</SafetyContext.Provider>;
}

export function useSafety(): SafetyState {
  const context = useContext(SafetyContext);
  if (!context) throw new Error('useSafety precisa estar dentro de um <SafetyProvider>.');
  return context;
}

/**
 * A mesma coisa, mas sem exigir o contexto.
 *
 * O cabeçalho é montado na tela de configuração inicial e em telas que rodam
 * fora do provedor, e um `throw` ali derrubaria o aplicativo por causa de um
 * botão. Sem contexto, o botão simplesmente não aparece.
 */
export function useSafetyOptional(): SafetyState | null {
  return useContext(SafetyContext);
}
