# EscapeMate

EscapeMate es un "Tinder" para jugadores de Escape from Tarkov: desliza perfiles compatibles, haz match y coordina por chat o Discord. Además tiene **Raid ahora**, para montar grupo en el momento, y **Ayuda con misiones**, para encontrar Sherpas o compañeros para una quest concreta.

Versión actual: **1.3**. [`CHANGELOG.md`](CHANGELOG.md) resume los cambios de cada versión y [`docs/AUDITORIA.md`](docs/AUDITORIA.md) detalla los fallos corregidos, lo añadido, lo retirado y lo que queda pendiente. `docs/ESCALABILIDAD.md` explica cómo está preparada para decenas de miles de usuarios simultáneos y cómo medirlo.

## Pruébalo en 1 minuto (sin Supabase)

```bash
npm ci
npm run demo
```

`npm run demo` compila la app y la sirve en modo producción: es la forma de verla a velocidad real. Para trabajar en el código usa `npm run dev`; sin `.env.local` entra también en modo demo, con recarga en caliente pero más lento, porque desarrollo compila bajo demanda y no minifica.

> **Rendimiento en local.** No guardes el proyecto en una carpeta sincronizada con iCloud Drive (por defecto, Escritorio y Documentos): iCloud sincroniza `node_modules` y la caché de Turbopack en `.next`, crea duplicados «archivo 2» que rompen builds y ralentiza la instalación. Mejor en una carpeta como `~/Developer`. Y ábrela en Chrome o Safari: el navegador integrado de algunas herramientas no reenvía el websocket de desarrollo y hace que cada navegación sea una recarga completa.

Abre `http://localhost:3000` y pulsa «Iniciar sesión con Discord»: en modo demo entras directamente como «Operador Demo». Todo funciona contra un backend en memoria, con un mundo propio por navegador:

- Varios jugadores ya te han dado like: si les das like, salta el «¡Match!» y se abre el chat, que responde.
- Si publicas en Raid ahora o en Misiones, un jugador demo se apunta enseguida para que puedas aceptarlo.
- Si te apuntas a una publicación, el autor demo te acepta al momento.
- Si eliminas la cuenta en Ajustes, vuelves a entrar como jugador nuevo y pasas por el alta en 3 pasos.

El modo demo no se puede activar en un build de producción (`NODE_ENV=production`).

## Funcionalidades

| Sección | Qué hace |
|---|---|
| `/onboarding` | Alta en 3 pasos (tú, cómo juegas, cuándo) con validación por paso y borrador recuperable; en edición, todo en una página. |
| `/swipe` | Tarjetas con compatibilidad calculada en SQL (idioma, región, horario, objetivos, mapas, estilo, experiencia real y modo PvP/PvE). Arrastrar o botones, atajos ← → ↑ Z, deshacer el último pase, diálogo de match con acceso al chat y precarga automática de más perfiles. |
| `/matches` | Fila de nuevos matches y lista de conversaciones con no leídos y buscador. El chat crece con el texto (Intro envía, Mayús+Intro salto de línea), agrupa mensajes, muestra horas, permite copiar el Discord y bloquear o reportar indicando el motivo. |
| `/raid-now` | Búsquedas de 90 minutos (una activa por jugador) con plazas. Los demás pulsan «Me apunto» con un mensaje; el autor acepta o rechaza, aceptar abre el chat y un grupo lleno deja de aceptar solicitudes. |
| `/quest-help` | Solicitudes de 24 h. El selector de misión usa tarkov.dev (o el catálogo local si la API cae), bloquea mapas incompatibles y rechaza lenguaje de RMT o pagos. Mismo flujo de solicitudes que Raid ahora. |
| `/settings` | Editar perfil, foto de perfil, idiomas, stats de tarkov.dev (sincronizadas o manuales) y eliminar la cuenta. |
| `/admin/reports` | Moderación de reportes para usuarios con rol `admin`. |

Todo está en español e inglés (`src/i18n/messages`). Es mobile-first, con barra inferior en móvil, e instalable como PWA.

## Stack

Next.js 16 (App Router, Server Actions, Turbopack) · React 19.3 · TypeScript 6 · Tailwind CSS 4 · Supabase (Auth con Discord, PostgreSQL con RLS, Realtime, Storage) · Netlify · Sentry y PostHog opcionales.

## Instalación con Supabase real

