# SPEC 12 — Avisos

> **Estado:** Implementado
> **Depende de:** SPEC 02, SPEC 07, SPEC 08, SPEC 10, SPEC 11
> **Fecha:** 2026-11-22
> **Objetivo:** Que la API derive al leer los avisos de recurrentes por confirmar, cobros, deudas y precios manuales sin actualizar, según la antelación que elige el usuario por tipo, y guarde solo qué avisos marcó como leídos y esa antelación.

## Por qué existe este spec

REGLAS §7 se enmendó en los dos repos para que entren los avisos, solo dentro de la app. La tarjeta con ciclo sigue fuera, así que sus dos tipos de aviso también.

Fija tres patrones:

- **Los avisos se derivan, no se guardan.** Como las ocurrencias de SPEC 07, se calculan en `src/domain/aviso/` desde las fuentes vivas: plantillas y cierres, préstamos y sus movimientos, activos manuales y sus precios. No hay tareas programadas, ni push, ni escrituras en un GET, ni `service_role` (REGLAS §4). El detalle de un aviso siempre refleja el estado actual de su fuente (RN-01).
- **Solo se guarda lo que decide el usuario.** Son dos cosas: la marca de leído o no leído de cada aviso, por su clave derivada (`avisos_leidos`), y la antelación por tipo (`avisos_config`). Sin marca, un aviso está leído si su fuente está resuelta.
- **La API manda campos, no frases.** Cada aviso es una unión discriminada por `tipo`. El cliente arma el título y el detalle, largo y corto, como ya arma los textos relativos (SPEC 07 y SPEC 08).

Cubre el inventario `specs/necesidades/avisos.md` (ver tabla de cobertura).

## Alcance

**Entra:**

- Migración con `avisos_leidos` y `avisos_config`, con RLS.
- `GET /avisos`: lista de los últimos 60 días, `noLeidos` y configuración.
- `GET /avisos/conteo`: solo `noLeidos`, para el menú.
- `PATCH /avisos/:clave`, `POST /avisos/leer-todos` y `PATCH /avisos/config/:tipo`.
- Cuatro tipos de aviso: `recurrente`, `cobro`, `deuda` y `precio_manual`.
- `fechaLocal` gana su inversa, `instanteLocal(fecha, hora, zona)`.
- `recurrentes.repository.ts` lee también `creado_en` de los cierres.
- Dominio puro en `src/domain/aviso/`, con pruebas unitarias.
- Prueba de aislamiento ampliada y e2e `test/avisos.e2e-spec.ts`.
- `docs/api/avisos.md` y su fila en `README.md`.
- Ya hecho antes del spec: REGLAS §7 enmendado en `tino-api` y `../Tino-web`.

**Fuera de alcance (specs futuros):**

- Avisos de pago y de corte de la tarjeta (N-41, N-42, N-43): REGLAS §7.
- Metas (N-04): no figura en REGLAS.
- Push, correo o cualquier entrega fuera de la app. Exigiría una tarea programada fuera del ciclo de petición y una credencial de mantenimiento (REGLAS §4).
- Hora de aviso editable. Las 08:00 son fijas.
- Limpieza de marcas viejas de `avisos_leidos` (ver riesgos).
- Historial de cambios de marcas y de configuración: no son datos financieros (RN-13).
- Avisos de activos de cuentas de inversión archivadas.

## Modelo de datos

Decidido por el autor. Migración `supabase/migrations/<timestamp>_avisos.sql`. Ninguna tabla guarda montos.

### Constantes

- Tipos de aviso: `('recurrente','cobro','deuda','precio_manual')`. En SQL se repite la lista. En el dominio vive `TIPOS_AVISO` en `src/domain/aviso/aviso.ts`.
- Opciones de `dias` por tipo (`OPCIONES_DIAS`), con el valor por defecto (`CONFIG_POR_DEFECTO`):

| `tipo` | Qué significa `dias` | Opciones | Por defecto |
|---|---|---|---|
| `recurrente` | Días de antelación al vencimiento. | `1, 3, 5, 7` | activo, `3` |
| `cobro` | Cada cuántos días se repite desde la fecha acordada. `0` = nunca. | `0, 14, 30` | activo, `30` |
| `deuda` | Días de antelación a la fecha acordada. | `1, 3, 7` | activo, `7` |
| `precio_manual` | Días sin precio nuevo. | `3, 7, 14` | inactivo, `7` |

- `HORA_AVISOS = "08:00"`, en la zona del perfil.
- `HISTORIAL_DIAS = 60`.

### Tabla `public.avisos_config`

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `usuario_id` | `uuid` | not null, default `auth.uid()`, FK `auth.users(id) on delete cascade` |
| `tipo` | `text` | not null, `check (tipo in (<tipos>))` |
| `activo` | `boolean` | not null |
| `dias` | `integer` | not null |
| `actualizado_en` | `timestamptz` | not null, default `now()` |

