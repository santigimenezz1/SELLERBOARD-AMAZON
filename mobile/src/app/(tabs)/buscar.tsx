import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { FilaItem } from '@/components/fila-item';
import { Pantalla, Texto } from '@/components/ui';
import { Colores, Espacio, Radio } from '@/constants/theme';
import { CATEGORIAS, ITEMS } from '@/data/ejemplo';

export default function Buscar() {
  const [texto, setTexto] = useState('');
  const [categoria, setCategoria] = useState<string>('Todos');

  const resultados = ITEMS.filter(
    (i) =>
      (categoria === 'Todos' || i.categoria === categoria) &&
      i.titulo.toLowerCase().includes(texto.trim().toLowerCase()),
  );

  return (
    <Pantalla>
      <Texto variante="titulo">Buscar</Texto>

      <View style={estilos.buscador}>
        <Ionicons name="search" size={18} color={Colores.textoSecundario} />
        <TextInput
          placeholder="¿Qué estás buscando?"
          placeholderTextColor={Colores.textoSecundario}
          value={texto}
          onChangeText={setTexto}
          style={estilos.input}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Espacio.s }}>
        {CATEGORIAS.map((c) => {
          const activa = c === categoria;
          return (
            <Pressable key={c} onPress={() => setCategoria(c)} style={[estilos.chip, activa && estilos.chipActivo]}>
              <Texto style={{ fontSize: 14, fontWeight: '600', color: activa ? '#fff' : Colores.texto }}>{c}</Texto>
            </Pressable>
          );
        })}
      </ScrollView>

      <Texto variante="secundario">
        {resultados.length} {resultados.length === 1 ? 'resultado' : 'resultados'}
      </Texto>
      <View style={{ gap: Espacio.s }}>
        {resultados.map((item) => (
          <FilaItem key={item.id} item={item} />
        ))}
      </View>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  buscador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Espacio.s,
    height: 50,
    paddingHorizontal: Espacio.m,
    borderRadius: Radio.m,
    backgroundColor: Colores.superficie,
    borderWidth: 1,
    borderColor: Colores.borde,
  },
  input: { flex: 1, fontSize: 16, color: Colores.texto, height: '100%' },
  chip: {
    paddingHorizontal: Espacio.m,
    paddingVertical: Espacio.s,
    borderRadius: Radio.total,
    backgroundColor: Colores.superficie,
    borderWidth: 1,
    borderColor: Colores.borde,
  },
  chipActivo: { backgroundColor: Colores.primario, borderColor: Colores.primario },
});