Requisitos: Node 24 LTS (`.nvmrc`; mínimo 22.12) y npm 10 o superior.

```bash
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

### Base de datos

- **Proyecto nuevo**: ejecuta `supabase/schema.sql` en el SQL editor.
- **Proyecto existente**: aplica en orden las migraciones de `supabase/migrations/` que te falten. Las de la 1.1 y la 1.2 son imprescindibles; la de la 1.3 es recomendable (la app funciona con y sin ella):

```text
supabase/migrations/20260925100000_v1_1_fixes_responses_game_modes.sql
supabase/migrations/20260926100000_v1_2_scale.sql
supabase/migrations/20260930100000_compatibility_codes.sql
```

La 1.1 corrige `check_rate_limit`, que fallaba en todas las llamadas y bloqueaba el onboarding, los swipes y el chat. También corrige el bloqueo de Raid Now tras una búsqueda caducada y añade PvP/PvE, las solicitudes a publicaciones y el borrado de cuenta. La 1.2 prepara la base de datos para mucha carga (swipe acotado, resumen de conversaciones, RLS optimizada, chat por Broadcast y plazas en Raid Now). La 1.3 hace que la compatibilidad devuelva códigos traducibles en lugar de frases en español.

### Auth y servicios

1. En Supabase Auth, activa Discord como provider.
2. En el Discord Developer Portal, pon como redirect `https://TU_PROYECTO.supabase.co/auth/v1/callback`.
3. En Supabase Auth → URL Configuration, añade `http://localhost:3000/auth/callback` y `https://TU_SITIO.netlify.app/auth/callback`.
4. Activa las **claves de firma JWT asimétricas** (Auth → Signing Keys) para que la sesión se verifique sin llamar al servidor de Auth, y en Realtime desactiva el acceso público: el chat usa canales privados autorizados por RLS. Comprueba que existe el bucket público `avatars` (lo crea `schema.sql`).
5. Opcional pero recomendado: activa la extensión `pg_cron` para la limpieza periódica (ver `docs/ESCALABILIDAD.md`).
6. Para dar acceso de admin:

```sql
insert into public.user_roles (user_id, role) values ('USER_UUID', 'admin') on conflict do nothing;
```