- PK `(usuario_id, tipo)` (`avisos_config_pkey`). Su índice empieza por `usuario_id` y sirve de índice de usuario (REGLAS §4).
- `avisos_config_dias_check`: `check ((tipo = 'recurrente' and dias in (1,3,5,7)) or (tipo = 'cobro' and dias in (0,14,30)) or (tipo = 'deuda' and dias in (1,3,7)) or (tipo = 'precio_manual' and dias in (3,7,14)))`. Es el espejo de `OPCIONES_DIAS`.
- RLS: `avisos_config_select_propia`, `avisos_config_insert_propia` y `avisos_config_update_propia`, con `usuario_id = auth.uid()`. Sin DELETE.
- Trigger `marcar_actualizado`.
- Sin fila, el tipo vale lo de `CONFIG_POR_DEFECTO`. No hay semilla: la fila nace con el primer `PATCH` (upsert).

### Tabla `public.avisos_leidos`

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `usuario_id` | `uuid` | not null, default `auth.uid()`, FK `auth.users(id) on delete cascade` |
| `clave` | `text` | not null |
| `leido` | `boolean` | not null |
| `marcado_en` | `timestamptz` | not null, default `now()` |

- PK `(usuario_id, clave)` (`avisos_leidos_pkey`). Sirve de índice de usuario.
- `avisos_leidos_clave_check`: `check (clave ~ '^(recurrente|cobro|deuda|precio_manual):[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}$')`.
- RLS: `avisos_leidos_select_propia`, `avisos_leidos_insert_propia` y `avisos_leidos_update_propia`, con `usuario_id = auth.uid()`. Sin DELETE: volver a «no leído» es `leido = false`, no borrar la fila.
- La escritura es un upsert directo (`on conflict (usuario_id, clave)`) que fija `leido` y `marcado_en = now()`.
- La clave no apunta a ninguna fila: un aviso cuya fuente desaparece deja una marca huérfana e inofensiva.

### Clave de un aviso

`<tipo>:<id de la fuente>:<fecha>`, con la fecha `"YYYY-MM-DD"`:

| `tipo` | Fuente | Fecha |
|---|---|---|
| `recurrente` | `recurrenteId` | vencimiento de la ocurrencia |
| `cobro` | `prestamoId` | fecha del recordatorio (la acordada o una repetición) |
| `deuda` | `prestamoId` | fecha acordada |
| `precio_manual` | `activoId` | fecha del precio que se quedó sin actualizar |

Es estable mientras la fuente no cambie. Si cambia la fecha acordada o la repetición de los cobros, nacen claves nuevas y las marcas viejas dejan de aplicar. No se puede decir si el aviso nuevo es «el mismo» que el viejo.

### Reglas del dominio (`src/domain/aviso/`)

Fechas `"YYYY-MM-DD"` en la zona del perfil. `ahora` es un `Date` y `hoy = fechaLocal(ahora, zona)`.

- **Disparo:** cada tipo da un día D. El instante del aviso es `max(instanteLocal(D, HORA_AVISOS, zona), creación de la fuente)`. La creación de la fuente es `creado_en` de la plantilla, del préstamo o el `cotizadoEn` del precio. Un aviso nunca es anterior a su fuente.
- **Visible:** `instante ≤ ahora` y `fechaLocal(instante) ≥ hoy − HISTORIAL_DIAS`. Si el tipo está inactivo, ninguno de sus avisos es visible.
- **`recurrente`:**
  - Solo plantillas no pausadas (`pausadaDesde === null`).
  - Una por cada ocurrencia (SPEC 07) con vencimiento V. D = `V − dias`.
  - Se recorren las ocurrencias con V en `[hoy − HISTORIAL_DIAS, hoy + dias]`.
  - Resuelto si la ocurrencia está `pagada` u `omitida`. La resolución lleva la forma y la fecha local del `creado_en` del cierre.
  - Monto: el importe mostrado de la ocurrencia, con su `estimado` (SPEC 07).
  - Cuenta: `cuentaOrigen ?? cuentaDestino` de la plantilla.
- **`cobro`:**
  - Solo préstamos `prestamo_otorgado` con `fechaAcordada`.
  - Recordatorios: `fechaAcordada + k × dias`, con `k = 0, 1, 2…` y `≤ hoy`. Con `dias = 0`, solo `k = 0`.
  - Hay aviso en un recordatorio R si el capital corrido al día R es > 0. D = R.
  - `proximoRecordatorio`: el primer `fechaAcordada + k × dias > hoy`, si `dias > 0` y el capital de hoy es > 0. Si no, `null`.
- **`deuda`:**
  - Solo préstamos `deuda_contraida` con `fechaAcordada`.
  - D = `fechaAcordada − dias`. Hay aviso si el capital corrido al día D es > 0.
- **Resolución de `cobro` y `deuda`:**
  - Resuelto si existe un movimiento de capital `abono` o `condonacion`, o un interés, con fecha ≥ `fechaLocal(instante)`.
  - La resolución cita el primero por `fecha` y `creadoEn`. Lleva su forma (`abono` o `condonacion`), su fecha y su cuenta propia (null en condonación).
  - Su monto es el capital más el interés enlazado del mismo abono (o solo el interés, si fue un abono de interés).
  - Monto del aviso: el de la resolución si está resuelto. Si no, el capital pendiente de hoy.
