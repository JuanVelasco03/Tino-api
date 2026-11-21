# SPEC 07 — Recurrentes

> **Estado:** Aprobado
> **Depende de:** SPEC 03, SPEC 04, SPEC 05
> **Fecha:** 2026-11-21
> **Objetivo:** Que la API guarde plantillas recurrentes, derive sus ocurrencias (bandeja por confirmar, comprometido del mes, ingresos esperados) y permita confirmarlas como movimientos, omitirlas o deshacer, sin que nada toque saldos sin el usuario (RN-10).

## Por qué existe este spec

REGLAS §7 se enmendó en los dos repos para que entren los recurrentes. Deudas, avisos, inversiones y tarjeta con ciclo siguen fuera.

Fija tres patrones:

- **Las ocurrencias se derivan, no se guardan.** Se calculan en `src/domain/` desde el calendario de la plantilla. Solo se guarda el **cierre** de una ocurrencia: confirmada (con su movimiento) u omitida. No hay tareas programadas ni escrituras en un GET. Tampoco hace falta `service_role` (REGLAS §4).
- **Un movimiento confirmado es un movimiento normal.** Nace por `registrar_movimiento` dentro de `confirmar_ocurrencia`, en la misma transacción que su cierre. Al borrar el movimiento, el cierre cae en cascada y la ocurrencia vuelve a la bandeja.
- **El importe de la plantilla va cifrado** como todo monto (SPEC 05). Comprometido y estimados se calculan en el dominio.

Cubre el inventario `specs/necesidades/recurrentes.md` (ver tabla de cobertura).

## Alcance

**Entra:**

- Migración con `recurrentes`, `recurrentes_cierres`, `recurrentes_cambios`, la vista `recurrentes_detalle`, la función `confirmar_ocurrencia`, el trigger de historial y `unique (usuario_id, id)` en `movimientos`. Todo con RLS.
- Plantillas de `gasto`, `ingreso` y `transferencia`. Fijas o variables. Periodicidad semanal, quincenal, mensual, bimestral, trimestral o anual.
- `GET /recurrentes`: bandeja, comprometido del mes, ingresos esperados y plantillas.
- `POST /recurrentes`, `PUT /recurrentes/:id`, `PATCH /recurrentes/:id` (pausa), `DELETE /recurrentes/:id`.
- `POST /recurrentes/:id/confirmar`, `POST /recurrentes/:id/omitir` y `DELETE /recurrentes/:id/omisiones/:vencimiento`.
- `DELETE /cuentas/:id` con plantillas responde `CUENTA_CON_RECURRENTES`.
- Dominio puro en `src/domain/recurrente/`, con pruebas unitarias.
- Prueba de aislamiento ampliada y e2e `test/recurrentes.e2e-spec.ts`.
- `docs/api/recurrentes.md`. Se actualizan `cuentas.md`, `movimientos.md` y `README.md`.
- Ya hecho antes del spec: REGLAS §7 enmendado en `tino-api` y `../Tino-web`.

**Fuera de alcance (specs futuros):**

- TRM, avisos y entradas a otros módulos (N-01, N-02, N-03).
- Abono recurrente a una deuda con persona (N-78): llega con préstamos.
- Plantillas en USD (N-79).
- Avisos o notificaciones de vencimiento.
- Confirmar una ocurrencia programada (fuera de la ventana de 7 días) o cambiar su fecha al confirmar.
- Dividir en partes la categoría de una plantilla.
- Endpoint para consultar `recurrentes_cambios`. Ninguna N-xx lo pide.
- Comprometido de un mes distinto del actual.

## Modelo de datos

Decidido por el autor. Migración `supabase/migrations/<timestamp>_recurrentes.sql`. Los montos son `text` cifrado (SPEC 05).

### Cambios en tablas existentes

- `movimientos`: `unique (usuario_id, id)` (`movimientos_usuario_id_id_key`), destino de la FK de los cierres.

### Tabla `public.recurrentes`

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `id` | `uuid` | PK. Lo genera la API (AAD del monto). |
| `usuario_id` | `uuid` | not null, default `auth.uid()`, FK `auth.users(id) on delete cascade` |
| `tipo` | `text` | not null, `check (tipo in ('gasto','ingreso','transferencia'))` |
| `concepto` | `text` | not null, `check (char_length(btrim(concepto)) between 1 and 80)` |
| `monto` | `text` | not null, restricción de formato cifrado de SPEC 05 |
| `variable` | `boolean` | not null, default `false` |
| `cuenta_origen_id` | `uuid` | nullable |
| `cuenta_destino_id` | `uuid` | nullable |
| `categoria_id` | `uuid` | nullable |
| `periodicidad` | `text` | not null, `check (periodicidad in ('semanal','quincenal','mensual','bimestral','trimestral','anual'))` |
| `primer_vencimiento` | `date` | not null. Ancla del calendario. |
| `ultimo_dia` | `boolean` | not null, default `false` |
| `generar_desde` | `date` | not null. Primera fecha que genera ocurrencias. |
| `pausada_desde` | `date` | nullable. Null = activa. |
| `creado_en` | `timestamptz` | not null, default `now()` |
| `actualizado_en` | `timestamptz` | not null, default `now()` |

