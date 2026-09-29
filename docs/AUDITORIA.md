# Auditoría — EscapeMate (versiones 1.1 y 1.2)

Fecha: 25 de septiembre de 2026
Punto de partida: `Tinder_Tarkov_ARCHIVO_LIMPIO_2026-07-22.zip` (beta cerrada del 22 de julio).

Este documento sustituye a los informes anteriores (`ARCHIVE_REPORT.md`, `AUDIT_FULL_45_FINDINGS.md`, `FINAL_HARDENING_REPORT.md`, `docs/I18N_AUDIT.md`). Describían estados ya superados y se han retirado; siguen en el historial de Git.

## Resumen

El proyecto aparentaba estar listo para beta (lint, tipos y 18 E2E en verde), pero esos E2E solo comprobaban que las páginas pintaban con datos fijos. Al ejecutar el SQL contra un PostgreSQL real y recorrer los flujos aparecieron fallos que habrían impedido usar la aplicación en producción. Todos los fallos críticos y altos están corregidos y cubiertos por tests.

## Fallos encontrados

| # | Severidad | Fallo | Efecto real | Estado |
|---|---|---|---|---|
| 1 | Crítico | `check_rate_limit` fallaba en todas las llamadas: `reset_at` era ambiguo entre la columna y la columna de salida de la función. | En producción el limitador cierra en fallo: nadie podía completar el onboarding, hacer swipe, chatear, publicar ni reportar. Las políticas RLS que lo llaman también fallaban. | Corregido (migración 1.1) + test SQL |
| 2 | Crítico | `middleware.ts` estaba en la raíz pero el proyecto usa `src/`, así que Next.js lo ignoraba (manifest de middleware vacío). | La sesión de Supabase nunca se refrescaba: los usuarios perdían la sesión al caducar el token. | Movido a `src/middleware.ts` + comprobación en `check:beta` |
| 3 | Alto | Raid Now: una búsqueda que caducaba sin cerrarse seguía ocupando el índice único «una activa por usuario», y el cierre automático no tenía permiso de `UPDATE`. | Tras la primera búsqueda caducada, el usuario no podía volver a publicar nunca. | Trigger que cierra las caducadas antes de insertar + test SQL |
| 4 | Alto | El callback de OAuth hacía `upsert` del perfil y del contacto en cada login. | Cada inicio de sesión machacaba el nick y el Discord elegidos en el onboarding. | Solo se crean en el primer login; el avatar de Discord se refresca si no se subió uno propio |
| 5 | Alto | Raid Now y Quest Help no tenían forma de responder ni de contactar al autor (la tabla `quest_help_responses` existía sin UI). | Las dos secciones eran tablones de solo lectura sin salida. | Solicitudes «Me apunto / Ofrecer ayuda», aceptar o rechazar, y aceptar abre match + chat |
| 6 | Alto | El chat solo mostraba mensajes que llegaban por Realtime. | Si Realtime tardaba o no estaba configurado, tu propio mensaje no aparecía. | La acción devuelve el mensaje insertado y se pinta al instante |
| 7 | Medio | «Cargar mensajes anteriores» validaba el cursor sin aceptar el offset `+00:00` que devuelve Postgres. | La paginación del chat fallaba siempre con datos reales. | Corregido |
| 8 | Medio | En móvil, el `backdrop-blur` de la cabecera hacía que la barra inferior `fixed` se pintara arriba, tapando el logo, el idioma y el cierre de sesión. | Navegación móvil rota. | Barras de escritorio y móvil separadas + test E2E |
| 9 | Medio | El onboarding no limitaba en cliente cuántos mapas o estilos se marcaban (el servidor rechaza más de 5 y 4). | Error genérico sin explicación al guardar. | Límites visibles (x/5), casillas bloqueadas y aviso por sección vacía |
| 10 | Medio | Al arrastrar una tarjeta de swipe también se abría el perfil (se usaba `onClick`). | Se abría el modal en cada swipe por arrastre. | `onTap`, que framer-motion cancela si hubo arrastre |
| 11 | Medio | 3 textos de compatibilidad del SQL no tenían traducción (`Objetivo compatible: …` y dos avisos). | Se veía «Factor de compatibilidad» genérico. | Mapeados; un test recorre todos los textos del SQL |
| 12 | Medio | Reportar no daba respuesta ni pedía motivo, y bloquear desde el swipe te mandaba a `/matches`. | Moderación confusa. | Motivo y detalle, confirmación de bloqueo y la tarjeta desaparece sin salir del swipe |
| 13 | Bajo | Quest Help pedía un «horario» que nunca se guardaba. | Campo engañoso. | Eliminado |
| 14 | Bajo | El badge «matches nuevos» contaba cualquier match de los últimos 7 días. | El número no bajaba al abrir el chat. | Solo cuenta matches aún no abiertos |
| 15 | Bajo | Los errores de swipe y admin eran textos en español fijos, y admin mostraba cualquier texto recibido en `?error=`. | Sin i18n; permitía mostrar texto arbitrario desde la URL. | Códigos traducidos |
| 16 | Bajo | El modal de perfil recuperaba el foco en cada render del padre. | El foco saltaba al botón de cerrar mientras escribías un reporte. | Efecto ligado solo al perfil |
| 17 | Bajo | El modo demo no funcionaba: cualquier acción intentaba hablar con un Supabase inexistente y te mandaba al login. | No se podía probar la app sin configurar Supabase. | Backend demo en memoria por sesión |