- **`precio_manual`:**
  - Solo activos con `cotizacion = 'manual'`, posición abierta hoy (SPEC 10) y cuenta no archivada.
  - Serie S: los precios del activo con origen `manual`, más el precio vigente si no es manual. Se ordena por `fecha` y `cotizadoEn` y queda uno por fecha, el último.
  - Para cada precio Pᵢ de S: D = `Pᵢ.fecha + dias`. Hay aviso si no hay Pᵢ₊₁ o si `Pᵢ₊₁.fecha ≥ D`.
  - Resuelto si existe Pᵢ₊₁. La resolución lleva su fecha.
  - Sin monto.
- **Leído:** con marca, vale `marca.leido`. Sin marca, vale `resuelto`. Resolver la fuente deja leído un aviso sin marca (N-26). Un «no leído» explícito gana sobre la resolución.
- **Orden:** por `instante` desc, luego por `tipo` en el orden de `TIPOS_AVISO` y luego por `clave`.
- **`noLeidos`:** cantidad de avisos visibles con `leido = false`.
- **Configuración efectiva:** las filas de `avisos_config`, más `CONFIG_POR_DEFECTO` para los tipos sin fila.
- **Cambio de configuración** (`validarCambioConfig`):
  - `dias`, si viene, está en `OPCIONES_DIAS[tipo]` (`ANTELACION_INVALIDA`);
  - si viene `dias` sin `activo`, el tipo queda activo (N-33);
  - un cuerpo sin campos da `SIN_CAMBIOS`.

### `instanteLocal(fecha, hora, zona)` (`src/domain/fecha/fecha-local.ts`)

Es la inversa de `fechaLocal`: el instante UTC en que el reloj de `zona` marca `fecha` a `hora`. Se calcula con `Intl.DateTimeFormat`, resolviendo el desfase de esa fecha, sin librerías. Colombia no tiene horario de verano. Las pruebas cubren `America/Bogota` y una zona con cambio de hora.

### Lectura de fuentes

`AvisosService` lee, en paralelo y solo para los tipos activos:

- perfil (zona), `avisos_config` y `avisos_leidos`;
- `recurrente`: `RecurrentesRepository.leer` (plantillas y cierres con `creado_en`);
- `cobro` y `deuda`: `PrestamosRepository.listar`, `movimientos` e `intereses` de los préstamos con fecha acordada;
- `precio_manual`: `InversionesRepository.listarCuentas` (no archivadas), `activos`, `operaciones` y `precios`.

Nunca llama a Twelve Data ni a la TRM: los avisos no refrescan precios (SPEC 11). `GET /avisos/conteo` hace la misma lectura y cálculo, sin armar los DTO.

### Tipos de dominio (`src/domain/aviso/aviso.ts`)

```ts
type TipoAviso = "recurrente" | "cobro" | "deuda" | "precio_manual";
type ConfigAviso = { tipo: TipoAviso; activo: boolean; dias: number };
type MarcaLeido = { clave: string; leido: boolean };

type AvisoBase = { clave: string; tipo: TipoAviso; instante: Date; resuelto: boolean };
type AvisoRecurrente = AvisoBase & {
  tipo: "recurrente"; recurrenteId: string; vencimiento: string; monto: bigint; estimado: boolean;
  resolucion: { forma: "confirmada" | "omitida"; fecha: string } | null;
};
type ResolucionPrestamo = { forma: "abono" | "condonacion"; fecha: string; monto: bigint; cuenta: Ref | null };
type AvisoCobro = AvisoBase & {
  tipo: "cobro"; prestamoId: string; fechaAcordada: string; recordatorio: string;
  monto: bigint; proximoRecordatorio: string | null; resolucion: ResolucionPrestamo | null;
};
type AvisoDeuda = AvisoBase & {
  tipo: "deuda"; prestamoId: string; fechaAcordada: string; monto: bigint; resolucion: ResolucionPrestamo | null;
};
type AvisoPrecio = AvisoBase & {
  tipo: "precio_manual"; activoId: string; cuentaId: string; precioFecha: string;
  resolucion: { fecha: string } | null;
};
type Aviso = AvisoRecurrente | AvisoCobro | AvisoDeuda | AvisoPrecio;
```

### Contrato HTTP

Convenciones de `docs/api/README.md`: montos como string entero, fechas `"YYYY-MM-DD"` en la zona del usuario, instantes ISO 8601 UTC y `ErrorApi`. Todos los montos de avisos son COP: recurrentes y préstamos no admiten USD (SPEC 07 y SPEC 08).

