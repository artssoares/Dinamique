import { Text } from '@dinamique/ui';

/**
 * Identifica qual construção do aplicativo está no ar.
 *
 * Existe por um motivo prático: quando alguém relata um problema, a primeira
 * pergunta é se a pessoa está vendo a versão corrigida ou uma antiga guardada
 * pelo navegador. Sem isso, não há como saber — e se responde adivinhando.
 *
 * O valor vem do commit publicado, injetado pela Vercel na hora de construir.
 * Em desenvolvimento fica "local".
 */
export function BuildStamp() {
  const id = process.env.EXPO_PUBLIC_BUILD_ID ?? 'local';

  return (
    <Text variant="overline" color="muted" align="center">
      versão {id.slice(0, 7)}
    </Text>
  );
}
