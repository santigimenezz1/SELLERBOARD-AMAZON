import { Stack } from 'expo-router';

import { Colores } from '@/constants/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colores.fondo },
      }}
    />
  );
}