```ts
type Ref = { id: string; nombre: string };
type TipoAviso = "recurrente" | "cobro" | "deuda" | "precio_manual";

type AvisoBaseDto = {
  clave: string;                  // "recurrente:<uuid>:2026-11-25"
  tipo: TipoAviso;
  instante: string;               // ISO UTC: disparo a las 08:00 locales, o la creación de la fuente
  leido: boolean;
  resuelto: boolean;              // true → sin acción (N-24)
};

type AvisoRecurrenteDto = AvisoBaseDto & {
  tipo: "recurrente";
  recurrente: { id: string; concepto: string; tipo: "gasto" | "ingreso" | "transferencia"; variable: boolean };
  vencimiento: string;
  cuenta: Ref | null;             // origen, o destino en un ingreso
  monto: string;                  // pagada: el del movimiento; si no, el importe mostrado
  estimado: boolean;              // variable y no pagada → «≈»
  resolucion: { forma: "confirmada" | "omitida"; fecha: string } | null;
};

type ResolucionPrestamoDto = { forma: "abono" | "condonacion"; fecha: string; monto: string; cuenta: Ref | null };

type AvisoCobroDto = AvisoBaseDto & {
  tipo: "cobro";
  prestamo: Ref;                  // la persona
  fechaAcordada: string;
  recordatorio: string;           // = fechaAcordada en el primero
  monto: string;                  // resuelto: el abono; si no, capital pendiente de hoy
  capitalPendiente: string;       // hoy
  proximoRecordatorio: string | null;
  resolucion: ResolucionPrestamoDto | null;
};

type AvisoDeudaDto = AvisoBaseDto & {
  tipo: "deuda";
  prestamo: Ref;
  fechaAcordada: string;
  monto: string;                  // resuelto: el abono; si no, capital pendiente de hoy
  capitalPendiente: string;       // hoy («Quedan 500.000»)
  resolucion: ResolucionPrestamoDto | null;
};

type AvisoPrecioDto = AvisoBaseDto & {
  tipo: "precio_manual";
  activo: { id: string; simbolo: string; nombre: string };
  inversion: Ref;
  precioFecha: string;
  resolucion: { fecha: string } | null;
};

type AvisoDto = AvisoRecurrenteDto | AvisoCobroDto | AvisoDeudaDto | AvisoPrecioDto;

type AvisoConfigDto = { tipo: TipoAviso; activo: boolean; dias: number; opciones: number[] };

type AvisosDto = {
  fechaHoy: string;
  zonaHoraria: string;            // IANA, la del perfil
  horaAvisos: "08:00";
  noLeidos: number;
  avisos: AvisoDto[];             // visibles, en orden
  config: AvisoConfigDto[];       // en el orden de TIPOS_AVISO
};

type ConteoAvisosDto = { noLeidos: number };
type MarcaCuerpo = { leido: boolean };
type ConfigCuerpo = { activo?: boolean; dias?: number };
```

| Método y ruta | Cuerpo / consulta | Respuesta |
|---|---|---|
| `GET /avisos` | — | `200 AvisosDto` |
| `GET /avisos/conteo` | — | `200 ConteoAvisosDto` |
| `PATCH /avisos/:clave` | `MarcaCuerpo` | `204` |
| `POST /avisos/leer-todos` | — | `204` |
| `PATCH /avisos/config/:tipo` | `ConfigCuerpo` | `200 AvisoConfigDto` |

- `PATCH /avisos/:clave` exige que la clave sea de un aviso visible ahora (`AVISO_NO_ENCONTRADO`). Una clave mal formada da `ENTRADA_INVALIDA`.
- `POST /avisos/leer-todos` hace upsert de `leido = true` sobre todos los avisos visibles con `leido = false`, en una sola escritura. Sin ninguno, responde `204` sin escribir.
- `:tipo` fuera de `TIPOS_AVISO` da `ENTRADA_INVALIDA`.
- El cliente arma:
  - el título y el detalle, largo o corto;
  - la acción: `recurrente` sin resolver → «Ajustar» si `variable` y «Confirmar» si no; `cobro` sin resolver → «Registrar abono»; `precio_manual` sin resolver → registrar precio;
  - el plazo: `diasEntre(fechaLocal(instante), vencimiento | fechaAcordada)`;
  - el grupo (Hoy, Ayer, Esta semana, Antes) y el momento, con `instante`, `zonaHoraria` y `fechaHoy`.
- Las acciones usan endpoints existentes:
  - `POST /recurrentes/:id/confirmar` con `vencimiento` (SPEC 07);
  - `POST /prestamos/:id/abonos` (SPEC 08);
  - `POST /inversiones/:id/activos/:activoId/precios` (SPEC 10).
- Después de una acción o un `PATCH`, el cliente vuelve a pedir `GET /avisos/conteo` para el menú.

### Errores nuevos

| `codigo` | Estado | `campo` | `mensaje` |
|---|---|---|---|
| `AVISO_NO_ENCONTRADO` | 404 | — | «El aviso ya no existe.» |
| `ANTELACION_INVALIDA` | 400 | `dias` | «Elige una de las opciones de este tipo de aviso.» |

Se reutilizan `SIN_CAMBIOS`, `ENTRADA_INVALIDA`, `NO_AUTENTICADO` y `ERROR_INTERNO`.

Traducciones en el repositorio: `23514` sobre `avisos_config_dias_check` → `ANTELACION_INVALIDA`, como defensa: el dominio valida antes.

