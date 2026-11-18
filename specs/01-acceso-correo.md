# SPEC 01 — Acceso con correo y contraseña

> **Estado:** Implementado
> **Depende de:** —
> **Fecha:** 2026-11-14
> **Objetivo:** Que un usuario pueda crear cuenta, confirmar su correo, entrar y salir de Tino con correo y contraseña, sobre la interfaz completa de acceso del diseño.

## Alcance

**Entra:**

- Página `/login` fiel a `referencias/export-acceso/Acceso.dc.html` (paso `login`), en escritorio y móvil, modo claro y oscuro por tokens existentes.
- Botón «Continuar con Google» visible y deshabilitado, con `title="Próximamente"`.
- Enlace «¿La olvidaste?» visible, sin función (no es enlace navegable).
- Inicio de sesión con correo y contraseña.
- Página `/registro` con el mismo layout que `/login`: correo, contraseña, confirmar contraseña, botón «Crear cuenta», enlace «¿Ya tienes cuenta? Entrar».
- «Crear cuenta con correo» en `/login` enlaza a `/registro`.
- Confirmación de correo obligatoria. Tras registrarse se muestra «Revisa tu correo» en la misma página.
- Route handler `/auth/confirmar` que verifica el enlace del correo e inicia sesión.
- Cierre de sesión: botón mínimo «Salir» en `/`.
- Proxy: `/registro` pasa a ser pública; usuario autenticado en `/login` o `/registro` se redirige a `/`.
- Validación de credenciales en dominio, con pruebas unitarias.
- Botón de cambio de tema (claro/oscuro) fijo en la esquina superior derecha de todas las pantallas, en el layout raíz. La elección se recuerda en el navegador.

**Fuera de alcance (specs futuros):**

- Inicio de sesión con Google (OAuth y callback).
- Recuperación de contraseña («¿La olvidaste?»).
- Primer uso: moneda base, zona horaria, cuentas iniciales (pasos `moneda` y `cuentas` del diseño).
- Creación de perfil en base de datos. Este spec no añade tablas ni migraciones.
- Layout de la aplicación autenticada; `/` sigue siendo un marcador con el botón «Salir».
- Retorno a la ruta original tras entrar (`?siguiente=`).
- Reenvío del correo de confirmación.
- Guardar el tema en base de datos por usuario; modo «sistema» como tercera opción del botón.

## Modelo de datos

Este spec no introduce tablas ni migraciones. Usa `auth.users` de Supabase.

Tipos nuevos en `src/domain/autenticacion/credenciales.ts`:

```ts
type ErrorCredenciales =
  | "correo_invalido"
  | "contrasena_corta"          // < 8 caracteres
  | "contrasenas_distintas";    // solo registro

type ResultadoValidacion =
  | { ok: true; correo: string } // correo normalizado: trim + minúsculas
  | { ok: false; errores: ErrorCredenciales[] };
```

Estado que devuelven las server actions a `useActionState`:

```ts
type EstadoAcceso =
  | { tipo: "inicial" }
  | { tipo: "error"; mensaje: string; correo: string } // conserva el correo escrito
  | { tipo: "revisa_correo"; correo: string };          // solo registro
```

Mensajes al usuario (literales):

| Caso | Mensaje |
|---|---|
| Credenciales inválidas (`invalid_credentials`) | «Correo o contraseña incorrectos.» |
| Correo sin confirmar (`email_not_confirmed`) | «Confirma tu correo antes de entrar.» |
| Correo con formato inválido | «Escribe un correo válido.» |
| Contraseña < 8 | «La contraseña debe tener al menos 8 caracteres.» |
| Confirmación distinta | «Las contraseñas no coinciden.» |
| Cualquier otro fallo | «No pudimos conectar. Intenta de nuevo.» |
| Enlace de confirmación inválido o vencido | «El enlace de confirmación no es válido o venció.» (en `/login?error=confirmacion`) |

## Estructura de archivos

```
src/
  app/
    (acceso)/
      login/page.tsx
      registro/page.tsx
      acciones.ts            # server actions: entrar, registrar, salir
    auth/confirmar/route.ts  # verifyOtp(token_hash, type) → redirige a /
    page.tsx                 # + botón «Salir»
  components/boton-tema.tsx  # botón fijo de cambio de tema (cliente)
  components/acceso/         # columna, formulario, campo subrayado, separador «o con tu correo», botón Google
  domain/autenticacion/
    credenciales.ts
    credenciales.test.ts
  services/autenticacion.ts
  repositories/supabase/autenticacion.ts  # usa crearClienteServidor() de servidor.ts
  app/layout.tsx             # + script de tema y <BotonTema />
  proxy.ts                   # modificado
```

