import { Redirect } from 'expo-router';

/** Cualquier ruta desconocida vuelve al inicio. */
export default function NoEncontrado() {
  return <Redirect href="/" />;
}