## Estructura de archivos

```
supabase/migrations/<timestamp>_avisos.sql
src/
  app.module.ts                            # + AvisosModule
  comun/error-api.ts                       # + códigos nuevos
  avisos/
    avisos.controller.ts
    avisos.service.ts                      # lee fuentes, llama al dominio, arma DTO
    avisos.module.ts
    esquemas.ts                            # Zod: :clave, :tipo, MarcaCuerpo, ConfigCuerpo
    dto.ts
  domain/
    fecha/fecha-local.ts (+ .test.ts)      # + instanteLocal
    aviso/
      aviso.ts                             # tipos, TIPOS_AVISO, OPCIONES_DIAS, CONFIG_POR_DEFECTO, HORA_AVISOS, HISTORIAL_DIAS
      clave.ts (+ .test.ts)                # armarClave, esClaveValida
      config.ts (+ .test.ts)               # configEfectiva, validarCambioConfig
      recurrentes.ts (+ .test.ts)          # avisosDeRecurrentes
      prestamos.ts (+ .test.ts)            # avisosDeCobros, avisosDeDeudas, resolución
      precios.ts (+ .test.ts)              # avisosDePrecios
      lista.ts (+ .test.ts)                # disparo, visibles, leído, orden, noLeidos
  repositories/supabase/
    avisos.repository.ts                   # config, marcas (upsert), traducción de errores
    recurrentes.repository.ts              # + creado_en del cierre
    tipos.ts                               # regenerado
test/
  aislamiento.e2e-spec.ts                  # ampliado (no se borra ni se desactiva)
  avisos.e2e-spec.ts
docs/api/
  avisos.md, README.md
```

Dirección: controller → service → `domain/`, con los repositorios detrás del servicio. `domain/` no importa Nest, Zod ni Supabase. `domain/aviso/` reutiliza `domain/recurrente/`, `domain/prestamo/` y `domain/inversion/`, y no los cambia.

## Plan de implementación

1. Escribir `supabase/migrations/<timestamp>_avisos.sql` según el modelo. **El autor la revisa antes del paso 2** (REGLAS §8).
2. Aplicarla con `apply_migration` sobre Tino dev. Correr `get_advisors` (security y performance) y corregir los avisos en una migración nueva. Regenerar `tipos.ts`.
3. Ampliar `test/aislamiento.e2e-spec.ts`. Con dos usuarios, cada uno con una fila en `avisos_config` y otra en `avisos_leidos`:
   - el otro no ve las filas ajenas;
   - el UPDATE de filas ajenas afecta 0 filas;
   - un INSERT con `usuario_id` ajeno falla por RLS;
   - un DELETE propio afecta 0 filas (sin política);
   - `dias` fuera de las opciones del tipo viola `avisos_config_dias_check`;
   - una clave mal formada viola `avisos_leidos_clave_check`.
   - `npm test` en verde.
4. `instanteLocal` en `domain/fecha/fecha-local.ts`, con pruebas:
   - `("2026-11-22", "08:00", "America/Bogota")` → `2026-11-22T13:00:00.000Z`;
   - una zona con cambio de hora, a cada lado del cambio;
   - ida y vuelta con `fechaLocal`.
5. `domain/aviso/aviso.ts`, `clave.ts` y `config.ts`, con pruebas: claves válidas e inválidas, defaults sin filas, `dias` sin `activo` activa el tipo, `ANTELACION_INVALIDA` y `SIN_CAMBIOS`.
6. `domain/aviso/recurrentes.ts`, con pruebas sobre el diseño:
   - Gas Vanti, variable, vence en `hoy + 3`, con antelación 3: aviso de hoy, sin resolver y `estimado`;
   - Gimnasio pagado: resuelto `confirmada` con la fecha del cierre;
   - una omitida queda resuelta `omitida`;
   - una plantilla pausada no da avisos;
   - una plantilla creada hoy que vence mañana: el aviso queda con el instante de la creación;
   - una ocurrencia vencida sin cerrar sigue sin resolver.
7. `domain/aviso/prestamos.ts`, con pruebas:
   - Camila (otorgado, acordada hace 38 días, 500.000 pendientes, cada 30 días): avisos en la acordada y en `+30`, `proximoRecordatorio` `+60` y sin resolver;
   - un abono posterior resuelve los recordatorios anteriores a él, pero no los que vienen después;
   - con `dias = 0`, un solo aviso;
   - con el capital en 0 al día R, no hay aviso en R;
   - mamá (contraída, acordada D, antelación 3, abono de 100.000 en D): aviso en `D − 3`, resuelto `abono` con 100.000, su cuenta y `capitalPendiente` 500.000;
   - una condonación resuelve con `cuenta: null`;
   - sin fecha acordada no hay aviso.
8. `domain/aviso/precios.ts`, con pruebas:
   - un activo manual con último precio hace 8 días, con plazo 7: un aviso sin resolver;
   - un precio nuevo lo resuelve y abre un nuevo plazo;
   - huecos menores al plazo no dan aviso;
   - un activo automático, sin posición o de una cuenta archivada no da avisos.