- `check` de forma por tipo (`recurrentes_cuentas_por_tipo`): el mismo de `movimientos_cuentas_por_tipo` (RN-03, RN-05).
- `check (not ultimo_dia or periodicidad in ('mensual','bimestral','trimestral','anual'))` (`recurrentes_ultimo_dia`).
- `unique (usuario_id, id)` (`recurrentes_usuario_id_id_key`).
- FK `(usuario_id, cuenta_origen_id) → cuentas (usuario_id, id) on delete restrict` (`recurrentes_cuenta_origen_fkey`). Igual para destino (`recurrentes_cuenta_destino_fkey`).
- FK `(usuario_id, categoria_id, tipo) → categorias (usuario_id, id, tipo) on delete restrict`. MATCH SIMPLE, como en `movimientos`.
- Índices: `recurrentes_usuario_idx (usuario_id)`, `recurrentes_origen_idx (usuario_id, cuenta_origen_id)`, `recurrentes_destino_idx (usuario_id, cuenta_destino_id)`, `recurrentes_categoria_idx (usuario_id, categoria_id, tipo)`.
- RLS: `recurrentes_select_propia`, `recurrentes_insert_propia`, `recurrentes_update_propia`, `recurrentes_delete_propia`, todas con `usuario_id = auth.uid()`.
- Triggers `marcar_actualizado` y `registrar_cambio_recurrente`.
- AAD del monto: `<usuario_id>|recurrentes|monto|<id>`.

### Tabla `public.recurrentes_cierres`

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `usuario_id` | `uuid` | not null, default `auth.uid()`, FK `auth.users(id) on delete cascade` |
| `recurrente_id` | `uuid` | not null |
| `vencimiento` | `date` | not null |
| `estado` | `text` | not null, `check (estado in ('confirmada','omitida'))` |
| `movimiento_id` | `uuid` | nullable |
| `creado_en` | `timestamptz` | not null, default `now()` |

- `check ((estado = 'confirmada') = (movimiento_id is not null))` (`recurrentes_cierres_movimiento`).
- `unique (recurrente_id, vencimiento)` (`recurrentes_cierres_unico`). Garantiza que una ocurrencia se cierre una sola vez.
- FK `(usuario_id, recurrente_id) → recurrentes (usuario_id, id) on delete cascade`.
- FK `(usuario_id, movimiento_id) → movimientos (usuario_id, id) on delete cascade`. Borrar el movimiento devuelve la ocurrencia a la bandeja (N-28, N-76).
- Índices: `recurrentes_cierres_usuario_idx (usuario_id)` y un índice único `recurrentes_cierres_movimiento_idx (usuario_id, movimiento_id)`.
- RLS:
  - `recurrentes_cierres_select_propio`.
  - `recurrentes_cierres_insert_omision`: `with check (usuario_id = auth.uid() and estado = 'omitida')`.
  - `recurrentes_cierres_delete_omision`: `using (usuario_id = auth.uid() and estado = 'omitida')`.
  - Sin UPDATE. Una confirmada solo nace en `confirmar_ocurrencia` y solo muere con su movimiento.

