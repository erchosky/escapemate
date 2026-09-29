# Escalabilidad — objetivo: 50.000 usuarios simultáneos

Este documento resume qué se cambió en la v1.2 para que EscapeMate aguante mucha carga, cómo se ha medido y qué hay que configurar en Supabase y Netlify para llegar a ese volumen.

## Dónde estaba el límite

Con una comunidad sintética de 50.000 perfiles, 1M de swipes, 25.000 matches y 100.000 mensajes (ver `tests/load/seed.sql`), las consultas calientes medían así:

| Operación | v1.1 | v1.2 |
|---|---|---|
| `get_swipe_candidates` (una llamada, en frío) | 375 ms | 7 ms |
| Lista de Raid Now | 3 ms | 0,4 ms |
| Badges de navegación | 2,6 ms | 2 ms |

El swipe puntuaba **a todos los perfiles** en cada llamada, así que su coste crecía de forma lineal con el número de jugadores: a 500k perfiles serían unos 4 s. En la v1.2 el coste es constante.

## Prueba de carga concurrente

`npm run test:load` crea esa comunidad en un PostgreSQL local y lanza `pgbench` con 64 conexiones simultáneas y la mezcla real de operaciones: 50 % badges (se calculan en cada navegación), 25 % mensajes de chat, 15 % listas de Raid Now y 10 % cargas de swipe. Resultados en un portátil de 10 núcleos:

| | v1.1 | v1.2 |
|---|---|---|
| Transacciones por segundo | 153 | **≈ 6.000** |
| Latencia media del swipe bajo carga | 4.144 ms | 85 ms |
| Transacciones fallidas | — | 0 |

### Cuánto es eso en usuarios

Estimación conservadora: un usuario conectado genera de media una operación pesada de base de datos cada 10 segundos (navegar, cargar tarjetas cada ~20 swipes gracias a la precarga, enviar mensajes). Con 50.000 usuarios simultáneos salen ~5.000 operaciones por segundo, del orden de lo que un portátil de 10 núcleos ya sostiene en la prueba. En producción:

- **Base de datos**: una instancia dedicada de Supabase con 16 núcleos o más (Compute 4XL o superior) deja margen para PostgREST, Auth, Realtime y picos. Empieza más pequeño y escala viendo la CPU en el dashboard.
- Esto es una estimación basada en la prueba sobre PostgreSQL. Antes de un lanzamiento grande, repite `npm run test:load` contra una copia de staging del tamaño real y haz una prueba HTTP (por ejemplo con k6) contra el despliegue.

## Qué cambió

### Base de datos (migración `20260926100000_v1_2_scale.sql`)

- **Swipe acotado.** Se leen los 4.000 jugadores activos más recientes directamente del índice covering `profiles_active_pool_idx` (index-only scan, sin tocar la tabla). Se filtran por modo, región alcanzable, idioma común y swipes previos, y solo se puntúa un grupo de hasta 300. Como efecto secundario, prioriza a quien está conectado ahora y excluye a quien lleva más de 60 días inactivo.
- **Stats en la misma llamada.** El swipe devuelve las stats públicas de tarkov.dev, así que se ahorra un segundo viaje a la base de datos.
- **Resumen de conversaciones desnormalizado.** Un trigger mantiene en `matches` el último mensaje (hora, texto y remitente) y marca el chat como leído para quien escribe. Los badges y la lista de matches ya no recorren mensajes; enviar un mensaje es un único `INSERT` más el rate limit.
- **RLS optimizada.** Las 41 políticas usan `(select auth.uid())`, que Postgres evalúa una vez por consulta en lugar de una vez por fila (guía de rendimiento de RLS de Supabase).
- **Chat por Realtime Broadcast.** Un trigger publica cada mensaje en el canal privado `match:<id>` con `realtime.broadcast_changes`, y la autorización se comprueba una sola vez al unirse al canal (política sobre `realtime.messages`). Postgres Changes, en cambio, decodifica cada fila y comprueba RLS por cada suscriptor y cada evento. `messages` y `matches` salen de la publicación `supabase_realtime`.
- **Rate limit más ligero.** `rate_limit_buckets` pasa a `UNLOGGED` (no escribe WAL) y la limpieza de buckets viejos se hace en ~1 % de las llamadas en lugar de en todas.
- **Limpieza programada.** `cleanup_expired_content()` cierra publicaciones caducadas y purga buckets. Se programa cada 10 minutos si `pg_cron` está activo.
- **Índices.** Se añaden índices parciales para las publicaciones abiertas, el índice inverso de `blocks`, índices de respuestas por jugador y de reportes por estado, y se retiran índices que no se usaban.

### Aplicación

- **Sesión sin viaje de red.** El proxy, las páginas y las acciones verifican el JWT con `auth.getClaims()` en local, en lugar de llamar al servidor de Auth en cada petición con `getUser()`.
- **Precarga del swipe.** Cuando quedan 3 tarjetas se pide el siguiente lote, así que el mazo no se queda vacío y cada llamada aprovecha 20 tarjetas.
- **Datos de misiones cacheables.** `/api/tarkov/tasks?locale=` se sirve con `Cache-Control` público (CDN) en lugar de incrustarse en cada HTML de Quest Help.
- **Chat resiliente.** Al reconectar tras un corte se recuperan los últimos mensajes.
- **Consultas memorizadas por petición.** `requireUser`, `requireCompletedProfile` y los badges se ejecutan una sola vez por petición aunque los usen la cabecera y la página.

## Configuración necesaria en producción

### Supabase

1. Aplica la migración v1.2.
2. **Claves de firma JWT asimétricas** (Auth → Signing Keys). Sin ellas, `getClaims()` recurre a `getUser()` y vuelve el viaje de red por petición.
3. **Realtime**: en los ajustes de Realtime, desactiva el acceso público ("Allow public access") para que solo funcionen los canales privados autorizados por RLS. Revisa el límite de conexiones concurrentes de tu plan: el chat solo abre una conexión mientras hay una conversación abierta, pero con decenas de miles de usuarios chateando necesitarás cuotas de Team o Enterprise.
4. **Extensión `pg_cron`** (Database → Extensions) y vuelve a ejecutar el bloque de `cron.schedule` de la migración, o `select cron.schedule('escapemate-cleanup', '*/10 * * * *', 'select public.cleanup_expired_content()');`.
5. **Tamaño de la instancia** según la carga (ver arriba) y, si hay muchas lecturas, réplicas de lectura.

### Netlify

- Las funciones escalan solas. Revisa los límites de concurrencia y ancho de banda de tu plan.
- Las respuestas de `/api/tarkov/tasks` y los recursos estáticos se sirven desde la CDN.

## Cómo repetir las mediciones

```bash
PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres npm run test:load
LOAD_CLIENTS=128 LOAD_SECONDS=60 PGHOST=… npm run test:load
```