9. `domain/aviso/lista.ts`, con pruebas:
   - visible solo con `instante ≤ ahora` (antes de las 08:00 no sale el de hoy);
   - corte de 60 días;
   - un tipo inactivo no sale;
   - leído efectivo, donde la marca gana sobre la resolución;
   - orden y `noLeidos`.
10. Agregar los códigos a `error-api.ts`. `recurrentes.repository.ts` lee `creado_en` de los cierres, sin cambiar la forma de `GET /recurrentes`.
11. `avisos.repository.ts`: leer la configuración y las marcas, hacer upsert de la configuración, upsert de una marca y upsert en lote para leer todos, y traducir los errores.
12. `src/avisos/` con `GET /avisos` y `GET /avisos/conteo`. El servicio resuelve zona, `ahora` y `hoy`, lee las fuentes de los tipos activos en paralelo y llama al dominio. `AvisosModule` provee los repositorios que usa, como `RecurrentesModule`.
13. `PATCH /avisos/:clave`, `POST /avisos/leer-todos` y `PATCH /avisos/config/:tipo`.
14. `test/avisos.e2e-spec.ts` con los criterios de aceptación. Se omite con aviso si falta `SUPABASE_SECRET_KEY`. Usa el cliente de servicio solo para fechar en el pasado `creado_en`, `generar_desde`, `primer_vencimiento`, las fechas de los movimientos y los precios. Todo aviso de la prueba dispara en `H − 1` o antes, para no depender de la hora en que corre.
15. `docs/api/avisos.md`: endpoints, DTO, reglas de cada tipo, qué arma el cliente y errores. Fila en `README.md`.

## Tabla de cobertura

| N-xx | Cobertura |
|---|---|
| N-01 | SPEC 09. |
| N-02 | `GET /avisos/conteo` → `noLeidos`. |
| N-03 | Navegación del cliente. |
| N-04 | Fuera de alcance: Metas no figura en REGLAS. |
| N-05 | SPEC 04. |
| N-06 | `AvisosDto.noLeidos`. |
| N-07 | `POST /avisos/leer-todos`. |
| N-08 | El cliente, con `noLeidos === 0`. |
| N-09 | `instante`, `zonaHoraria` y `fechaHoy`; el cliente agrupa. |
| N-10 | Orden de `avisos`: `instante` desc. |
| N-11 | Corte de `HISTORIAL_DIAS = 60`. |
| N-12 | `AvisoDto.tipo`. |
| N-13 | `AvisoDto.leido`. |
| N-14 | `recurrente.concepto`, `prestamo.nombre` o `activo`, más `vencimiento` o `fechaAcordada` contra `instante`. El cliente arma el título. |
| N-15 | Campos por tipo: `vencimiento`, `cuenta`, `estimado`, `fechaAcordada`, `recordatorio`, `capitalPendiente`, `proximoRecordatorio` y `precioFecha`. |
| N-16 | `resolucion` por tipo (forma, fecha, cuenta, monto) y `capitalPendiente`. |
| N-17 | `monto` y `estimado`; `precio_manual` no lleva monto. |
| N-18 | `recurrente.tipo` (gasto y transferencia salen; ingreso entra). En `cobro` y `deuda` lo da el tipo de aviso. |
| N-19 | `instante`; el cliente le da formato en la zona del usuario. |
| N-20 | `recurrente.id` + `vencimiento`, `variable: false`, sin resolver → `POST /recurrentes/:id/confirmar` (SPEC 07). |
| N-21 | `variable: true` → el mismo endpoint con `monto` (SPEC 07). |
| N-22 | `prestamo.id`, sin resolver → `POST /prestamos/:id/abonos` (SPEC 08). |
| N-23 | `inversion.id` + `activo.id` → `POST /inversiones/:id/activos/:activoId/precios` (SPEC 10). |
| N-24 | `AvisoDto.resuelto`. |
| N-25 | `PATCH /avisos/:clave { leido }`, guardado en `avisos_leidos`. |
| N-26 | Leído efectivo: sin marca, `leido = resuelto`. |
| N-27 | Solo fuentes vivas: plantilla no pausada, préstamo existente, activo manual con posición en cuenta no archivada. Tipo inactivo → no visible. |
| N-28 | `avisos: []`; el cliente muestra el vacío. |
| N-29 | `horaAvisos` y `zonaHoraria`. |
| N-30 | `config[].tipo` y `activo`; nombre y descripción los pone el cliente. |
| N-31 | `config[].dias` y `opciones`. |
| N-32 | `PATCH /avisos/config/:tipo { activo }`. |
| N-33 | `PATCH /avisos/config/:tipo { dias }`: sin `activo`, activa el tipo. |
| N-34 | `CONFIG_POR_DEFECTO`. |
| N-35 | `ANTELACION_INVALIDA` y `avisos_config_dias_check`. |
| N-36 | Reglas de `recurrente`. |
| N-37 | Reglas de `cobro`. |
| N-38 | Reglas de `deuda`. |
| N-39 | Reglas de `precio_manual`. |
| N-40 | `cobro` y `deuda` exigen `fechaAcordada`. |
| N-41 – N-43 | Fuera de alcance: tarjeta con ciclo (REGLAS §7). |
| N-44 | Los mismos campos de N-15 y N-16; el detalle corto lo arma el cliente. |
| N-45 | Navegación del cliente; usa `config` de `GET /avisos`. |

