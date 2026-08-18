import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import {
  enqueue,
  pendingOperations,
  readQueue,
  stuckOperations,
  type SyncableTable,
} from './queue';
import { syncQueue } from './sync';
import { supabase } from '@/lib/supabase';

interface OfflineState {
  isOnline: boolean;
  pendingCount: number;
  stuckCount: number;
  /** Grava direto se houver rede; senão, guarda para depois. */
  save: (table: SyncableTable, payload: Record<string, unknown>) => Promise<boolean>;
  sync: () => Promise<void>;
}

const OfflineContext = createContext<OfflineState | null>(null);

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [stuckCount, setStuckCount] = useState(0);

  const refreshCounts = useCallback(async () => {
    const queue = await readQueue();
    setPendingCount(pendingOperations(queue).length);
    setStuckCount(stuckOperations(queue).length);
  }, []);

  const sync = useCallback(async () => {
    await syncQueue();
    await refreshCounts();
  }, [refreshCounts]);

  useEffect(() => {
    void refreshCounts();

    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsOnline(online);
      // A conexão voltar é o momento certo de esvaziar a fila.
      if (online) void sync();
    });

    // Voltar para o aplicativo também é: o aparelho pode ter reconectado
    // enquanto estava em segundo plano, sem disparar o evento acima.
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void sync();
    });

    return () => {
      unsubscribe();
      appStateSub.remove();
    };
  }, [refreshCounts, sync]);

  const save = useCallback(
    async (table: SyncableTable, payload: Record<string, unknown>) => {
      // O client_id é gerado sempre, online ou não: se a resposta se perder no
      // caminho, o reenvio continua sendo seguro.
      const clientId = generateId();
      const withId = { ...payload, client_id: clientId };

      if (isOnline) {
        const { error } = await supabase.from(table).insert(withId);
        if (!error) return true;
        // Falhou com rede aparentemente disponível: guardamos mesmo assim, em
        // vez de perder o registro do motorista.
      }

      await enqueue(table, payload, clientId);
      await refreshCounts();
      return false;
    },
    [isOnline, refreshCounts],
  );

  return (
    <OfflineContext.Provider value={{ isOnline, pendingCount, stuckCount, save, sync }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline(): OfflineState {
  const context = useContext(OfflineContext);
  if (!context) throw new Error('useOffline precisa estar dentro de <OfflineProvider>.');
  return context;
}

/** UUID v4 sem depender de crypto.randomUUID, ausente em parte dos aparelhos. */
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
