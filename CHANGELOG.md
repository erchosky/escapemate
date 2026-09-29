# Changelog

## 1.3.0 - 2026-09-30

### Añadido

- Migración `20260930100000_compatibility_codes.sql`: `get_swipe_candidates` devuelve códigos traducibles (`compat.region.same:region=EU`) en lugar de frases en español. El cliente acepta ambos formatos, así que la app funciona antes y después de aplicarla. Resuelve el pendiente 8 de la auditoría.
- CI con GitHub Actions: lint, tipos, unitarios, i18n, checks de beta, `test:sql` contra PostgreSQL, build y E2E.

### Corregido

- Al eliminar la cuenta, la foto de perfil subida se quedaba en Storage (datos personales huérfanos). Ahora `deleteAccount` la borra antes de eliminar las filas; si el borrado de la cuenta falla, se quita la referencia a la foto ya borrada. Resuelve el pendiente 7 de la auditoría.
- Test E2E intermitente en móvil: un clic en «Publicar» antes de que React hidratara la página se perdía. El helper reintenta hasta que el formulario queda abierto.

### Actualizado

- Node.js 22 → **24 LTS** (`.nvmrc`, Netlify) y TypeScript 5.9 → **6.0**.
- Next.js 16.3.7, Sentry 11.1, framer-motion 13.4.6 y PostHog. `npm audit` sin vulnerabilidades.
- `AUDITORIA.md` pasa a `docs/`.

## 1.2.1 y anteriores

Ver [docs/AUDITORIA.md](docs/AUDITORIA.md).
