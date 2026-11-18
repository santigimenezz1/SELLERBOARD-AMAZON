import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Boton, Pantalla, Texto } from '@/components/ui';
import { Colores, Espacio, Radio } from '@/constants/theme';
import { ITEMS } from '@/data/ejemplo';

export default function Detalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = ITEMS.find((i) => i.id === id);

  if (!item) {
    return (
      <Pantalla>
        <Texto variante="subtitulo">No encontrado</Texto>
      </Pantalla>
    );
  }

  return (
    <Pantalla>
      <View style={[estilos.imagen, { backgroundColor: item.color }]}>
        <Ionicons name="image-outline" size={56} color="rgba(0,0,0,0.3)" />
      </View>

      <View style={estilos.etiqueta}>
        <Texto style={{ color: Colores.primario, fontSize: 13, fontWeight: '600' }}>{item.categoria}</Texto>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Espacio.m }}>
        <Texto variante="titulo" style={{ fontSize: 24, flex: 1 }}>
          {item.titulo}
        </Texto>
        <Texto style={{ fontSize: 24, fontWeight: '700', color: Colores.primario }}>${item.precio}</Texto>
      </View>

      <Texto variante="secundario" style={{ fontSize: 16, lineHeight: 24 }}>
        {item.descripcion}
      </Texto>

      <Boton titulo="Acción principal" />
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  imagen: { height: 240, borderRadius: Radio.l, alignItems: 'center', justifyContent: 'center' },
  etiqueta: {
    alignSelf: 'flex-start',
    backgroundColor: Colores.primarioSuave,
    paddingHorizontal: Espacio.s + 4,
    paddingVertical: Espacio.xs,
    borderRadius: Radio.total,
  },
});