Dirección: `app/(acceso)/acciones.ts → services/autenticacion.ts → domain/autenticacion` y `→ repositories/supabase/autenticacion.ts`. Los componentes no importan Supabase.

## Plan de implementación

1. `src/domain/autenticacion/credenciales.ts` con `validarCredenciales(correo, contrasena)` y `validarRegistro(correo, contrasena, confirmacion)`. Pruebas en `credenciales.test.ts`: correo vacío, sin `@`, con espacios alrededor (se normaliza), contraseña de 7 y de 8 caracteres, confirmación distinta. `npm test` en verde.
2. `src/repositories/supabase/autenticacion.ts`: funciones `iniciarSesion`, `registrar` (con `emailRedirectTo` hacia `/auth/confirmar`), `verificarEnlace`, `cerrarSesion`. Solo obtienen el cliente con `crearClienteServidor()`. Devuelven el código de error de Supabase sin traducir.
3. `src/services/autenticacion.ts`: orquesta validación de dominio y repositorio; traduce códigos de error a la tabla de mensajes. Registro con correo ya existente devuelve `revisa_correo` igual que uno nuevo (no revela qué correos existen).
4. Componentes en `src/components/acceso/` a partir del diseño y los tokens de `globals.css` (`--fondo`, `--superficie`, `--texto`, `--secundario`, `--linea`, `--raya`, `--marca-texto`). Reutiliza `Boton` de `src/components/boton.tsx` donde encaje. Sin barra de estado móvil (es solo maqueta).
5. `src/app/(acceso)/acciones.ts` con `entrar`, `registrar`, `salir`. Validan forma de `FormData`, llaman al servicio, y en éxito `redirect("/")` (entrar) o `redirect("/login")` (salir).
6. `src/app/(acceso)/login/page.tsx`: formulario con `useActionState(entrar)`; botón «Entrar» deshabilitado y con texto «Entrando…» mientras está pendiente; mensaje inline bajo el formulario; lee `?error=confirmacion`.
7. `src/app/(acceso)/registro/page.tsx`: mismo layout; botón «Crear cuenta» / «Creando cuenta…»; en `revisa_correo` reemplaza el formulario por «Revisa tu correo» con el correo usado.
8. `src/app/auth/confirmar/route.ts`: lee `token_hash` y `type`, llama al servicio; éxito → `/`, fallo → `/login?error=confirmacion`.
9. `src/proxy.ts`: añade `/registro` a `RUTAS_PUBLICAS`; si hay sesión y la ruta es `/login` o `/registro`, redirige a `/` conservando cookies.
10. `src/app/page.tsx`: añade formulario con botón «Salir» que invoca `salir`.
11. Configuración de Supabase (manual, documentada en el README): «Confirm email» activo; plantilla «Confirm signup» con enlace `{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=email`; Site URL y Redirect URLs con `http://localhost:3000`.
12. Cambio de tema: `src/components/boton-tema.tsx` (cliente, `position: fixed`, arriba a la derecha, objetivo táctil 44 px, `aria-label="Cambiar tema"`; muestra sol en oscuro y luna en claro). Alterna `data-theme` en `<html>` y guarda `claro`/`oscuro` en `localStorage` con clave `tino-tema` (dentro de `try/catch`). En `src/app/layout.tsx`: script en línea en `<head>` que, antes de pintar, fija `data-theme` desde `localStorage` o, si no hay valor, desde `prefers-color-scheme`; `<html suppressHydrationWarning>`; `<BotonTema />` dentro de `<body>`.

## Criterios de aceptación

