import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Boton, Pantalla, Texto } from '@/components/ui';
import { Colores, Espacio, Radio } from '@/constants/theme';
import { useSesion } from '@/context/sesion';

type Icono = ComponentProps<typeof Ionicons>['name'];

const OPCIONES: { icono: Icono; texto: string }[] = [
  { icono: 'person-outline', texto: 'Datos personales' },
  { icono: 'notifications-outline', texto: 'Notificaciones' },
  { icono: 'card-outline', texto: 'Métodos de pago' },
  { icono: 'help-circle-outline', texto: 'Ayuda y soporte' },
  { icono: 'document-text-outline', texto: 'Términos y privacidad' },
];

export default function Perfil() {
  const { usuario, salir } = useSesion();

  return (
    <Pantalla>
      <View style={estilos.cabecera}>
        <View style={estilos.avatar}>
          <Texto style={{ color: '#fff', fontSize: 32, fontWeight: '700' }}>
            {usuario?.nombre.charAt(0).toUpperCase()}
          </Texto>
        </View>
        <Texto variante="subtitulo">{usuario?.nombre}</Texto>
        <Texto variante="secundario">{usuario?.email}</Texto>
      </View>

      <View style={estilos.lista}>
        {OPCIONES.map((o, i) => (
          <Pressable
            key={o.texto}
            style={({ pressed }) => [estilos.opcion, i > 0 && estilos.separador, pressed && { opacity: 0.6 }]}>
            <Ionicons name={o.icono} size={20} color={Colores.texto} />
            <Texto style={{ flex: 1 }}>{o.texto}</Texto>
            <Ionicons name="chevron-forward" size={18} color={Colores.textoSecundario} />
          </Pressable>
        ))}
      </View>

      <Boton titulo="Cerrar sesión" tipo="secundario" onPress={salir} />
      <Texto variante="secundario" style={{ textAlign: 'center', fontSize: 12 }}>
        Versión 1.0.0
      </Texto>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  cabecera: { alignItems: 'center', gap: Espacio.xs, paddingVertical: Espacio.m },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: Radio.total,
    backgroundColor: Colores.primario,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Espacio.s,
  },
  lista: {
    backgroundColor: Colores.superficie,
    borderRadius: Radio.m,
    borderWidth: 1,
    borderColor: Colores.borde,
    overflow: 'hidden',
  },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: Espacio.m, padding: Espacio.m },
  separador: { borderTopWidth: 1, borderTopColor: Colores.borde },
});
