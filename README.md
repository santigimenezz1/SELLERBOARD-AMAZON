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
3. La app necesita los roles que dan acceso a *Orders*, *Finance and Accounting* y *Sellers* (Selling Partner Insights).

No hace falta nada de AWS (IAM ni SigV4): basta con LWA.

### 3. `.env.local`

Copia `.env.example` como `.env.local` y rellena Firebase (cliente y admin) y `SPAPI_*`. **Nunca lo subas al repositorio** (está en `.gitignore`).

```bash
npm install
npm run dev
```

Si el antivirus inspecciona HTTPS (Avast, AVG…) y aparece `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, arranca con
`$env:NODE_OPTIONS="--use-system-ca"; npm run dev` (igual que en MakerLab).

## Cómo funciona la sincronización

Botón **Sincronizar ahora** → `POST /api/sync` (`src/lib/amazon/sincronizar.ts`):

1. **Sellers API** → marketplaces donde participas (se guardan en `config/marketplaces` y alimentan el filtro de país).
2. **Orders API v2026-01-01** (`searchOrders`) → pedidos **actualizados** desde la última sincronización. Se usa la fecha de
   actualización y no la de creación para recoger también cambios de estado (pendiente → enviado, cancelaciones) y el precio
   de pedidos que estaban pendientes. Cada línea (SKU) se guarda en `pedidos` con id `{amazonOrderId}_{orderItemId}`.
3. **Finances API v2024-06-19** (`listTransactions`) → movimientos financieros publicados desde la última sincronización
   (cargo de la venta con sus comisiones, reembolsos…), guardados en `transaccionesAmazon`. Leer el flujo de movimientos en
   vez de preguntar pedido a pedido cuesta muchas menos peticiones y además detecta reembolsos de pedidos antiguos.
4. Cada pedido tocado se **recalcula** a partir de todas sus transacciones guardadas: comisiones, reembolso y
   `beneficioNeto = ventaTotal − comisionesAmazon − reembolso − costeProducto`. Repetir una sincronización no duplica nada.

Cada etapa tiene su propio cursor (`cursorPedidos`, `cursorFinanzas` en `sincronizaciones`), que solo avanza si la etapa termina
bien; si falla, la siguiente sincronización la reintenta desde el mismo punto. La primera sincronización trae
`SYNC_DIAS_INICIALES` días (90 por defecto, máx. 180). Los reintentos ante límites de peticiones (HTTP 429) respetan la tasa
que devuelve Amazon en `x-amzn-RateLimit-Limit`.

Se usan las versiones nuevas de Orders y Finances: las antiguas (Orders v0 y Finances v0) están obsoletas y Amazon las
retira el 27/03/2027 y el 27/08/2027.

### Detalles de cálculo

- **Moneda:** todo se guarda en EUR. Los pedidos de marketplaces fuera del euro (Reino Unido, Suecia, Polonia…) se convierten con el
  tipo de referencia del BCE del día del pedido (frankfurter.dev, sin clave; se cachea en `tiposCambio`). Cada pedido guarda
  `moneda` y `tipoCambio`.
- **Pedidos sin liquidar:** Amazon publica las comisiones reales cuando cobra la venta (normalmente al enviar; puede tardar
  hasta 48 h). Hasta entonces el pedido cuenta con comisiones 0 y `liquidado: false`; el panel avisa de cuántos hay.
- **Cancelados:** se guardan con `estado: CANCELLED` y no cuentan en el panel.
- **IVA:** `ventaTotal` es lo que pagó el cliente, IVA incluido si Amazon lo incluye. La parte de impuesto se guarda aparte
  en `impuestos` pero **no se resta** del beneficio (pendiente de decidir).
- **Coste de producto:** al guardar un coste se aplica a los pedidos que se sincronicen después **y** a los pedidos de ese SKU
  que no tenían coste; los que ya tenían uno lo conservan.

## Colecciones de Firestore

| Colección | Contenido |
|---|---|
| `pedidos` | Una línea de pedido por documento (esquema en `src/lib/datos/tipos.ts`) |
| `costesProducto` | Coste unitario vigente por SKU |
| `sincronizaciones` | Resultado de cada sincronización + cursores |
| `transaccionesAmazon` | Movimientos de la Finances API resumidos por SKU (para recalcular comisiones y reembolsos) |
| `tiposCambio` | Tipos de cambio del BCE por día |
| `config` | `marketplaces` (activos) y `sync` (bloqueo para no lanzar dos sincronizaciones a la vez) |

## Fuera de alcance (fases futuras)

Gastos fijos, Amazon Ads (PPC), alertas de stock, motivos de devolución, sincronización programada, exportar a Excel/CSV
e historial de costes por SKU.