Endpoint → N-xx:

- `GET /avisos`: N-06, N-09 a N-24, N-26 a N-31, N-34, N-36 a N-40, N-44 y N-45.
- `GET /avisos/conteo`: N-02.
- `PATCH /avisos/:clave`: N-25.
- `POST /avisos/leer-todos`: N-07.
- `PATCH /avisos/config/:tipo`: N-32, N-33 y N-35.

## Criterios de aceptación

`H` es hoy en la zona del perfil (`America/Bogota`). Todos los avisos de la prueba disparan en `H − 1` o antes.

- [ ] `npm test`, `npm run lint` y `npm run typecheck` pasan.
- [ ] `list_migrations` muestra la migración y el archivo existe en `supabase/migrations/`.
- [ ] `get_advisors` (security) no reporta avisos sobre las tablas nuevas.
- [ ] `test/aislamiento.e2e-spec.ts` pasa con las comprobaciones del paso 3.
- [ ] Las e2e de recurrentes, préstamos e inversiones siguen en verde.
- [ ] Un usuario nuevo: `GET /avisos` → `200` con `avisos: []`, `noLeidos: 0`, `horaAvisos: "08:00"` y `config` con los cuatro tipos en sus valores por defecto y sus `opciones`.
- [ ] Una plantilla de gasto variable que vence en `H + 2`, creada en `H − 5`, con antelación `3`: un aviso `recurrente` con `instante` = `H − 1` a las 08:00 locales, `estimado: true`, `resuelto: false` y `leido: false`. `noLeidos` y `GET /avisos/conteo` dan `1`.
- [ ] Confirmar esa ocurrencia → el aviso queda `resuelto: true`, `resolucion.forma: "confirmada"` y `leido: true` sin marca.
- [ ] `PATCH /avisos/:clave { leido: false }` sobre él → `204`, y el aviso vuelve a `leido: false` aunque esté resuelto.
- [ ] Un préstamo otorgado con 500.000 pendientes, fecha acordada `H − 31` y cobro cada 30 días: avisos `cobro` en `H − 31` y `H − 1`, `capitalPendiente` `"500000"` y `proximoRecordatorio` `H + 29`.
- [ ] Un abono de 100.000 en `H − 1` resuelve los dos con `forma: "abono"`, `monto` `"100000"` y su cuenta. `capitalPendiente` pasa a `"400000"`.
- [ ] Una deuda contraída con fecha acordada `H + 2` y antelación `3`: un aviso `deuda` en `H − 1`, con `monto` igual al capital pendiente.
- [ ] Un préstamo sin fecha acordada no da avisos.
- [ ] Con `precio_manual` activado a 7 días, un activo manual con posición y último precio en `H − 8`: un aviso sin resolver. Registrar un precio lo resuelve.
- [ ] Un activo automático no da avisos de precio.
- [ ] `PATCH /avisos/config/precio_manual { dias: 14 }` → `200 { tipo: "precio_manual", activo: true, dias: 14, opciones: [3, 7, 14] }`.
- [ ] `PATCH /avisos/config/deuda { dias: 5 }` → `400 ANTELACION_INVALIDA` con `campo: "dias"`.
- [ ] `PATCH /avisos/config/deuda {}` → `400 SIN_CAMBIOS`.
- [ ] `PATCH /avisos/config/tarjeta { activo: true }` → `400 ENTRADA_INVALIDA`.
- [ ] `PATCH /avisos/config/recurrente { activo: false }` → los avisos `recurrente` desaparecen de `GET /avisos` y del conteo.
- [ ] Pausar o eliminar la plantilla quita sus avisos.
- [ ] Eliminar el préstamo quita los suyos.
- [ ] `POST /avisos/leer-todos` → `204`; después, `noLeidos: 0`.
- [ ] `PATCH /avisos/<clave válida de un aviso que no existe>` → `404 AVISO_NO_ENCONTRADO`. Con una clave mal formada → `400 ENTRADA_INVALIDA`.
- [ ] Una clave con el id de una fuente de otro usuario → `404 AVISO_NO_ENCONTRADO`.
- [ ] Un aviso con `instante` hace más de 60 días no sale en la lista.
- [ ] `GET /avisos` y `GET /avisos/conteo` no llaman a la fuente de precios ni a la de TRM (las fuentes falsas cuentan 0 llamadas).
- [ ] Ningún archivo de `src/domain/` importa `@nestjs/*`, `zod` ni `@supabase/*`. Ningún monto pasa por `number`.
- [ ] `docs/api/avisos.md` existe y `README.md` lo lista.

## Decisiones

