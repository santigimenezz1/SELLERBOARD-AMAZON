import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnchoMaximo, Colores } from '@/constants/theme';
import { SesionProvider, useSesion } from '@/context/sesion';

function Navegacion() {
  const { usuario } = useSesion();

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colores.fondo } }}>
      {/* Sin sesión: bienvenida, login y registro */}
      <Stack.Protected guard={!usuario}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      {/* Con sesión: pestañas y pantallas internas */}
      <Stack.Protected guard={!!usuario}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="detalle/[id]"
          options={{ headerShown: true, title: 'Detalle', headerBackTitle: 'Volver', headerTintColor: Colores.primario }}
        />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SesionProvider>
        {/* En el navegador, la app ocupa el ancho de un teléfono */}
        <View style={estilos.marco}>
          <View style={estilos.telefono}>
            <Navegacion />
          </View>
        </View>
        <StatusBar style="dark" />
      </SesionProvider>
    </SafeAreaProvider>
  );
}

const estilos = StyleSheet.create({
  marco: { flex: 1, backgroundColor: Platform.OS === 'web' ? '#E4E4EC' : Colores.fondo, alignItems: 'center' },
  telefono: { flex: 1, width: '100%', maxWidth: AnchoMaximo, backgroundColor: Colores.fondo, overflow: 'hidden' },
});