### Tabla `public.recurrentes_cambios`

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` |
| `recurrente_id` | `uuid` | not null, **sin FK**: sobrevive a la eliminación |
| `usuario_id` | `uuid` | not null, FK `auth.users(id) on delete cascade` |
| `operacion` | `text` | not null, `check (operacion in ('edicion','eliminacion'))` |
| `antes` | `jsonb` | not null: la fila completa (`to_jsonb(old)`) |
| `despues` | `jsonb` | nullable: igual forma; nulo en `eliminacion` |
| `cambiado_en` | `timestamptz` | not null, default `now()` |

- Índices `recurrentes_cambios_usuario_idx (usuario_id)` y `recurrentes_cambios_recurrente_idx (recurrente_id)`.
- RLS: solo `recurrentes_cambios_select_propio`.
- El monto viaja cifrado dentro de las fotos y conserva la AAD de su fila (SPEC 05).

### Trigger `registrar_cambio_recurrente()`

`after update or delete on recurrentes`, `security definer`, `set search_path = ''`.

- En UPDATE inserta `('edicion', old, new)`. Si las dos fotos son iguales sin contar `actualizado_en`, no inserta nada. La API reutiliza el monto cifrado si no cambió, así que una diferencia es un cambio real.
- En DELETE inserta `('eliminacion', old, null)`.
- La pausa y la reanudación son ediciones (RN-13).

### Función `confirmar_ocurrencia`

`privado.confirmar_ocurrencia(p_recurrente_id uuid, p_vencimiento date, p_movimiento_id uuid, p_monto text) returns uuid`. Es `security definer` con `set search_path = ''` y tiene una envoltura `security invoker` en `public` con la misma firma. Permisos como `registrar_movimiento`.

1. `NO_AUTENTICADO` si `auth.uid()` es nulo.
2. Lee la plantilla del usuario. Si no existe, lanza `RECURRENTE_NO_ENCONTRADO`.
3. Llama a `privado.registrar_movimiento(p_movimiento_id, r.tipo, p_monto, p_vencimiento, r.concepto, null, r.cuenta_origen_id, r.cuenta_destino_id, r.categoria_id, null)`. Esa llamada valida la cuenta archivada (`CUENTA_ARCHIVADA:<campo>`).
4. Inserta `(recurrente_id, vencimiento, 'confirmada', movimiento_id)` en `recurrentes_cierres`.
5. Un `23505` sobre `recurrentes_cierres_unico` revierte todo. El repositorio lo traduce a `OCURRENCIA_CERRADA`.

La función no valida el calendario. Que `p_vencimiento` sea una ocurrencia abierta y dentro de la ventana lo comprueba el dominio antes de llamarla. `p_monto` llega cifrado con la AAD `movimientos|monto|p_movimiento_id`.

### Vista `recurrentes_detalle`

`with (security_invoker = true)`: `recurrentes.*` más `cuenta_origen_nombre`, `cuenta_destino_nombre` y `categoria_nombre`.

### Calendario (dominio)

Todas las fechas son días `"YYYY-MM-DD"` en la zona del perfil. `hoy` sale de `fechaLocal`.

- **Vencimientos** de una plantilla:
  - `semanal`: `primer_vencimiento + 7k`.
  - `quincenal`: el día 15 y el último día de cada mes, desde `primer_vencimiento`.
  - `mensual`, `bimestral`, `trimestral`, `anual`: cada 1, 2, 3 o 12 meses desde el mes de `primer_vencimiento`. El día es el último del mes si `ultimo_dia`. Si no, es `min(día de primer_vencimiento, último día del mes)` (N-73). Se calcula siempre desde el ancla, no desde el vencimiento anterior: 31 → 28 → 31.
- **Ocurrencias:** los vencimientos con `v >= generar_desde` y, si está pausada, `v < pausada_desde`.
- **Estado de una ocurrencia:**
  - `pagada` si tiene cierre `confirmada`.
  - `omitida` si tiene cierre `omitida`.
  - Sin cierre: `vencida` si `v < hoy`, `por_confirmar` si `v <= hoy + 7` y `programada` en otro caso.
- **Ventana:** 7 días, fija (N-07).
- **Importe mostrado:**
  - Una `pagada` muestra el monto de su movimiento.
  - El resto muestra el monto de la plantilla si es fija. Si es variable, muestra el del **último confirmado** y, sin ninguno, el de la plantilla.
- **Último confirmado:** el cierre `confirmada` con mayor `vencimiento`, con el monto actual de su movimiento.
- **Bandeja:** ocurrencias `vencida` y `por_confirmar` de cualquier mes. Van por `vencimiento` asc y luego por `concepto`.
- **Comprometido del mes actual:** salidas (`gasto` y `transferencia`) con vencimiento en el mes:
  - `pagado`: las `pagada`.
  - `porConfirmar`: las `vencida` y `por_confirmar`.
  - `programado`: las `programada`.
  - Las omitidas no cuentan.
  - `total` es la suma de los tres.
  - Cada grupo lleva su suma y su cantidad.
- **Ingresos esperados:** ocurrencias `ingreso` del mes actual, abiertas (`vencida`, `por_confirmar` o `programada`), por vencimiento.
- **Próximo vencimiento:** la primera ocurrencia sin cierre con `v >= hoy`. Es `null` si no hay.

### Reglas de escritura

- **Crear:** se exige `primerVencimiento >= hoy` (`PRIMER_VENCIMIENTO_PASADO`). `generar_desde = primer_vencimiento` y `pausada_desde = null`.
- **Editar (`PUT`):**
  - Si cambia `periodicidad`, `primerVencimiento` o `ultimoDia`, se exige `primerVencimiento >= hoy` y `generar_desde` pasa a `primer_vencimiento`. Las ocurrencias abiertas anteriores desaparecen. Los cierres se quedan.
  - Si no cambian, el calendario no se toca.
  - Las ocurrencias abiertas reflejan siempre los valores actuales de la plantilla. Los movimientos confirmados no cambian.
- **Pausar (`PATCH { pausada: true }`):** `pausada_desde = hoy + 1`. Las ocurrencias con vencimiento hasta hoy siguen en la bandeja.
- **Reanudar (`PATCH { pausada: false }`):** `generar_desde = hoy` y `pausada_desde = null`. Los vencimientos del tiempo en pausa no vuelven.
- Un `PATCH` al estado que ya tiene responde `200` sin cambios.
- **Cuentas:** el servicio rechaza una cuenta archivada al crear o editar (`CUENTA_ARCHIVADA`). Si la cuenta se archiva después, la plantilla sigue generando ocurrencias y confirmar responde `CUENTA_ARCHIVADA`.
- **Confirmar u omitir** exige una ocurrencia sin cierre en estado `vencida` o `por_confirmar` (`OCURRENCIA_INVALIDA`).

### Tipos de dominio (`src/domain/recurrente/recurrente.ts`)

```ts
type Periodicidad = "semanal" | "quincenal" | "mensual" | "bimestral" | "trimestral" | "anual";
type Calendario = { periodicidad: Periodicidad; primerVencimiento: string; ultimoDia: boolean; generarDesde: string; pausadaDesde: string | null };
type Recurrente = Calendario & { id: string; tipo: TipoMovimiento; concepto: string; monto: bigint; variable: boolean; cuentaOrigenId: string | null; cuentaDestinoId: string | null; categoriaId: string | null };
type Cierre = { recurrenteId: string; vencimiento: string; estado: "confirmada" | "omitida"; movimientoId: string | null; montoMovimiento: bigint | null };
type EstadoOcurrencia = "pagada" | "omitida" | "vencida" | "por_confirmar" | "programada";
type Ocurrencia = { recurrenteId: string; vencimiento: string; estado: EstadoOcurrencia; monto: bigint; estimado: boolean; movimientoId: string | null };
```

### Contrato HTTP

Convenciones de `docs/api/README.md`: montos como string entero, fechas `"YYYY-MM-DD"` en la zona del usuario y `ErrorApi`.

```ts
type Ref = { id: string; nombre: string };
type EstadoOcurrencia = "pagada" | "omitida" | "vencida" | "por_confirmar" | "programada";

type OcurrenciaDto = {
  recurrenteId: string;
  vencimiento: string;
  estado: EstadoOcurrencia;
  monto: string;                // pagada: el del movimiento; si no, fijo o estimado
  estimado: boolean;            // variable y no pagada
  movimientoId: string | null;  // solo en pagada
};

type RecurrenteDto = {
  id: string;
  tipo: "gasto" | "ingreso" | "transferencia";
  concepto: string;
  monto: string;                // el de la plantilla
  variable: boolean;
  periodicidad: "semanal" | "quincenal" | "mensual" | "bimestral" | "trimestral" | "anual";
  primerVencimiento: string;
  ultimoDia: boolean;
  cuentaOrigen: Ref | null;
  cuentaDestino: Ref | null;
  categoria: Ref | null;
  pausada: boolean;
  pausadaDesde: string | null;
  ultimoConfirmado: { monto: string; vencimiento: string } | null;
  ocurrenciasDelMes: OcurrenciaDto[];   // del mes actual, por vencimiento
  proximoVencimiento: string | null;
  creadoEn: string;
  actualizadoEn: string;
};

type GrupoDto = { monto: string; cantidad: number };