### Variables de entorno

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
OAUTH_ALLOWED_ORIGINS=http://localhost:3000
NEXT_PUBLIC_CONTACT_EMAIL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_DSN=
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=
```

`OAUTH_ALLOWED_ORIGINS` es solo de servidor. En producción, `NEXT_PUBLIC_SITE_URL` es el origen canónico obligatorio. Nunca pongas una service role ni tokens privados en variables `NEXT_PUBLIC_*`. `LOCAL_DEMO=true` solo lo usan `npm run dev:demo` y los E2E.

## Deploy en Netlify

Build command `npm run build`, publish `.next` (ya está en `netlify.toml` con `@netlify/plugin-nextjs` y Node 24). Configura las variables de entorno, añade la URL final en Supabase y aplica la migración antes de desplegar.

## Tests

```bash
npm run lint
npm run typecheck
npm test              # unitarios (node:test)
npm run i18n:check    # paridad ES/EN
npm run check:beta    # invariantes de seguridad y de producto sobre el código y el SQL
npm run test:e2e      # Playwright, escritorio y móvil, sobre el backend demo
npm run build
```

`npm run test:sql` aplica `supabase/schema.sql` a una base desechable de un PostgreSQL local (necesita `psql` y un superusuario en las variables `PG*`) y ejecuta `tests/sql/`. Comprueba rate limits, PvP/PvE, match y Discord, chat, Raid Now caducado, solicitudes, RLS de terceros y borrado de cuenta:

```bash
PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres npm run test:sql
```

La integración continua (`.github/workflows/ci.yml`) ejecuta lint, tipos, unitarios, i18n, checks de beta, `test:sql` contra un PostgreSQL de servicio, build y los E2E.

`npm run perf` mide con Chromium una instancia en marcha (por ejemplo `npm run demo`): peso y LCP de cada pantalla, tiempo de navegación entre pestañas y prefetch.

`npm run test:load` crea una comunidad de 50.000 jugadores en un PostgreSQL local y mide con `pgbench` las operaciones calientes con 64 conexiones simultáneas (≈ 6.000 transacciones por segundo en un portátil de 10 núcleos; ver `docs/ESCALABILIDAD.md`).

`npm run test:rls` prueba las políticas a través de la API real de Supabase (local o staging). Necesita `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` en tu entorno local; nunca en Netlify.

## Arquitectura

- `src/app`: rutas. `(app)/layout.tsx` monta el `AppShell` persistente con la navegación y los badges.
- `src/lib/actions`: Server Actions. Todas validan con Zod, aplican rate limit persistente y nunca devuelven errores internos al usuario.
- `src/lib/supabase/queries.ts`: lecturas del servidor. `requireUser` y `requireCompletedProfile` se memorizan por petición y verifican la sesión con `getClaims()` (`src/lib/supabase/session.ts`).
- `src/lib/demo`: backend en memoria del modo demo y de los E2E (`mode.ts`, `seed.ts`, `store.ts`).
- `src/proxy.ts` (el antiguo middleware en Next 16): refresca la sesión de Supabase o, en modo demo, asigna la cookie de sesión demo.
- `src/app/api/tarkov/tasks`: datos de misiones de tarkov.dev, cacheables en CDN.
- `src/lib/tarkov`: cliente de tarkov.dev (GraphQL y JSON público de jugadores) y el catálogo local de misiones (`npm run tarkov:sync` lo regenera).
- `supabase/schema.sql`: esquema completo para instalaciones limpias, equivalente a aplicar todas las migraciones.

### Base de datos

Tablas: `profiles`, `profile_contacts` (Discord, solo visible tras un match), `player_preferences`, `profile_tarkov_stats`, `swipes`, `matches` (con el resumen del último mensaje), `messages`, `match_reads`, `raid_now_posts`, `raid_now_responses`, `quest_help_posts`, `quest_help_responses`, `reports`, `blocks`, `user_roles`, `rate_limit_buckets`, `profile_tags` y `profile_reviews` (estas dos, preparadas para el futuro).

RPC principales:

- `get_swipe_candidates(p_limit)`: candidatos activos que comparten modo de juego, sin bloqueados ni matches previos, con puntuación, razones, avisos y stats públicas. Coste constante: puntúa como mucho 300 candidatos de una ventana de 4.000 jugadores activos.
- `create_swipe(p_target_id, p_decision)`: guarda like o pass y crea el match si el like es mutuo.
- `decide_post_response(p_kind, p_response_id, p_accept)`: el autor acepta o rechaza una solicitud. Aceptar crea el match y siembra el chat con el mensaje del jugador.
- `delete_my_account()`: borra el usuario y todo lo suyo en cascada. La foto de perfil subida a Storage la borra antes la acción `deleteAccount`.
- `cleanup_expired_content()`: cierra publicaciones caducadas y purga rate limits (con `pg_cron`, cada 10 minutos).
- `check_rate_limit`, `get_app_badges`, `get_public_tarkov_stats`, `get_latest_match_messages`, `close_raid_now_post`, `close_quest_help_post`, `touch_match_activity`, `is_admin`.

### Compatibilidad

Se calcula en SQL con datos guardados, sin llamadas externas. Pesos máximos: idioma 25 (sin idioma común la puntuación se limita a 55), región 15, horario 15 (sin horario común, límite de 70), objetivo 15, mapas 10, estilo 10 (15 para Sherpa + jugador nuevo) y experiencia real de tarkov.dev 10. Si dos jugadores no comparten modo PvP/PvE, no se emparejan.

## Límites conocidos

- Los E2E usan el backend demo: no prueban Discord OAuth ni la capa PostgREST o Realtime reales. `test:sql` cubre la lógica SQL, las políticas RLS y la autorización de Broadcast sobre PostgreSQL con stubs de Supabase.
- En Next 16 solo puede haber un `next dev` por proyecto: para los E2E, para antes cualquier `npm run dev` o `dev:demo`.
- La app depende de tarkov.dev para las misiones y las stats; si la API cae, se usan el catálogo local y las stats manuales.
- Sentry y PostHog quedan inactivos si no se configuran.
- El contacto legal muestra un texto neutro mientras `NEXT_PUBLIC_CONTACT_EMAIL` esté vacío.

## Archivar

```bash
npm run zip:clean -- "/ruta/EscapeMate_YYYY-MM-DD.zip" "EscapeMate_YYYY-MM-DD"
npm run check:artifact -- "/ruta/EscapeMate_YYYY-MM-DD.zip"
```
