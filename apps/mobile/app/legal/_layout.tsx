import { Stack } from 'expo-router';

/**
 * Os documentos legais ficam fora da barreira de login de propósito: as duas
 * lojas exigem uma URL de política de privacidade que abra para qualquer
 * pessoa, sem conta. O guarda em `app/_layout.tsx` conhece este grupo.
 */
export default function LegalLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