type RecurrentesDto = {
  fechaHoy: string;
  mes: string;                  // "YYYY-MM", mes actual
  ventanaDias: number;          // 7
  bandeja: OcurrenciaDto[];     // vencida y por_confirmar
  comprometido: { total: string; pagado: GrupoDto; porConfirmar: GrupoDto; programado: GrupoDto };
  ingresosEsperados: OcurrenciaDto[];
  recurrentes: RecurrenteDto[];
};

type RecurrenteCuerpo = {       // POST y PUT
  tipo: "gasto" | "ingreso" | "transferencia";
  concepto: string;
  monto: string;                // ^\d{1,19}$, > 0
  variable: boolean;
  periodicidad: "semanal" | "quincenal" | "mensual" | "bimestral" | "trimestral" | "anual";
  primerVencimiento: string;
  ultimoDia?: boolean;          // default false
  cuentaOrigenId?: string | null;
  cuentaDestinoId?: string | null;
  categoriaId?: string | null;
};
```

| Método y ruta | Cuerpo / consulta | Respuesta |
|---|---|---|
| `GET /recurrentes` | — | `200 RecurrentesDto` |
| `POST /recurrentes` | `RecurrenteCuerpo` | `201 RecurrenteDto` |
| `PUT /recurrentes/:id` | `RecurrenteCuerpo` | `200 RecurrenteDto` |
| `PATCH /recurrentes/:id` | `{ pausada: boolean }` | `200 RecurrenteDto` |
| `DELETE /recurrentes/:id` | — | `204` |
| `POST /recurrentes/:id/confirmar` | `{ vencimiento: string; monto?: string }` | `201 MovimientoDto` (SPEC 04) |
| `POST /recurrentes/:id/omitir` | `{ vencimiento: string }` | `204` |
| `DELETE /recurrentes/:id/omisiones/:vencimiento` | — | `204` |

- `recurrentes` van por el vencimiento de su primera ocurrencia del mes. Después van las que no tienen ocurrencias en el mes, por `proximoVencimiento` (null al final). El desempate es por `concepto`.
- `bandeja` e `ingresosEsperados` traen solo `recurrenteId`. El cliente toma concepto, cuentas, categoría, periodicidad y `ultimoConfirmado` de `recurrentes`.
- `confirmar` sin `monto` usa el importe mostrado. Con `monto`, usa ese.
- Deshacer una confirmación es `DELETE /movimientos/:id` con el `id` del `MovimientoDto` (SPEC 04).
- El texto relativo («mañana», «en 3 días») lo arma el cliente con `fechaHoy`.

### Errores nuevos

| `codigo` | Estado | `campo` | `mensaje` |
|---|---|---|---|
| `RECURRENTE_NO_ENCONTRADO` | 404 | — | «El recurrente no existe.» |
| `CONCEPTO_REQUERIDO` | 400 | `concepto` | «Escribe un concepto.» |
| `CONCEPTO_LARGO` | 400 | `concepto` | «El concepto admite hasta 80 caracteres.» |
| `PERIODICIDAD_INVALIDA` | 400 | `periodicidad` | «Elige una periodicidad válida.» |
| `PRIMER_VENCIMIENTO_PASADO` | 400 | `primerVencimiento` | «El primer vencimiento no puede ser anterior a hoy.» |
| `ULTIMO_DIA_NO_PERMITIDO` | 400 | `ultimoDia` | «"Último día" solo aplica a periodicidades de un mes o más.» |
| `OCURRENCIA_INVALIDA` | 422 | `vencimiento` | «Esa fecha no es un vencimiento por confirmar.» |
| `OCURRENCIA_CERRADA` | 409 | `vencimiento` | «Ese vencimiento ya se confirmó u omitió.» |
| `OMISION_NO_ENCONTRADA` | 404 | — | «No hay una omisión para ese vencimiento.» |
| `CUENTA_CON_RECURRENTES` | 409 | — | «La cuenta tiene recurrentes. Cámbialos o elimínalos primero.» |

Se reutilizan `TIPO_MOVIMIENTO_INVALIDO`, `MONTO_REQUERIDO`, `MONTO_INVALIDO`, `FECHA_INVALIDA` (con `campo` `primerVencimiento` o `vencimiento`), `ORIGEN_REQUERIDO`, `DESTINO_REQUERIDO`, `ORIGEN_NO_PERMITIDO`, `DESTINO_NO_PERMITIDO`, `CUENTAS_IGUALES`, `CATEGORIA_NO_PERMITIDA`, `CATEGORIA_INVALIDA`, `CUENTA_INVALIDA`, `CUENTA_ARCHIVADA`, `ENTRADA_INVALIDA`, `NO_AUTENTICADO` y `ERROR_INTERNO`.

Traducciones en los repositorios:

- `<CODIGO>[:<campo>]` lanzado por `confirmar_ocurrencia` → su código y campo.
- `23505` sobre `recurrentes_cierres_unico` → `OCURRENCIA_CERRADA`.
- `23503` sobre las FK de cuenta de `recurrentes` → `CUENTA_INVALIDA`. Sobre la de categoría → `CATEGORIA_INVALIDA`.
- `23503` al borrar una cuenta: si la restricción es `recurrentes_cuenta_*_fkey`, → `CUENTA_CON_RECURRENTES`. Si no, → `CUENTA_CON_MOVIMIENTOS`.
- Fila no visible por RLS → `RECURRENTE_NO_ENCONTRADO`. `DELETE` de una omisión que afecta 0 filas → `OMISION_NO_ENCONTRADA`.

## Estructura de archivos

```
supabase/migrations/<timestamp>_recurrentes.sql
src/
  app.module.ts                          # + RecurrentesModule
  comun/error-api.ts                     # + códigos nuevos
  recurrentes/
    recurrentes.controller.ts
    recurrentes.service.ts
    recurrentes.module.ts
    esquemas.ts                          # Zod: cuerpo, :id, :vencimiento, confirmar, omitir, pausa
    dto.ts
  domain/
    recurrente/
      recurrente.ts                      # tipos
      calendario.ts (+ .test.ts)         # vencimientos(calendario, desde, hasta)
      ocurrencias.ts (+ .test.ts)        # estado, importe mostrado, último confirmado, bandeja, próximo
      comprometido.ts (+ .test.ts)       # comprometido e ingresos esperados del mes
      validar.ts (+ .test.ts)            # validarRecurrente, validarCierre
    fecha/mes.ts (+ mes.test.ts)         # + sumarDias, sumarMeses si hace falta
  repositories/supabase/
    recurrentes.repository.ts            # cifra/descifra, rpc confirmar_ocurrencia, cierres
    cuentas.repository.ts                # + 23503 → CUENTA_CON_RECURRENTES
    tipos.ts                             # regenerado
