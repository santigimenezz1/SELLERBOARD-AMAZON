import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Boton, Campo, Pantalla, Texto } from '@/components/ui';
import { Espacio } from '@/constants/theme';
import { useSesion } from '@/context/sesion';

export default function Login() {
  const { entrar } = useSesion();
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');

  return (
    <Pantalla>
      <Boton titulo="‹ Volver" tipo="texto" onPress={() => router.back()} />
      <View style={{ gap: Espacio.xs, marginBottom: Espacio.m }}>
        <Texto variante="titulo">Iniciar sesión</Texto>
        <Texto variante="secundario">Bienvenido de nuevo. Ingresa tus datos.</Texto>
      </View>

      <Campo etiqueta="Correo electrónico" placeholder="tu@correo.com" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <Campo etiqueta="Contraseña" placeholder="••••••••" secureTextEntry value={clave} onChangeText={setClave} />

      <Boton titulo="Entrar" onPress={() => entrar(email || 'demo@miapp.com')} />
      <Boton titulo="¿No tienes cuenta? Regístrate" tipo="texto" onPress={() => router.replace('/registro')} />
    </Pantalla>
  );
}
