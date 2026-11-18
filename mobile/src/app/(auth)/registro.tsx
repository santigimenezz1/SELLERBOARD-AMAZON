import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Boton, Campo, Pantalla, Texto } from '@/components/ui';
import { Espacio } from '@/constants/theme';
import { useSesion } from '@/context/sesion';

export default function Registro() {
  const { registrarse } = useSesion();
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');

  return (
    <Pantalla>
      <Boton titulo="‹ Volver" tipo="texto" onPress={() => router.back()} />
      <View style={{ gap: Espacio.xs, marginBottom: Espacio.m }}>
        <Texto variante="titulo">Crear cuenta</Texto>
        <Texto variante="secundario">Solo te tomará un minuto.</Texto>
      </View>

      <Campo etiqueta="Nombre" placeholder="Tu nombre" value={nombre} onChangeText={setNombre} />
      <Campo etiqueta="Correo electrónico" placeholder="tu@correo.com" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <Campo etiqueta="Contraseña" placeholder="Mínimo 8 caracteres" secureTextEntry value={clave} onChangeText={setClave} />

      <Boton titulo="Crear cuenta" onPress={() => registrarse(nombre || 'Usuario', email || 'demo@miapp.com')} />
      <Boton titulo="¿Ya tienes cuenta? Inicia sesión" tipo="texto" onPress={() => router.replace('/login')} />
    </Pantalla>
  );
}