- [ ] `npm test`, `npm run lint` y `npx tsc --noEmit` pasan.
- [ ] `/login` sin sesión muestra: «TINO», «Tu libro de cuentas personal.», botón Google deshabilitado, separador «o con tu correo», campos Correo y Contraseña, «¿La olvidaste?», «Entrar», «¿Primera vez? Crear cuenta con correo» y la nota de privacidad.
- [ ] En 390 px de ancho la columna ocupa el ancho con 24 px de margen y no hay scroll horizontal.
- [ ] Con el sistema en modo oscuro, `/login` usa los tokens oscuros.
- [ ] Pulsar «Continuar con Google» no hace nada.
- [ ] «Crear cuenta con correo» lleva a `/registro`; «¿Ya tienes cuenta? Entrar» vuelve a `/login`.
- [ ] Registrar con contraseña de 7 caracteres muestra «La contraseña debe tener al menos 8 caracteres.» sin llamar a Supabase.
- [ ] Registrar con confirmación distinta muestra «Las contraseñas no coinciden.».
- [ ] Registro válido muestra «Revisa tu correo» y llega un correo con enlace a `/auth/confirmar`.
- [ ] Entrar antes de confirmar muestra «Confirma tu correo antes de entrar.».
- [ ] Abrir el enlace del correo inicia sesión y lleva a `/`.
- [ ] Un enlace alterado lleva a `/login` con «El enlace de confirmación no es válido o venció.».
- [ ] Entrar con contraseña errónea muestra «Correo o contraseña incorrectos.» y conserva el correo escrito.
- [ ] Mientras se envía, el botón está deshabilitado y dice «Entrando…».
- [ ] Entrar con credenciales correctas lleva a `/`.
- [ ] Con sesión, abrir `/login` o `/registro` redirige a `/`.
- [ ] «Salir» en `/` cierra sesión y lleva a `/login`; volver a `/` redirige a `/login`.
- [ ] Ningún archivo en `src/components/` ni `src/app/` importa `@supabase/*` ni `repositories/` (salvo `proxy.ts`).
- [ ] La prueba de aislamiento entre usuarios (REGLAS §4) sigue intacta.
- [ ] El botón de tema aparece fijo arriba a la derecha en `/login`, `/registro`, `/` y `/estilos`, también al hacer scroll y en 390 px sin solaparse con el contenido.
- [ ] Al pulsarlo, la pantalla cambia entre tokens claros y oscuros; al recargar se conserva la elección sin parpadeo.
- [ ] Sin elección guardada, el tema inicial sigue la preferencia del sistema.
- [ ] Con `localStorage` bloqueado el botón sigue alternando el tema de la sesión sin errores.

## Decisiones

- **Sí:** solo correo y contraseña ahora; la interfaz se construye completa para no rehacerla al añadir Google.
- **Sí:** botón Google deshabilitado con «Próximamente». **No:** aviso al pulsar (ruido) ni implementarlo ya (amplía alcance).
- **Sí:** registro con correo en este spec. **No:** recuperación de contraseña; va en spec propio.
- **Sí:** `/registro` como página propia con el mismo layout. **No:** alternar modo en `/login` (`?modo=`); mezcla dos formularios en una página.
- **Sí:** confirmación de correo obligatoria con `verifyOtp` por `token_hash`. **No:** desactivarla; permitiría cuentas con correos ajenos.
- **Sí:** mínimo 8 caracteres validado en dominio, además de Supabase. **No:** reglas de composición (letras + números).
- **Sí:** mensaje genérico de credenciales; distinguir solo «correo sin confirmar». **No:** decir si el correo existe (enumeración de usuarios).
- **Sí:** destino tras entrar es `/`. **No:** `?siguiente=` ni ir al primer uso; ambos son otros specs.
- **Sí:** «Salir» mínimo en `/` para probar el ciclo completo.
- **Sí:** tema en `localStorage` más script en línea antes del primer pintado. **No:** cookie (obligaría a leerla en el layout y volvería dinámicas todas las rutas) ni base de datos (no hay perfil todavía).
- **Sí:** botón alterna solo claro/oscuro; el valor inicial sale del sistema. **No:** tercera opción «sistema»; queda para un spec futuro.
- **Sí:** el proxy redirige a `/` a usuarios autenticados en rutas de acceso.
- **Sí:** server actions + `useActionState` para estado pendiente y errores. **No:** cliente de navegador para iniciar sesión; mantiene la regla de que los componentes no tocan Supabase.
- **Sí:** estructura `app/(acceso) → services/autenticacion → domain/autenticacion + repositories/supabase/autenticacion`, aprobada por el autor.
- **No:** tabla de perfil. RN-15 y el primer uso la necesitan, pero su migración la escribe el autor en otro spec.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Plantilla de correo de Supabase sin `token_hash` | Paso 11 documenta la plantilla exacta; criterio de aceptación verifica el enlace. |
| Límite de correos del SMTP por defecto de Supabase (pocos por hora) | Aceptado en desarrollo; SMTP propio queda fuera de este spec. |
| Supabase devuelve éxito falso al registrar un correo existente | Se trata igual que un registro nuevo («Revisa tu correo»); es el comportamiento deseado. |
| `getClaims()` en el proxy añade latencia a cada petición | Ya existe hoy; este spec no añade llamadas extra. |

## Lo que **no** entra en este spec

- Google OAuth.
- Recuperar contraseña.
- Primer uso (moneda, zona horaria, cuentas).
- Perfil en base de datos y migraciones.
- Reenvío del correo de confirmación.
- Retorno a la ruta original tras entrar.

Cada uno, si llega, va en su propio spec.
