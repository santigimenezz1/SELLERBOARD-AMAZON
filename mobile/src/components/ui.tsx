import { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colores, Espacio, Radio } from '@/constants/theme';

/* ---------- Texto ---------- */

type Variante = 'titulo' | 'subtitulo' | 'cuerpo' | 'secundario' | 'etiqueta';

export function Texto({ variante = 'cuerpo', style, ...rest }: TextProps & { variante?: Variante }) {
  return <Text style={[estilos[variante], style]} {...rest} />;
}

/* ---------- Pantalla: área segura + scroll ---------- */

export function Pantalla({
  children,
  scroll = true,
  estilo,
}: {
  children: ReactNode;
  scroll?: boolean;
  estilo?: ViewStyle;
}) {
  return (
    <SafeAreaView style={estilos.pantalla} edges={['top']}>
      {scroll ? (
        <ScrollView contentContainerStyle={[estilos.contenido, estilo]} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[estilos.contenido, { flex: 1 }, estilo]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

/* ---------- Botón ---------- */

export function Boton({
  titulo,
  onPress,
  tipo = 'primario',
}: {
  titulo: string;
  onPress?: () => void;
  tipo?: 'primario' | 'secundario' | 'texto';
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [estilos.boton, estilos[`boton_${tipo}`], pressed && { opacity: 0.75 }]}>
      <Text style={[estilos.botonTexto, tipo !== 'primario' && { color: Colores.primario }]}>{titulo}</Text>
    </Pressable>
  );
}

/* ---------- Campo de texto ---------- */

export function Campo({ etiqueta, ...rest }: TextInputProps & { etiqueta: string }) {
  return (
    <View style={{ gap: Espacio.xs }}>
      <Texto variante="etiqueta">{etiqueta}</Texto>
      <TextInput placeholderTextColor={Colores.textoSecundario} style={estilos.campo} {...rest} />
    </View>
  );
}

/* ---------- Tarjeta ---------- */

export function Tarjeta({ children, onPress, estilo }: { children: ReactNode; onPress?: () => void; estilo?: ViewStyle }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [estilos.tarjeta, estilo, pressed && { opacity: 0.85 }]}>
      {children}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  titulo: { fontSize: 28, fontWeight: '700', color: Colores.texto, letterSpacing: -0.5 },
  subtitulo: { fontSize: 18, fontWeight: '600', color: Colores.texto },
  cuerpo: { fontSize: 16, color: Colores.texto, lineHeight: 22 },
  secundario: { fontSize: 14, color: Colores.textoSecundario, lineHeight: 20 },
  etiqueta: { fontSize: 13, fontWeight: '600', color: Colores.textoSecundario },

  pantalla: { flex: 1, backgroundColor: Colores.fondo },
  contenido: { padding: Espacio.m, gap: Espacio.m, paddingBottom: Espacio.xl },

  boton: { height: 52, borderRadius: Radio.m, alignItems: 'center', justifyContent: 'center' },
  boton_primario: { backgroundColor: Colores.primario },
  boton_secundario: { backgroundColor: Colores.primarioSuave },
  boton_texto: { backgroundColor: 'transparent' },
  botonTexto: { color: '#fff', fontSize: 16, fontWeight: '600' },

  campo: {
    height: 50,
    borderRadius: Radio.s,
    borderWidth: 1,
    borderColor: Colores.borde,
    backgroundColor: Colores.superficie,
    paddingHorizontal: Espacio.m,
    fontSize: 16,
    color: Colores.texto,
  },

  tarjeta: {
    backgroundColor: Colores.superficie,
    borderRadius: Radio.m,
    padding: Espacio.m,
    borderWidth: 1,
    borderColor: Colores.borde,
  },
});
