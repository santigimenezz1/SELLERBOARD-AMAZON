import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Tarjeta, Texto } from '@/components/ui';
import { Colores, Espacio, Radio } from '@/constants/theme';
import type { Item } from '@/data/ejemplo';

/** Un elemento del catálogo en forma de fila. Al tocarlo abre su detalle. */
export function FilaItem({ item }: { item: Item }) {
  return (
    <Tarjeta onPress={() => router.push(`/detalle/${item.id}`)} estilo={estilos.fila}>
      <View style={[estilos.imagen, { backgroundColor: item.color }]}>
        <Ionicons name="image-outline" size={22} color="rgba(0,0,0,0.35)" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Texto variante="subtitulo" style={{ fontSize: 16 }} numberOfLines={1}>
          {item.titulo}
        </Texto>
        <Texto variante="secundario" numberOfLines={1}>
          {item.categoria}
        </Texto>
      </View>
      <Texto style={{ fontWeight: '700', color: Colores.primario }}>${item.precio}</Texto>
    </Tarjeta>
  );
}

const estilos = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', gap: Espacio.m, padding: Espacio.s + 4 },
  imagen: { width: 56, height: 56, borderRadius: Radio.s, alignItems: 'center', justifyContent: 'center' },
});
