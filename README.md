# Electronic VLC — Beneficios

Panel interno (estilo Sellerboard) para ver cuánto vende y cuánto gana de verdad la tienda de Amazon, por país, después de comisiones, reembolsos y coste de producto.

Stack: Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Firebase (Auth + Firestore) · Amazon SP-API.

## Puesta en marcha

Requiere Node.js 22.12 o superior (ver `.nvmrc`).

### 1. Firebase

1. Crea un proyecto en <https://console.firebase.google.com> (o reutiliza uno).
2. **Authentication** → Sign-in method → activa *Correo electrónico/contraseña*.
3. **Authentication** → Settings → *User actions* → **desmarca "Enable create (sign-up)"** (sin registro público).
4. **Authentication** → Users → *Add user*: crea tu cuenta a mano.
5. **Firestore Database** → crear base de datos (modo producción) y publica `firestore.rules`
   (todo el acceso pasa por el servidor, así que las reglas cierran el acceso directo desde el navegador).

### 2. Amazon SP-API

En Seller Central → Apps y servicios → Develop Apps, en tu app ya registrada:

1. **Regenera el Client Secret** (el anterior se compartió en un chat y no debe reutilizarse).
2. Pulsa **Authorize app** para generar un **Refresh Token** nuevo vinculado a tu cuenta de vendedor.
3. La app necesita los roles que dan acceso a *Orders*, *Finance and Accounting*, *Sellers* (Selling Partner Insights) y
   *Product Listing* (Catalog Items, para la foto de cada producto).

No hace falta nada de AWS (IAM ni SigV4): basta con LWA.

### 3. `.env.local`

Copia `.env.example` como `.env.local` y rellena Firebase (cliente y admin) y `SPAPI_*`. **Nunca lo subas al repositorio** (está en `.gitignore`).

```bash
npm install
npm run dev
```

