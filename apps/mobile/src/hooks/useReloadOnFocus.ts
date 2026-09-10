import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';

/**
 * Recarrega quando a tela volta ao foco, e não só quando ela é montada.
 *
 * O bug que isto resolve: corrigir um dia anterior gravava certo no banco e a
 * tela do dia mostrava o número novo na hora, porque ela recalcula a partir
 * das próprias linhas. Aí o motorista voltava para o Histórico, para a Home ou
 * para os Insights e via os valores de antes. As três telas leem `daily_totals`
 * uma única vez, num `useEffect` que só depende do usuário logado, e o
 * expo-router mantém a aba montada por baixo: nada mandava ler de novo.
 *
 * O sintoma era sempre o mesmo, e é exatamente o que foi relatado: "lancei o
 * gasto e ele não foi contabilizado". Ele tinha sido, o aplicativo é que
 * estava mostrando a resposta antiga.
 *
 * Voltar ao foco é o gatilho certo em vez de avisar tela por tela depois de
 * cada gravação: quem escreve não é só a tela do dia, é Registrar, o
 * abastecimento, os custos fixos, a manutenção e o encerramento da jornada. Um
 * aviso que precisa ser lembrado em cada um deles é um aviso que um dia falta.
 *
 * O `load` precisa ser estável (`useCallback`), senão o foco vira um laço.
 */
export function useReloadOnFocus(load: () => void | Promise<void>): void {
  useFocusEffect(
    // A callback do useFocusEffect não pode devolver uma Promise: o valor de
    // retorno é a função de limpeza. Daí o corpo em bloco.
    useCallback(() => {
      void load();
    }, [load]),
  );
}
