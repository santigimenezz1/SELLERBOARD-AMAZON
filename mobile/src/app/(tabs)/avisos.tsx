import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { Pantalla, Tarjeta, Texto } from '@/components/ui';
import { Colores, Espacio, Radio } from '@/constants/theme';
import { AVISOS } from '@/data/ejemplo';

export default function Avisos() {
  return (
    <Pantalla>
      <Texto variante="titulo">Avisos</Texto>
      <View style={{ gap: Espacio.s }}>
        {AVISOS.map((a) => (
          <Tarjeta key={a.id} estilo={estilos.fila}>
            <View style={estilos.icono}>
              <Ionicons name="notifications" size={18} color={Colores.primario} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: Espacio.s }}>
                <Texto style={{ fontWeight: '600', flex: 1 }}>{a.titulo}</Texto>
                <Texto variante="secundario" style={{ fontSize: 12 }}>
                  {a.hace}
                </Texto>
              </View>
              <Texto variante="secundario">{a.texto}</Texto>
            </View>
          </Tarjeta>
        ))}
      </View>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  fila: { flexDirection: 'row', gap: Espacio.m, alignItems: 'flex-start' },
  icono: {
    width: 36,
    height: 36,
    borderRadius: Radio.total,
    backgroundColor: Colores.primarioSuave,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
