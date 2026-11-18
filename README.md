# Tino API

API de Tino: NestJS 12 + Supabase (PostgreSQL, Auth, RLS).

## Arranque

```bash
cp .env.example .env.local   # completa SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY
npm install
npm run start:dev            # http://localhost:4000
```

## Autenticación

El cliente (web o celular) inicia sesión con Supabase Auth y envía el token
en `Authorization: Bearer <access_token>`. La API lo verifica en cada
petición y consulta la base con ese mismo token, de modo que las políticas
RLS evalúan al usuario real.

## Endpoints

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/perfil` | Perfil del usuario autenticado. 401 sin token válido; 404 si no tiene perfil. |

## Pruebas

`npm test`. Las de aislamiento y perfil con usuarios reales necesitan
`SUPABASE_SECRET_KEY` en `.env.test.local` (solo Tino dev); sin ella se omiten
con aviso.
