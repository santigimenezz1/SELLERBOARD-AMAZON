import '@/global.css';

/**
 * Colores, espacios y tamaños de toda la app.
 * Para cambiar la marca basta con tocar `primario` (y su variante suave).
 */
export const Colores = {
  primario: '#5B4BF5',
  primarioSuave: '#EEECFE',
  fondo: '#F6F6F9',
  superficie: '#FFFFFF',
  texto: '#14141A',
  textoSecundario: '#6B6B7B',
  borde: '#E6E6EE',
  exito: '#16A34A',
  peligro: '#DC2626',
} as const;

export const Espacio = {
  xs: 4,
  s: 8,
  m: 16,
  l: 24,
  xl: 32,
} as const;

export const Radio = {
  s: 10,
  m: 16,
  l: 24,
  total: 999,
} as const;

/** En el navegador la app se muestra con ancho de teléfono. */
export const AnchoMaximo = 480;
