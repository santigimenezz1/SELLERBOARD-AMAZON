/** Datos de ejemplo para ver el diseño. Se reemplazan por los reales del negocio. */

export type Item = {
  id: string;
  titulo: string;
  descripcion: string;
  categoria: string;
  precio: number;
  color: string;
};

export const CATEGORIAS = ['Todos', 'Destacados', 'Nuevos', 'Ofertas'] as const;

export const ITEMS: Item[] = [
  { id: '1', titulo: 'Producto o servicio 1', descripcion: 'Una descripción corta de lo que ofreces y por qué le interesa al cliente.', categoria: 'Destacados', precio: 25, color: '#C7D2FE' },
  { id: '2', titulo: 'Producto o servicio 2', descripcion: 'Otra opción del catálogo con su propio detalle y precio.', categoria: 'Nuevos', precio: 40, color: '#FBCFE8' },
  { id: '3', titulo: 'Producto o servicio 3', descripcion: 'Ideal para mostrar promociones o paquetes especiales.', categoria: 'Ofertas', precio: 15, color: '#BBF7D0' },
  { id: '4', titulo: 'Producto o servicio 4', descripcion: 'Un elemento más para ver cómo se ve la lista completa.', categoria: 'Destacados', precio: 60, color: '#FDE68A' },
  { id: '5', titulo: 'Producto o servicio 5', descripcion: 'Texto de ejemplo para completar el catálogo.', categoria: 'Nuevos', precio: 32, color: '#BAE6FD' },
];

export const AVISOS = [
  { id: 'a1', titulo: 'Bienvenido a la app', texto: 'Aquí verás las novedades y avisos importantes.', hace: 'Ahora' },
  { id: 'a2', titulo: 'Nueva oferta disponible', texto: 'Revisa la sección de ofertas para no perdértela.', hace: 'Hace 2 h' },
  { id: 'a3', titulo: 'Recordatorio', texto: 'Completa tu perfil para una mejor experiencia.', hace: 'Ayer' },
];
