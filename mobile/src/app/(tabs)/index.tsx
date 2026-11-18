import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { FilaItem } from '@/components/fila-item';
import { Pantalla, Texto } from '@/components/ui';
import { Colores, Espacio, Radio } from '@/constants/theme';
import { useSesion } from '@/context/sesion';
import { ITEMS } from '@/data/ejemplo';

export default function Inicio() {
  const { usuario } = useSesion();
  const destacados = ITEMS.filter((i) => i.categoria === 'Destacados');

  return (
    <Pantalla>
      {/* Encabezado */}
      <View style={estilos.encabezado}>
        <View>
          <Texto variante="secundario">Hola,</Texto>
          <Texto variante="titulo" style={{ fontSize: 24 }}>
            {usuario?.nombre} 👋
          </Texto>
        </View>
        <Pressable onPress={() => router.push('/perfil')} style={estilos.avatar}>
          <Texto style={{ color: '#fff', fontWeight: '700' }}>{usuario?.nombre.charAt(0).toUpperCase()}</Texto>
        </Pressable>
      </View>

      {/* Banner principal */}
      <View style={estilos.banner}>
        <View style={{ flex: 1, gap: Espacio.xs }}>
          <Texto style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>Promoción especial</Texto>
          <Texto style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14 }}>
            Un espacio para destacar lo más importante de tu negocio.
          </Texto>
        </View>
        <Ionicons name="gift" size={48} color="rgba(255,255,255,0.9)" />
      </View>

      {/* Destacados en carrusel */}
      <Texto variante="subtitulo">Destacados</Texto>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Espacio.s }}>
        {destacados.map((item) => (
          <Pressable key={item.id} onPress={() => router.push(`/detalle/${item.id}`)} style={estilos.carta}>
            <View style={[estilos.cartaImagen, { backgroundColor: item.color }]}>
              <Ionicons name="image-outline" size={28} color="rgba(0,0,0,0.35)" />
            </View>
            <Texto style={{ fontWeight: '600' }} numberOfLines={1}>
              {item.titulo}
            </Texto>
            <Texto style={{ color: Colores.primario, fontWeight: '700' }}>${item.precio}</Texto>
          </Pressable>
        ))}
      </ScrollView>

      {/* Lista completa */}
      <Texto variante="subtitulo">Todo</Texto>
      <View style={{ gap: Espacio.s }}>
        {ITEMS.map((item) => (
          <FilaItem key={item.id} item={item} />
        ))}
      </View>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  encabezado: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: Radio.total,
    backgroundColor: Colores.primario,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacio.m,
    backgroundColor: Colores.primario,
    borderRadius: Radio.l,
    padding: Espacio.l,
  },
  carta: {
    width: 160,
    gap: Espacio.xs,
    backgroundColor: Colores.superficie,
    borderRadius: Radio.m,
    padding: Espacio.s,
    borderWidth: 1,
    borderColor: Colores.borde,
  },
  cartaImagen: { height: 110, borderRadius: Radio.s, alignItems: 'center', justifyContent: 'center', marginBottom: Espacio.xs },
});