## Contenido añadido

- **Modo de juego PvP / PvE** en perfil, Raid Now y Quest Help. El swipe solo empareja jugadores que comparten modo (en Tarkov son economías separadas) y marca «Ambos jugáis PvE».
- **Solicitudes a publicaciones**: el autor ve quién se apunta, con nivel y mensaje; aceptar crea el match, desbloquea Discord y abre el chat con la nota del jugador.
- **Swipe**: diálogo de «¡Match!» con acceso directo al chat, deshacer el último pase, atajos de teclado (← → ↑ Z), tarjeta vacía con «Buscar de nuevo», indicador de actividad («Activo hace 5 min») y medidor de compatibilidad por colores.
- **Chat**: horas, separadores de día, copiar Discord, abrir perfil de Discord y sugerencias para el primer mensaje.
- **Matches**: actividad relativa, marcas de «Nuevo» y «Match nuevo».
- **Ajustes**: editar el perfil completo, subir foto de perfil (Supabase Storage; ya existía el código sin usar) y **eliminar la cuenta** (RPC `delete_my_account`, borra todo en cascada).
- **Admin** traducido, con motivos de reporte legibles.
- **Quest Help sin tarkov.dev**: si la API cae (lo estaba durante esta auditoría), el selector usa el catálogo local de 510 misiones con comerciante y mapa.
- `last_active_at` se actualiza como mucho cada 15 minutos para que «activo hace…» y el orden del swipe signifiquen algo.

## Contenido retirado

- Los 20 perfiles falsos que se mezclaban en el swipe real (`NEXT_PUBLIC_DEMO_MODE`) y generaban «matches de demo» imposibles. El demo completo vive ahora en `npm run dev:demo`.
- Los fixtures E2E sueltos (`src/lib/e2e-fixtures.ts`, `demo-profiles.ts`, `demo-mode.ts`), sustituidos por `src/lib/demo/`.
- La foto de stock usada como avatar por defecto: los jugadores sin avatar muestran sus iniciales con un color estable. La imagen de la portada pasa de 1,7 MB (PNG) a 228 KB (JPEG).
- Dicebear de la CSP y de `next.config.ts` (ya no se usa).
- Informes históricos desactualizados (ver arriba), el campo de horario de Quest Help y los registros de onboarding que no hacían nada.
- `/` del precache del service worker (se descargaba y nunca se servía). El cacheo de imágenes pasa a *stale-while-revalidate* y ya no guarda respuestas de error.

## Cómo se ha verificado

| Comprobación | Resultado |
|---|---|
| `npm run lint` | OK |
| `npm run typecheck` | OK |
| `npm test` | 45/45 (8 nuevos: textos de compatibilidad del SQL, fechas relativas, alias de mapas del catálogo y la lógica del backend demo) |
| `npm run test:sql` | 25 comprobaciones sobre PostgreSQL 18 con stubs de Supabase: rate limit, PvP/PvE, match y Discord, chat, Raid Now caducado, solicitudes, RLS de terceros y borrado de cuenta |
| `npm run test:e2e` | 33/33 en Chromium escritorio y móvil, con flujos completos: like → match → chat con respuesta, deshacer, bloquear, reportar, publicar → aceptar → chat, apuntarse, filtro PvE, Quest Help con bloqueo de mapa y RMT, edición de perfil y barra móvil |
| `npm run check:beta` | OK, con nuevas invariantes (rate limit cualificado, middleware en `src/`, trigger de Raid Now, callback sin upsert…) |
| `npm run i18n:check` | OK |
| `npm run build` | OK. Con `LOCAL_DEMO=true` y `next start`, `/swipe` redirige a `/login` y no aparece ningún dato demo. |
| Equivalencia de esquema | `pg_dump` de `schema.sql` limpio frente a esquema anterior + migración 1.1: idénticos salvo el orden de columnas |

## Versión 1.2 — actualización, escalabilidad y UX (25 de septiembre de 2026)

### Dependencias

