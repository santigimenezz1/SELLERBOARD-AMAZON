import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Boton, Pantalla, Texto } from '@/components/ui';
import { Colores, Espacio, Radio } from '@/constants/theme';

/** Pantalla de bienvenida (la primera que ve alguien sin sesión). */
export default function Bienvenida() {
  return (
    <Pantalla scroll={false} estilo={{ justifyContent: 'space-between' }}>
      <View style={estilos.hero}>
        <View style={estilos.logo}>
          <Ionicons name="sparkles" size={44} color="#fff" />
        </View>
        <Texto variante="titulo" style={{ textAlign: 'center' }}>
          Mi App
        </Texto>
        <Texto variante="secundario" style={{ textAlign: 'center', maxWidth: 300 }}>
          Aquí va el mensaje principal de tu negocio: qué ofreces y por qué usar la app.
        </Texto>
      </View>

      <View style={{ gap: Espacio.s }}>
        <Boton titulo="Crear cuenta" onPress={() => router.push('/registro')} />
        <Boton titulo="Ya tengo cuenta" tipo="secundario" onPress={() => router.push('/login')} />
      </View>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Espacio.m },
  logo: {
    width: 96,
    height: 96,
    borderRadius: Radio.l,
    backgroundColor: Colores.primario,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Espacio.s,
  },
});