test/
  aislamiento.e2e-spec.ts                # ampliado (no se borra ni se desactiva)
  recurrentes.e2e-spec.ts
docs/api/
  recurrentes.md, README.md, cuentas.md, movimientos.md
```

Dirección: controller → service → `domain/`, con los repositorios detrás del servicio. `domain/` no importa Nest, Zod ni Supabase.

## Plan de implementación

1. Escribir `supabase/migrations/<timestamp>_recurrentes.sql` según el modelo. **El autor la revisa antes del paso 2** (REGLAS §8).
2. Aplicarla con `apply_migration` sobre Tino dev. Correr `get_advisors` (security y performance) y corregir los avisos en una migración nueva. Regenerar `tipos.ts`.
3. Ampliar `test/aislamiento.e2e-spec.ts`. Con dos usuarios, cada uno con una plantilla y un cierre:
   - El otro no ve `recurrentes`, `recurrentes_detalle`, `recurrentes_cierres` ni `recurrentes_cambios` ajenos.
   - Un INSERT de plantilla con la cuenta o la categoría ajena falla.
   - Un INSERT de cierre con la plantilla ajena falla.
   - Un INSERT directo de un cierre `confirmada` falla por RLS.
   - UPDATE y DELETE sobre filas ajenas afectan 0 filas.
   - `confirmar_ocurrencia` sobre la plantilla ajena lanza `RECURRENTE_NO_ENCONTRADO`.

   `npm test` en verde.
4. Dominio con pruebas:
   - `calendario.ts`:
     - Mensual con ancla `2027-01-31` → `2027-02-28`, `2027-03-31`.
     - Con `ultimoDia` desde abril → `2027-04-30`.
     - Quincenal en febrero de 2027 → `15` y `28`.
     - Anual desde `2028-02-29` → `2029-02-28`.
     - Semanal → `+7`.
     - Se respetan `generarDesde` y `pausadaDesde`.
   - `ocurrencias.ts`:
     - Estados según `hoy` y la ventana: un vencimiento en `hoy + 7` es `por_confirmar` y uno en `hoy + 8` es `programada`.
     - Una variable muestra el último confirmado, o el de la plantilla si no hay ninguno.
     - La bandeja va ordenada.
     - El próximo vencimiento salta las cerradas.
   - `comprometido.ts`, con el ejemplo del diseño:
     - `pagado` `"1396220"` (5 pagos), `porConfirmar` `"191150"` (4), `programado` `"30800"` (2) y `total` `"1618170"`.
     - El salario va en `ingresosEsperados`.
     - Las omitidas y los ingresos no suman.
     - Las transferencias sí.
   - `validar.ts`: cada código de la tabla, `ultimoDia` con semanal y transferencia con categoría.
5. Agregar los códigos a `error-api.ts`. En `cuentas.repository.ts`, distinguir `23503` por restricción.
6. `recurrentes.repository.ts`:
   - Lee `recurrentes_detalle`, los cierres y los montos de los movimientos confirmados.
   - Descifra con la AAD de cada fila.
   - Al crear genera el `id` y cifra el monto. Al editar reutiliza el cifrado si el monto no cambió.
   - Omite y deshace la omisión con insert y delete directos.
   - Confirma por `rpc('confirmar_ocurrencia')`.
   - Traduce los errores.
7. `src/recurrentes/` con `GET /recurrentes`: el servicio resuelve zona, `hoy` y mes, llama al dominio y arma el DTO.
8. `POST`, `PUT`, `PATCH` y `DELETE /recurrentes/:id`. El servicio corre `validarRecurrente` y comprueba las cuentas archivadas.
9. `POST /recurrentes/:id/confirmar`, `POST /recurrentes/:id/omitir` y `DELETE /recurrentes/:id/omisiones/:vencimiento`. El servicio corre `validarCierre` contra las ocurrencias derivadas. `confirmar` cifra el monto con el `id` nuevo del movimiento y devuelve la fila de `movimientos_detalle`.
10. `test/recurrentes.e2e-spec.ts` con los criterios de aceptación. Se omite con aviso si falta `SUPABASE_SECRET_KEY`. Usa el cliente de servicio solo para fechar `primer_vencimiento` y `generar_desde` en el pasado.
11. `docs/api/`:
    - Crear `recurrentes.md`.
    - `cuentas.md`: `CUENTA_CON_RECURRENTES`.
    - `movimientos.md`: borrar un movimiento confirmado lo devuelve a la bandeja.
    - Agregar la fila en `README.md`.

## Tabla de cobertura

| N-xx | Cobertura |
|---|---|
| N-01 | Fuera de alcance: USD hasta inversiones. |
| N-02 | Fuera de alcance: avisos (REGLAS §7). |
| N-03 | Fuera de alcance: REGLAS §7; Metas no figura en REGLAS. |
| N-04 | Ya cubierto por SPEC 04. |
| N-05 | Navegación del cliente; `GET /recurrentes` alimenta la pantalla. |
| N-06 | `RecurrentesDto.bandeja`: ocurrencias derivadas sin cierre. |
| N-07 | `ventanaDias`; estado `por_confirmar` si `v <= hoy + 7`. |
| N-08 | Estado `vencida`; sin cierre sigue en `bandeja`. |
| N-09 | `bandeja.length`. |
| N-10 | Orden de `bandeja`: `vencimiento` asc y luego `concepto`. |
| N-11 | `OcurrenciaDto.vencimiento`. |
| N-12 | `fechaHoy`, `vencimiento` y `estado`. El texto relativo es del cliente. |
| N-13 | `RecurrenteDto.concepto` por `recurrenteId`. |
| N-14 | `RecurrenteDto.categoria` (nula en transferencia). |
| N-15 | `RecurrenteDto.cuentaOrigen` y `cuentaDestino`. |
| N-16 | `RecurrenteDto.tipo` + `OcurrenciaDto.monto`. |
| N-17 | `OcurrenciaDto.estimado`. |
| N-18 | Importe mostrado (dominio `ocurrencias.ts`). |
| N-19 | Las ocurrencias no son movimientos: nada se escribe en `movimientos` hasta confirmar. |
| N-20 | `POST /recurrentes/:id/confirmar` → `confirmar_ocurrencia`, con `fecha = vencimiento`. |
| N-21 | `201 MovimientoDto` (`descripcion`, `monto`, cuentas). |
| N-22 | `monto` opcional en `confirmar`. |
| N-23 | `RecurrenteDto.ultimoConfirmado` + `periodicidad`. |
| N-24 | `confirmar` con `monto`. `ultimoConfirmado` sale del movimiento. |
| N-25 | `MONTO_REQUERIDO` y `MONTO_INVALIDO`. |
| N-26 | `POST /recurrentes/:id/omitir` → cierre `omitida`. |
| N-27 | `204`. El mensaje es del cliente. |
| N-28 | `DELETE /movimientos/:id` (SPEC 04) + FK `on delete cascade` del cierre; foto en `movimientos_cambios`. |
| N-29 | `DELETE /recurrentes/:id/omisiones/:vencimiento`. |
| N-30 | `OCURRENCIA_CERRADA` (`recurrentes_cierres_unico`) y `OCURRENCIA_INVALIDA`. |
| N-31 | `CUENTA_ARCHIVADA` desde `registrar_movimiento`; la transacción se revierte. |
| N-32 | `bandeja: []` + `ventanaDias`. |
| N-33 | `RecurrentesDto.mes`. |
| N-34 | `comprometido.total`. |
| N-35 | `comprometido.pagado`. |
| N-36 | `comprometido.porConfirmar`. |
| N-37 | `comprometido.programado`. |
| N-38 | Importe mostrado por estado (dominio `comprometido.ts`). |
| N-39 | El calendario genera cada ocurrencia del mes (semanal, quincenal). |
| N-40 | `RecurrentesDto.ingresosEsperados`. |
| N-41 | `RecurrentesDto.recurrentes`. |
| N-42 | Orden de `recurrentes`. |
| N-43 | `RecurrenteDto.concepto`. |
| N-44 | `RecurrenteDto.periodicidad`. |
| N-45 | `primerVencimiento`, `ultimoDia` y `periodicidad`. |
| N-46 | `cuentaOrigen` y `cuentaDestino`. |
| N-47 | `categoria` y `tipo`. |
| N-48 | `monto` y `variable`. |
| N-49 | `ocurrenciasDelMes[].estado` y `vencimiento`. |
| N-50 | `ocurrenciasDelMes: []` + `proximoVencimiento`. |
| N-51 | `pausada` y `pausadaDesde`; el calendario corta en `pausada_desde`. |
| N-52 | `POST /recurrentes`. |
| N-53 | `RecurrenteCuerpo.tipo`. |
| N-54 | `RecurrenteCuerpo.concepto`. |
| N-55 | `RecurrenteCuerpo.monto`. |
| N-56 | `RecurrenteCuerpo.variable`. |
| N-57 | `RecurrenteCuerpo.periodicidad`. |
| N-58 | `RecurrenteCuerpo.primerVencimiento` y `ultimoDia`. |
| N-59 | `RecurrenteCuerpo.primerVencimiento` (ancla). |
| N-60 | `RecurrenteCuerpo.cuentaOrigenId` y `cuentaDestinoId`. |
| N-61 | `RecurrenteCuerpo.categoriaId`, opcional. |
| N-62 | `CONCEPTO_REQUERIDO` y `CONCEPTO_LARGO`. |
| N-63 | `MONTO_REQUERIDO` y `MONTO_INVALIDO`. |
| N-64 | `PERIODICIDAD_INVALIDA`, `FECHA_INVALIDA`, `PRIMER_VENCIMIENTO_PASADO` y `ULTIMO_DIA_NO_PERMITIDO`. |
| N-65 | `ORIGEN_*`, `DESTINO_*`, `CUENTAS_IGUALES`, `CUENTA_INVALIDA` y `CUENTA_ARCHIVADA`. |
| N-66 | `CATEGORIA_NO_PERMITIDA` y `CATEGORIA_INVALIDA`. |
| N-67 | `ErrorApi` con `campo`. |
| N-68 | `PUT /recurrentes/:id`; reglas de edición del calendario. |
| N-69 | `PATCH /recurrentes/:id { pausada: true }`. |
| N-70 | `PATCH /recurrentes/:id { pausada: false }` → `generar_desde = hoy`. |
| N-71 | `DELETE /recurrentes/:id`; los cierres caen en cascada y los movimientos se quedan. |
| N-72 | `RecurrenteDto.id`; ocurrencia = `recurrenteId` + `vencimiento`. |
| N-73 | `calendario.ts`: el día se ajusta al último día del mes. |
| N-74 | `recurrentes_cambios` por el trigger `registrar_cambio_recurrente`. |
| N-75 | `confirmar_ocurrencia` usa `registrar_movimiento`: el movimiento sale en `GET /movimientos`, `GET /cuentas` y `GET /resumen`. |
| N-76 | FK `on delete cascade` del cierre; `ultimoConfirmado` lee el monto actual del movimiento. |
| N-77 | Plantilla `transferencia` (RN-07); `calcularSaldo` con signo por naturaleza (RN-02). |
| N-78 | Fuera de alcance: préstamos (REGLAS §7). |
| N-79 | Fuera de alcance: movimientos solo en COP. |
| N-80 | Estados HTTP y `ErrorApi`. La carga es del cliente. |
| N-81 | Montos como string entero. |
| N-82 | `recurrentes.monto` cifrado; cálculos en `src/domain/recurrente/`. |
| N-83 | RLS, FK compuestas y `test/aislamiento.e2e-spec.ts`. |

Endpoint → N-xx:

- `GET /recurrentes`: N-06, N-34, N-40, N-41.
- `POST /recurrentes`: N-52.
- `PUT /recurrentes/:id`: N-68.
- `PATCH /recurrentes/:id`: N-69, N-70.
- `DELETE /recurrentes/:id`: N-71.
- `POST /recurrentes/:id/confirmar`: N-20, N-24.
- `POST /recurrentes/:id/omitir`: N-26.
- `DELETE /recurrentes/:id/omisiones/:vencimiento`: N-29.

## Criterios de aceptación

`H` es hoy en la zona del perfil. Cuenta Nequi (banco, saldo inicial `"500000"`).

- [ ] `npm test`, `npm run lint` y `npm run typecheck` pasan.
- [ ] `list_migrations` muestra la migración y el archivo existe en `supabase/migrations/`.
- [ ] `get_advisors` (security) no reporta avisos sobre las tablas, la vista ni las funciones nuevas.
- [ ] `test/aislamiento.e2e-spec.ts` pasa con las comprobaciones del paso 3.
- [ ] `POST /recurrentes` de un gasto mensual «Internet» de `"89900"` desde Nequi con `primerVencimiento = H+3`:
  - responde `201`;
  - en la BD, `recurrentes.monto` cumple `^v1\.`;
  - `GET /recurrentes` trae en `bandeja` una ocurrencia `por_confirmar` en `H+3`, con `estimado: false`;
  - el saldo de Nequi en `GET /cuentas` sigue en `"500000"`.
- [ ] Una plantilla con `primerVencimiento = H+8` no está en la bandeja y su ocurrencia es `programada`.
- [ ] `primerVencimiento = H−1` → `400 PRIMER_VENCIMIENTO_PASADO`. `ultimoDia: true` con `semanal` → `400 ULTIMO_DIA_NO_PERMITIDO`.
- [ ] Una transferencia con `categoriaId` → `400 CATEGORIA_NO_PERMITIDA`. Con origen = destino → `400 CUENTAS_IGUALES`.
- [ ] `POST /recurrentes/:id/confirmar { vencimiento: H+3 }`:
  - responde `201 MovimientoDto` con `fecha` `H+3`, `descripcion` «Internet» y `monto` `"89900"`;
  - Nequi queda en `"410100"`;
  - la ocurrencia queda `pagada` con `movimientoId` y sale de la bandeja.
- [ ] Repetir la confirmación → `409 OCURRENCIA_CERRADA`, sin un segundo movimiento.
- [ ] Un `vencimiento` que no está en el calendario → `422 OCURRENCIA_INVALIDA`. Uno `programado` → `422 OCURRENCIA_INVALIDA`.
- [ ] Una plantilla variable de `"32400"` confirmada con `monto: "35120"` deja `ultimoConfirmado` en `"35120"`. Su siguiente ocurrencia muestra `"35120"` con `estimado: true`.
- [ ] `DELETE /movimientos/:id` del confirmado:
  - devuelve la ocurrencia a `por_confirmar`;
  - Nequi vuelve a su saldo;
  - deja una fila `eliminacion` en `movimientos_cambios`.
- [ ] `POST /recurrentes/:id/omitir` → `204`:
  - la ocurrencia queda `omitida` y sale de la bandeja y del comprometido;
  - `DELETE /recurrentes/:id/omisiones/:vencimiento` la devuelve;
  - repetir el `DELETE` → `404 OMISION_NO_ENCONTRADA`.
- [ ] Con `primer_vencimiento` y `generar_desde` fechados en `H−3` (cliente de servicio), la ocurrencia de `H−3` es `vencida` y va primera en la bandeja.
- [ ] `comprometido` suma gastos y transferencias del mes, no ingresos. Un ingreso del mes sin confirmar aparece en `ingresosEsperados`.
- [ ] `PATCH { pausada: true }`:
  - la ocurrencia de `H+3` sale de la bandeja y la vencida de `H−3` sigue.
- [ ] `PATCH { pausada: false }`:
  - pone `generar_desde = H` y `pausadaDesde: null`;
  - deja una fila `edicion` en `recurrentes_cambios` por cada cambio de estado.
- [ ] `PUT` que cambia el monto deja una fila `edicion`. Un `PUT` idéntico no deja fila.
- [ ] `PUT` que cambia la periodicidad con `primerVencimiento` pasado → `400 PRIMER_VENCIMIENTO_PASADO`.
- [ ] `POST /recurrentes` con una cuenta archivada → `409 CUENTA_ARCHIVADA`.
- [ ] Si la cuenta se archiva después, `confirmar` → `409 CUENTA_ARCHIVADA` y no crea movimiento.
- [ ] `DELETE /cuentas/:id` de una cuenta sin movimientos con una plantilla → `409 CUENTA_CON_RECURRENTES`.
- [ ] `DELETE /recurrentes/:id` → `204`:
  - el movimiento confirmado sigue en `GET /movimientos`;
  - queda una fila `eliminacion` en `recurrentes_cambios`;
  - no quedan cierres de la plantilla.
- [ ] Un id ajeno en cualquier ruta `/recurrentes/:id` → `404 RECURRENTE_NO_ENCONTRADO`.
- [ ] Ninguna ruta devuelve texto de Postgres en `mensaje`.
- [ ] Ningún archivo de `src/domain/` importa `@nestjs/*`, `zod` ni `@supabase/*`. Ningún monto pasa por `number`.
- [ ] `docs/api/recurrentes.md` existe y `README.md` lo enlaza.

## Decisiones

- **Sí:** se enmienda REGLAS §7 para que entren los recurrentes.
- **Sí:** ocurrencias derivadas en el dominio más una tabla de cierres. **No:** materializarlas al leer (escrituras en un GET) ni con una tarea programada (exigiría `service_role` fuera de petición o un cron por usuario).
- **Sí:** el cierre confirmado apunta al movimiento con `on delete cascade`. Borrar el movimiento devuelve la ocurrencia, y deshacer reutiliza `DELETE /movimientos/:id`. **No:** una columna de recurrente en `movimientos`.
- **Sí:** `confirmar_ocurrencia` como función `security definer` en `privado`, con su envoltura, que reutiliza `registrar_movimiento`. Movimiento y cierre son atómicos. **No:** dos llamadas desde la API.
- **Sí:** omitir y deshacer la omisión por RLS directa, con políticas que solo admiten `estado = 'omitida'`. Una confirmada no se crea ni se borra por esa vía.
- **Sí:** plantillas con RLS directa e historial por trigger, como `cuentas`. **No:** funciones para escribir plantillas, que no cambian saldos.
- **Sí:** historial `recurrentes_cambios` con `antes` y `despues` en `jsonb` (RN-13: sin modificación silenciosa). Registra pausa y reanudación. **No:** prescindir del historial.
- **Sí:** calendario con `periodicidad`, ancla `primer_vencimiento` y `ultimo_dia`. Se calcula desde el ancla para no derivar. **No:** columnas de día, día de semana y mes de inicio.
- **Sí:** «quincenal» = días 15 y último de cada mes, como la quincena colombiana. **No:** cada 14 días.
- **Sí:** el día 29–31 cae el último día en meses más cortos.
- **Sí:** el primer vencimiento no puede ser anterior a hoy, y tampoco al cambiar el calendario en un `PUT`. Evita una bandeja de vencidas el día uno.
- **Sí:** `pausada_desde date` y `generar_desde date`. La pausa no borra lo que ya vencía. Reanudar no resucita lo del tiempo en pausa. **No:** un `boolean`. Es un refinamiento de la decisión del autor («pausada + generar_desde»), confirmado.
- **Sí:** `PATCH /recurrentes/:id { pausada }` aparte del `PUT`.
- **Sí:** editar el calendario reinicia `generar_desde`. Las ocurrencias abiertas anteriores desaparecen y los cierres se quedan. Las abiertas siempre reflejan la plantilla actual.
- **Sí:** el movimiento confirmado lleva la fecha de vencimiento, también si es futura. Cuenta en el saldo desde ya, como todo movimiento con fecha futura (SPEC 04).
- **Sí:** solo se confirma u omite lo que está en la bandeja (`vencida` o `por_confirmar`). «Ajustar» cambia solo el importe.
- **Sí:** el estimado de una variable es el monto actual del último movimiento confirmado. Editar ese movimiento cambia el estimado. **No:** guardar el último valor en la plantilla.
- **Sí:** el comprometido incluye transferencias (salidas), no ingresos. No es gasto: el resumen no cambia (RN-05). Cuenta solo vencimientos del mes actual, también los vencidos del mes.
- **Sí:** ingresos esperados uno por línea.
- **Sí:** un solo `GET /recurrentes` para toda la pantalla, como `GET /captura` y `GET /resumen`. La bandeja referencia la plantilla por `recurrenteId` en lugar de repetir sus campos.
- **Sí:** rutas de ocurrencia bajo la plantilla, identificadas por `vencimiento`. **No:** un recurso con id compuesto.
- **Sí:** categoría opcional, como en movimientos.
- **Sí:** borrado físico de la plantilla con foto en el historial. Los cierres caen y los movimientos se quedan. **No:** borrado lógico.
- **Sí:** FK de cuenta `on delete restrict` y `CUENTA_CON_RECURRENTES`. **No:** borrar las plantillas en cascada.
- **Sí:** archivar una cuenta no pausa sus plantillas. Confirmar falla con `CUENTA_ARCHIVADA` y el usuario edita, omite o pausa.
- **Sí:** ventana fija de 7 días, sin columna.
- **Sí:** vista `recurrentes_detalle` para los nombres, como `movimientos_detalle`.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| `confirmar_ocurrencia` es `security definer` y salta la RLS | Fuerza `auth.uid()`, lee la plantilla filtrando por usuario, delega en `registrar_movimiento` y usa FK compuestas. La prueba de aislamiento la ataca con una plantilla ajena. |
| El dominio y la BD discrepan sobre qué vencimientos existen | La BD solo garantiza unicidad y pertenencia. El calendario vive en un solo lugar (`calendario.ts`) con pruebas de bordes de mes. |
| Una semanal antigua genera muchas vencidas | El primer vencimiento no puede ser anterior a hoy. A escala personal, 52 por año sobran. |
| Cambiar la zona horaria mueve `hoy` y los estados | Lo mismo que en SPEC 06. Se documenta y se prueba con `America/Bogota`. |
| `GET /recurrentes` lee todos los cierres y sus movimientos | Solo las columnas necesarias, en paralelo. Si crece, se acota por fecha en otro spec. |

## Lo que **no** entra en este spec

- TRM, avisos y entradas a otros módulos.
- Abonos recurrentes a deudas con personas.
- Plantillas en USD.
- Notificaciones de vencimiento.
- Confirmar programadas o cambiar la fecha al confirmar.
- Dividir la categoría de una plantilla.
- Consulta del historial de plantillas.
- Comprometido de otros meses.

Cada uno, si llega, va en su propio spec.