- Next.js 15.5 → **16.3** (Turbopack por defecto, `middleware.ts` → `proxy.ts` en runtime Node, ESLint flat config), React 19.3, Sentry 11, Supabase JS 2.117, Tailwind 4.3, Playwright 1.63, Zod 4.6, framer-motion 13 y el resto a su última versión. `npm audit`: 0 vulnerabilidades.
- Se quedan a propósito en **ESLint 9** (los plugins de React, a11y e import que usa `eslint-config-next` aún no soportan ESLint 10) y en **TypeScript 5.9** (TypeScript 7 es el compilador nativo y ya no incluye la API de JS que usan Next y los tests).
- Se eliminan los `overrides` de `sharp` y `postcss`, que ahora forzaban versiones más antiguas que las que pide Next 16.
- **Fallo encontrado:** `sentry.client.config.ts` nunca se cargaba, así que Sentry no capturaba errores en el navegador. Pasa a `src/instrumentation-client.ts`, y los errores de servidor se envían con `onRequestError`.
- React 19 marca 4 `setState` síncronos dentro de efectos (renders en cascada). Se corrigen: el selector de idioma y el toast derivan su estado durante el render, el chat hace el scroll inicial sin tocar estado y el borrador del onboarding se ofrece con un botón «Recuperar».

### Escalabilidad

Detalle y mediciones en `docs/ESCALABILIDAD.md`. En resumen: el swipe pasa de 375 ms a 7 ms y su coste ya no crece con el número de jugadores; con 64 conexiones simultáneas la base de datos pasa de 153 a ≈ 6.000 transacciones por segundo sin fallos; la sesión se verifica sin llamar al servidor de Auth; y el chat usa Realtime Broadcast.

### UX y UI

- **Portada** con vista previa de tarjeta, «Cómo funciona», funcionalidades, nota de seguridad y llamada final.
- **Alta en 3 pasos** para jugadores nuevos, con progreso y validación por paso. Los botones esperan a que la página esté hidratada, así que un toque temprano en una conexión lenta ya no se pierde.
- **Páginas de error y 404** propias: la de sección mantiene la navegación y todas reportan a Sentry.
- **Matches al estilo Tinder**: fila de nuevos matches, conversaciones compactas con punto de no leído y buscador a partir de 7 matches.
- **Chat**: caja de texto que crece, Intro envía y Mayús+Intro hace salto de línea, y los mensajes seguidos se agrupan.
- **Raid Now con plazas** («Plazas 1/3», «Grupo completo»); un grupo lleno deja de aceptar solicitudes, también en RLS.
- **Swipe** con precarga automática del siguiente lote.
- **Cabecera** con tu avatar enlazado a Ajustes, y atajos PWA (Deslizar, Raid ahora, Matches).
- **Demo**: eliminar la cuenta te devuelve como jugador nuevo, para poder probar el alta. Además, el demo ya no deja entrar a secciones sin el perfil completo, igual que la app real.

### Verificación 1.2

| Comprobación | Resultado |
|---|---|
| Lint, tipos, `i18n:check`, `check:beta` | OK (nuevas invariantes: swipe acotado, RLS con `(select auth.uid())`, Broadcast, `getClaims`, rate limit `UNLOGGED`) |
| `npm test` | 48/48 |
| `npm run test:sql` | 2 ficheros, 41 comprobaciones (16 nuevas: stats en el swipe, inactivos excluidos, resumen de mensajes, no leídos, Broadcast solo para participantes, grupos llenos y limpieza) |
| `npm run test:e2e` | 41/41 en escritorio y móvil (portada, 404, alta en 3 pasos, fila de nuevos matches, Intro en el chat y plazas) |
| `npm run test:load` | ≈ 6.000 transacciones/s, 0 fallidas |
| `npm run build` | OK con Next 16 y Turbopack |
| Equivalencia de esquema | `schema.sql` limpio = v1.1 + migración 1.2 (solo difiere el orden de columnas) |

## Auditoría de rendimiento en local (25 de septiembre de 2026)

Motivo: «va lenta en localhost». Todo se midió con Chromium real (Playwright), no con estimaciones.

### Causas encontradas

