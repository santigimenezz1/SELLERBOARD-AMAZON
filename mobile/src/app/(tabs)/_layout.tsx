import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { ComponentProps } from 'react';

import { Colores } from '@/constants/theme';

type Icono = ComponentProps<typeof Ionicons>['name'];

const PESTANAS: { name: string; title: string; icono: Icono }[] = [
  { name: 'index', title: 'Inicio', icono: 'home' },
  { name: 'buscar', title: 'Buscar', icono: 'search' },
  { name: 'avisos', title: 'Avisos', icono: 'notifications' },
  { name: 'perfil', title: 'Perfil', icono: 'person' },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colores.primario,
        tabBarInactiveTintColor: Colores.textoSecundario,
        tabBarStyle: { backgroundColor: Colores.superficie, borderTopColor: Colores.borde },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}>
      {PESTANAS.map((p) => (
        <Tabs.Screen
          key={p.name}
          name={p.name}
          options={{
            title: p.title,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? p.icono : (`${p.icono}-outline` as Icono)} size={size} color={color as string} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