- **Sí:** avisos derivados al leer, como las ocurrencias de SPEC 07. **No:** materializar una tabla `avisos`, que exige escribir en un GET y deja una copia del capital o del importe que se desfasa de la fuente (RN-01).
- **Sí:** solo dentro de la app, con las 08:00 como la hora desde la que aparece el aviso del día. **No:** push o correo, que exigen un job con credencial de mantenimiento (REGLAS §4) y un canal de envío. Va en otro spec si llega.
- **Sí:** marcas de leído por clave derivada (`tipo:fuente:fecha`), con `leido` explícito. **No:** borrar la fila para «no leído», porque haría falta distinguir «sin marca» (vale la resolución) de «no leído a propósito» (gana sobre la resolución).
- **Sí:** sin marca, un aviso resuelto está leído. **No:** escribir la marca al resolver la fuente, que acoplaría confirmar, abonar y registrar precio con los avisos.
- **Sí:** `avisos_config` con una fila por tipo y un `check` de opciones por tipo. Los defaults viven en el dominio y no hay semilla. **No:** columnas por tipo, en una fila propia o en `perfiles`: cada tipo nuevo sería una columna, y en `perfiles` se mezclan dominios.
- **Sí:** una sola columna `dias` con el significado de cada tipo (antelación, repetición o plazo) y `0` = nunca en cobros. **No:** un `valor text` con enumeraciones que el dominio tiene que interpretar.
- **Sí:** la API manda campos por tipo y el cliente arma las frases. **No:** texto armado en la API, que mete la presentación en el backend y no sirve para el detalle corto del móvil.
- **Sí:** `GET /avisos` trae lista, conteo y configuración en una lectura, y `GET /avisos/conteo` aparte para el menú. **No:** meter el conteo en `GET /perfil`, que lo encarece y mezcla módulos. **No:** usar la lista completa en cada pantalla.
- **Sí:** cobros y deudas quedan resueltos con un abono, interés o condonación desde la fecha del aviso. **No:** solo al saldar, que dejaría «Registrar abono» después de un abono parcial.
- **Sí:** el aviso se corre a la creación de su fuente si el disparo es anterior. **No:** omitirlo, que callaría justo las plantillas que vencen pronto.
- **Sí:** los cobros se repiten a los 14 o 30 días exactos desde la fecha acordada, mientras haya capital al día del recordatorio. **No:** el mismo día de cada mes: el diseño cuenta días (15 oct → 14 nov).
- **Sí:** un aviso de precio por cada precio que se queda sin actualizar más de N días. Un precio nuevo lo resuelve y abre un plazo nuevo. **No:** repetir cada N días.
- **Sí:** fuentes que ya no existen, plantillas pausadas, activos que ya no son manuales y tipos inactivos no dan avisos. **No:** conservar avisos huérfanos en el historial.
- **Sí:** 60 días de historial.
- **Sí:** `PATCH /avisos/:clave` solo sobre avisos visibles (`AVISO_NO_ENCONTRADO`). Así no se guardan marcas de claves inventadas. **No:** aceptar cualquier clave bien formada.
- **Sí:** los avisos no refrescan precios ni TRM. El conteo corre en cada pantalla y no debe gastar créditos ni pagar timeouts (SPEC 11).
- **Sí:** sin historial de marcas ni de configuración. No son datos financieros (RN-13).
- **Sí:** `instanteLocal` con `Intl` y sin librería de fechas, como `fechaLocal`.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| `GET /avisos/conteo` lee recurrentes, préstamos y activos en cada pantalla | Solo lee los tipos activos, en paralelo y con las columnas necesarias, sin proveedores externos. Si pesa, un spec futuro lo cachea o lo pasa a SQL con su propia decisión. |
| Cambiar `dias` o la fecha acordada reescribe las fechas y claves de los avisos pasados | Los avisos no son datos financieros. Las marcas viejas quedan huérfanas y los avisos nuevos nacen sin leer. Queda documentado en `docs/api/avisos.md`. |
| `avisos_leidos` crece sin límite | Una fila por aviso marcado: cientos al año por usuario. La limpieza va en un spec futuro, si hace falta. |
| Las pruebas dependen de la hora (antes de las 08:00 no sale el aviso del día) | El e2e solo usa disparos en `H − 1` o antes. El dominio recibe `ahora` y prueba los bordes. |
| La serie de precios de un activo que fue automático deja un hueco largo entre el costo inicial y el primer precio manual | Ese aviso suele quedar fuera de los 60 días. Si no, sale como resuelto y no estorba. |
| Una zona con cambio de hora da 08:00 inexistentes o dobles | `instanteLocal` toma el primer instante válido. La zona por defecto, `America/Bogota`, no tiene cambio de hora. |

## Lo que **no** entra en este spec

- Avisos de la tarjeta de crédito (pago y corte).
- Push, correo o notificaciones fuera de la app.
- Hora de aviso editable.
- Limpieza de marcas viejas.
- Historial de cambios de marcas y configuración.
- Metas.

Cada uno, si llega, va en su propio spec.