| # | Causa | Impacto | Estado |
|---|---|---|---|
| 1 | El proyecto vive en `~/Documents`, que **iCloud Drive** sincroniza: había 239 duplicados «archivo 2» en `node_modules` y 25 en `.next`, e iCloud intenta subir más de 1 GB de dependencias y caché de Turbopack. `npm ci` tarda 7,9 s, frente a 4,2 s fuera de iCloud. | Ralentiza la instalación y puede corromper builds y caché. | Duplicados eliminados reinstalando. **Recomendado:** mover el proyecto fuera de iCloud. |
| 2 | En desarrollo todo se compila bajo demanda y sin minificar: 8,1 MB de JavaScript en `/swipe` y cada pantalla compila la primera vez que se abre (0,2–1,3 s). | Es la lentitud normal de `next dev`. | Nuevo `npm run demo`: la app a velocidad de producción en local. |
| 3 | El navegador integrado de la herramienta no reenvía el websocket de recarga en caliente, así que cada clic en la navegación era una **recarga completa**. En Chrome la navegación es del lado del cliente (60–130 ms en desarrollo, ~50 ms en producción). | Muy lento si se usa ese navegador. | Documentado: usar Chrome o Safari. |
| 4 | Los enlaces forzaban `prefetch`: abrir `/swipe` renderizaba en el servidor 11 páginas completas más (cada una con autenticación y consultas). | Hasta ~6× la carga por visita y competía con la navegación. | Quitado. |
| 5 | La cabecera (avatar y contadores) consultaba la base de datos en el layout, que se renderiza en cada navegación y en cada prefetch. | 1 comprobación de perfil + RPC de badges por enlace precargado. | Pasa a `/api/me/shell`, pedido desde el cliente como mucho cada 20 s. Un prefetch cuesta ahora 0 consultas (medido con instrumentación). |
| 6 | PostHog (≈ 295 KB) y Sentry (≈ 250 KB) se descargaban siempre aunque no hubiera claves, y el cliente de Supabase (≈ 260 KB) iba en el chat aunque no se usara. | La mitad del JavaScript de cada página. | Solo se cargan si hay clave o cuando el chat se conecta. JS por página: portada 1.211 → 673 KB, `/swipe` 1.427 → 804 KB, chat 1.699 → 793 KB. |
| 7 | La actualización de `last_active_at` se esperaba antes de responder. | Un viaje de red más en la primera visita de cada 15 minutos (con Supabase real). | Se hace con `after()`, después de enviar la página. |
| 8 | Si tarkov.dev se colgaba, cada petición que lo usa esperaba hasta 8 s. | Publicar en Misiones podía tardar 8 s. | Tiempo de espera de 4 s y, tras un fallo, se deja de llamar durante 60 s. |
| 9 | Sin `.env.local`, `npm run dev` fallaba en todas las páginas por falta de las variables de Supabase. | Parecía que la app «no cargaba». | En desarrollo, sin Supabase configurado, entra en modo demo. |

### Resultado (build de producción, `npm run perf`)

| Pantalla | JS | LCP |
|---|---|---|
| Portada | 673 KB | 48 ms |
| Swipe | 804 KB | 116 ms |
| Matches | 629 KB | 28 ms |
| Raid Now | 645 KB | 80 ms |
| Misiones | 651 KB | 92 ms |

Navegación entre pestañas: 44–52 ms, siempre del lado del cliente. Respuestas del servidor: 3–8 ms.

### Nota sobre Next 16

Next 16 conserva ocultas las páginas visitadas (`<Activity>`) para que volver atrás sea instantáneo. El chat fusiona ahora los mensajes frescos al volver a una conversación, y los E2E solo buscan texto visible.

## Pendiente (requiere tus credenciales o decisiones)

1. **Aplicar las migraciones** `20260925100000_v1_1_fixes_responses_game_modes.sql` y `20260926100000_v1_2_scale.sql` en tu proyecto Supabase, en ese orden. Sin ellas la app nueva falla (usa `game_modes`, las tablas de solicitudes, el resumen de matches y el Broadcast). Si tu proyecto ya tenía el `check_rate_limit` roto, la 1.1 lo arregla.
2. En Supabase: activar las claves de firma JWT asimétricas, desactivar el acceso público de Realtime (solo canales privados) y activar `pg_cron`. Detalles en `docs/ESCALABILIDAD.md`.
3. Ejecutar `npm run test:rls` contra un Supabase local o de staging (necesita la service role). `test:sql` cubre la lógica SQL, pero no la capa PostgREST ni Realtime reales.
4. Probar Discord OAuth de punta a punta en el dominio final.
5. Rotar la publishable key que el informe anterior encontró en el historial de Git original.
6. Rellenar `NEXT_PUBLIC_CONTACT_EMAIL` antes de abrir la beta.
7. ~~Al borrar una cuenta, el avatar subido a Storage no se elimina.~~ Resuelto en la 1.3: la acción `deleteAccount` lo borra antes de llamar a la RPC.
8. ~~El SQL devuelve las razones de compatibilidad como frases en español.~~ Resuelto en la 1.3 (`20260930100000_compatibility_codes.sql`): la RPC devuelve códigos y el cliente sigue aceptando las frases antiguas.
9. Antes de un lanzamiento masivo, repetir `npm run test:load` contra una copia de staging del tamaño real y hacer una prueba HTTP contra el despliegue. Los 50.000 usuarios simultáneos son una estimación basada en la prueba de PostgreSQL (ver `docs/ESCALABILIDAD.md`), no una medición en producción.
10. Mover el proyecto fuera de iCloud Drive (por ejemplo a `~/Developer/EscapeMate`) y trabajar desde ahí.