Si el antivirus inspecciona HTTPS (Avast, AVG…) y aparece `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, arranca con
`$env:NODE_OPTIONS="--use-system-ca"; npm run dev` (igual que en MakerLab).

## Qué muestra ahora el panel (Fase 1 simplificada)

Diseño tipo Sellerboard, con los colores de la app:

- **Tarjetas de período:** Hoy, Ayer, Esta semana (de lunes a hoy), Este mes, Este mes (pronóstico) y El mes pasado, cada una con su fecha, **ventas** y
  **pedidos / unidades** y **reembolsos** (pedidos reembolsados en ese período, contados por la fecha del reembolso, como
  Sellerboard). Al pulsar una se selecciona y la lista de abajo muestra sus productos. El pronóstico proyecta
  las ventas del mes al ritmo actual (no se puede seleccionar). El menú **Período** añade una tarjeta más (últimos 7 o 30
  días, o un rango personalizado).
- **Ventas por día** de un mes (selector de los últimos 12 meses): barras con las ventas o las unidades de cada día y una
  línea con la media de 7 días como tendencia. Al pasar el ratón se compara con el día anterior; al pulsar un día, se
  abre como tarjeta propia con sus productos.
- **Todos los mercados** por defecto; al elegir un país todo se limita a ese país.
- **Productos** del período seleccionado, como en Seller Central: foto, ASIN · SKU, título, unidades, reembolsos (por fecha
  de reembolso; un producto reembolsado sin ventas en el período sale con 0 unidades), ventas y precio medio de venta
  (ventas ÷ unidades); en la vista de
  todos los mercados, debajo de cada producto, la bandera de cada país con sus unidades.

La lógica de agregación es pura (`src/lib/datos/ventas.ts`, `periodos.ts`, `tablero.ts`) y la comparten el panel y la
vista `VistaPanel`.

El cálculo de comisiones, IVA, coste y beneficio neto **sigue funcionando** en la sincronización y en `cargarPanel`,
pero no se muestra. Los componentes que lo enseñan (`Tarjetas`, `GraficoDiario`, `TablaProductos`) siguen en
`src/components/panel/` para reactivarlos cuando lo básico esté validado.

## Sección Productos

Todos los listings conocidos (vendidos, con stock FBA o con ficha) como tarjetas, y una **ficha por producto** que imita la
página de Amazon para un comprador: galería, marca, título, precio (con Prime y envío), y ranking de ventas, en el idioma de cada país (selector de los mercados con ventas). Encima,
una franja con los datos de vendedor: SKUs, stock por región, ventas y reembolsos de 30 días y estado de la Buy Box.

Datos: Catalog Items API (una vez al día) y Product Pricing `getPricing` + `getCompetitivePricing` (cada 3 horas), en lotes
de 20 ASIN por llamada y país, guardados en `fichas/{asin}` solo si cambian y leídos desde el almacén en memoria.
**Actualizar ficha** fuerza la descarga de un producto.

Debajo, el recuadro **Coste del producto**: piezas agrupadas por proveedor, más dos costes por lote (**inspección** y
**envío AGL** del último envío: coste total ÷ unidades), con subtotales y coste total por unidad (sin IVA), todo editable.
El coste va **por región**: uno para Europa (ES, DE, FR, IT, NL…, doc `escandallos/{asin}`) y otro aparte para Reino
Unido (`escandallos/{asin}_UK`); cambiar uno no toca el otro. El envío AGL se rellena a mano por ahora; más adelante se tomará de Amazon Global Logistics. Se guarda en `escandallos/{asin}` al pulsar Guardar. Debajo, **Proveedores del producto**: una tarjeta

Debajo, **Lo que te paga Amazon**: el desglose por unidad (IVA retenido, comisión, FBA, servicios digitales → lo que
ingresa Amazon) en el país elegido, sacado de la última venta real «limpia» (sin promociones ni Vine, con el IVA del
propio país) guardada por la sincronización en `config/tarifasVenta`. El precio se puede editar: comisión e IVA escalan
con el precio y la tarifa FBA queda fija. Al lado, beneficio por unidad con el coste de su región, margen sobre el precio
y rentabilidad sobre el coste.
desplegable por proveedor con sus datos de contacto, guardados en `proveedores/{nombre}` y compartidos entre productos. Amazon no da por API las estrellas y reseñas.

## Sección Stock

Stock FBA por región (FBA Inventory API). Amazon guarda un stock común para los mercados de la UE (FBA paneuropeo) y otro
para Reino Unido: se consulta cada mercado y los que devuelven el mismo stock se agrupan en una región. Por producto:
vendible por región, vendible total, reservado (pedidos, traslados entre almacenes y proceso), en camino a Amazon y no
vendible (incluye lo que está en investigación). Se actualiza en cada sincronización o con **Actualizar stock**; se guarda en
un único documento (`config/stock`), solo si cambió, y se lee de memoria.

## Cómo funciona la sincronización

Botón **Sincronizar ahora** → `POST /api/sync` (`src/lib/amazon/sincronizar.ts`):

1. **Sellers API** → marketplaces donde participas (se guardan en `config/marketplaces` y alimentan el filtro de país).
2. **Orders API v2026-01-01** (`searchOrders`) → pedidos **actualizados** desde la última sincronización. Se usa la fecha de
   actualización y no la de creación para recoger también cambios de estado (pendiente → enviado, cancelaciones) y el precio
   de pedidos que estaban pendientes. Cada línea (SKU) se guarda en `pedidos` con id `{amazonOrderId}_{orderItemId}`.
3. **Finances API v0** (`listFinancialEvents`) → movimientos financieros publicados desde la última sincronización
   (cargo de la venta con sus comisiones, reembolsos…), guardados en `transaccionesAmazon`. Leer el flujo de movimientos en
   vez de preguntar pedido a pedido cuesta muchas menos peticiones y además detecta reembolsos de pedidos antiguos.
4. Cada pedido tocado se **recalcula** a partir de todas sus transacciones guardadas: comisiones, reembolso y
   `beneficioNeto = (ventaTotal − impuestos) − comisionesAmazon − (reembolso − impuestosReembolso) − costeProducto`.
   Repetir una sincronización no duplica nada.

5. **Catalog Items API** (`searchCatalogItems`, 20 ASIN por llamada) → foto principal de cada ASIN vendido que aún no
   la tenga, en `productos/{asin}`. Se pide una sola vez por ASIN; si falla, no bloquea las ventas y se reintenta.

Cada etapa tiene su propio cursor (`cursorPedidos`, `cursorFinanzas` en `sincronizaciones`), que solo avanza si la etapa termina
bien; si falla, la siguiente sincronización la reintenta desde el mismo punto. La primera sincronización trae
`SYNC_DIAS_INICIALES` días (90 por defecto, máx. 180). Los reintentos ante límites de peticiones (HTTP 429) respetan la tasa
que devuelve Amazon en `x-amzn-RateLimit-Limit`.

Orders usa la versión nueva (v2026-01-01). Finances usa la **v0**, porque la 2024-06-19 responde 403 para esta cuenta;
Amazon retira la v0 el **27/08/2027**, así que hay que migrar antes de esa fecha.

### Detalles de cálculo

- **Moneda:** todo se guarda en EUR. Los pedidos de marketplaces fuera del euro (Reino Unido, Suecia, Polonia…) se convierten con el
  tipo de referencia del BCE del día del pedido (frankfurter.dev, sin clave; se cachea en `tiposCambio`). Cada pedido guarda
  `moneda` y `tipoCambio`.
- **Pedidos sin liquidar:** Amazon publica las comisiones reales cuando cobra la venta (normalmente al enviar; puede tardar
  hasta 48 h). Hasta entonces el pedido cuenta con comisiones 0 y `liquidado: false`; el panel avisa de cuántos hay.
- **Cancelados:** se guardan con `estado: CANCELLED` y no cuentan en el panel.
- **IVA:** "Ventas" (`ventaTotal`) es lo que pagó el cliente, IVA incluido; el **beneficio neto y el margen son sin IVA**.
  El IVA sale, por orden de preferencia, de la liquidación de Amazon (Finances), de la Orders API o, si Amazon no lo
  desglosa (habitual en la UE), se **estima** con el tipo general del país del marketplace (`src/lib/datos/iva.ts`) y el
  pedido queda con `ivaEstimado: true` hasta que se liquida. El IVA de lo reembolsado se guarda en `impuestosReembolso`
  para no descontarlo dos veces; si Amazon no lo desglosa, se supone la misma proporción que en la venta. El IVA que
  Amazon cobra sobre sus comisiones cuenta como comisión. Los costes de producto se introducen sin IVA.
- **Coste de producto:** al guardar un coste se aplica a los pedidos que se sincronicen después **y** a los pedidos de ese SKU
  que no tenían coste; los que ya tenían uno lo conservan.

## Consumo de Firestore (plan gratuito)

El proyecto está pensado para quedarse en el plan **Spark** (50.000 lecturas y 20.000 escrituras al día; nunca genera
cargos). Claves:

- **Almacén en memoria** (`src/lib/datos/almacen.ts`): `pedidos`, `transaccionesAmazon` y `productos` se cargan una vez
  en el servidor y después solo se leen los documentos escritos desde la última carga (todos llevan `sincronizadoEn` o
  `actualizadoEn`). Cargar el panel cuesta ~3 lecturas (última sincronización, mercados y bloqueo).
- **Escritor** (misma pieza): antes de escribir compara con el almacén y **omite los documentos que no cambian**; lo que
  escribe lo aplica al almacén, así que tras sincronizar no se relee nada.
- La sincronización, la pantalla de costes y el cálculo de beneficio trabajan contra el almacén, nunca consultando colecciones.
- **Contador** (`src/lib/datos/consumo.ts`): cada operación se cuenta; el pie del panel muestra el consumo del día y se
  convierte en aviso a partir del 50 % de cualquiera de los dos límites. Se guarda en `consumo/{día}`.
- El almacén vive en un único proceso de servidor: desplegar en **un solo contenedor siempre encendido** (Railway), no en
  plataformas serverless que arrancan en frío en cada visita.

La cuota se reinicia a medianoche de California (9:00 en España).

## Despliegue en Railway

`Dockerfile` + `output: "standalone"` (igual que MakerLab). En Railway:

1. *New Project* → *Deploy from GitHub repo* → este repositorio. Railway detecta el `Dockerfile`.
2. *Variables* → *Raw Editor*: pega el contenido del `.env.local` (sin `NODE_OPTIONS`). Las `NEXT_PUBLIC_*` también se usan al
   construir: Railway las pasa como *build args* (declarados en el `Dockerfile`).
3. *Settings* → *Networking* → *Generate Domain*.
4. **Una sola réplica** (es lo predeterminado): el almacén en memoria vive en un único proceso.

## Colecciones de Firestore

| Colección | Contenido |
|---|---|
| `pedidos` | Una línea de pedido por documento (esquema en `src/lib/datos/tipos.ts`) |
| `costesProducto` | Coste unitario vigente por SKU |
| `sincronizaciones` | Resultado de cada sincronización + cursores (su id es la versión del almacén en memoria) |
| `consumo` | Lecturas y escrituras de la app por día de cuota |
| `config/stock` | Última foto del stock FBA por región |
| `fichas` | Ficha de cada ASIN por mercado (catálogo) y precio/Buy Box actuales |
| `escandallos` | Coste por piezas y proveedores de cada ASIN |
| `proveedores` | Contacto de cada proveedor (empresa, teléfono, correo, Alibaba), compartido entre productos |
| `transaccionesAmazon` | Movimientos de la Finances API resumidos por SKU (para recalcular comisiones y reembolsos) |
| `productos` | Foto principal y título de cada ASIN (Catalog Items API) |
| `tiposCambio` | Tipos de cambio del BCE por día |
| `config` | `marketplaces` (activos) y `sync` (bloqueo para no lanzar dos sincronizaciones a la vez) |

## Fuera de alcance (fases futuras)

Gastos fijos, Amazon Ads (PPC), alertas de stock, motivos de devolución, sincronización programada, exportar a Excel/CSV
e historial de costes por SKU.
