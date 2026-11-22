# SPEC 09 — TRM oficial, automática e histórica

> **Estado:** Aprobado
> **Depende de:** SPEC 02, SPEC 06
> **Fecha:** 2026-11-21
> **Objetivo:** Que la API obtenga sola la TRM oficial de la fecha que necesite, la guarde en una caché por usuario y exponga la vigente en `GET /trm`, con la última conocida como respaldo cuando la fuente falla.

## Por qué existe este spec

REGLAS §7 se enmienda en los dos repos para que entren las inversiones. El inventario `specs/necesidades/inversiones.md` se parte en tres specs:

- **SPEC 09 (este):** la TRM.
- **SPEC 10:** las cuentas de inversión: efectivo, fondeo COP↔USD, posiciones, compras y ventas, precio manual, patrimonio y resumen.
- **SPEC 11:** los precios automáticos.

La TRM va primero porque las otras dos la necesitan y no depende de ellas.

Fija dos patrones que SPEC 11 reutiliza para los precios:

- **Datos externos bajo demanda, en caché por usuario.** La API no puede tener `service_role` (REGLAS §4), así que ningún job escribe una tabla global. Cuando una petición necesita una TRM que no está en caché, la API la trae de la fuente y la guarda con el token del usuario, bajo RLS. Cada usuario tiene su copia. Un usuario que altere su caché por PostgREST solo se afecta a sí mismo (RN-12 intacta).
- **La fuente externa es un repositorio.** `src/repositories/datos-gov/` es el único lugar que conoce datos.gov.co, como `repositories/supabase/` lo es de Supabase (REGLAS §5). Es inyectable, para reemplazarlo en las pruebas.

Cubre parte del inventario `specs/necesidades/inversiones.md` (ver tabla de cobertura).

## Alcance

**Entra:**

- Enmienda de REGLAS §7 en `tino-api` y `../Tino-web`: inversiones pasa a «Construir ahora».
- Migración con la tabla `trm` y su RLS.
- Cliente de la fuente en `src/repositories/datos-gov/trm.fuente.ts`.
- Caché en `src/repositories/supabase/trm.repository.ts`.
- Dominio puro en `src/domain/trm/`, con pruebas unitarias.
- `TrmService` con `en(token, fecha)`, exportado por `TrmModule` para SPEC 10.
- `GET /trm`.
- Prueba de aislamiento ampliada y e2e `test/trm.e2e-spec.ts`, con la fuente reemplazada por una falsa.
- `docs/api/trm.md` y su fila en `docs/api/README.md`.

**Fuera de alcance (specs futuros):**

- Todo lo de cuentas de inversión, posiciones, operaciones, fondeo y su efecto en Cuentas y Resumen (SPEC 10).
- Precios automáticos de activos (SPEC 11).
- TRM de una fecha pasada por HTTP. Ninguna N-xx la pide. `TrmService.en` ya la resuelve para SPEC 10.
- Lectura de varias fechas en una sola consulta (series del resumen). Llega con SPEC 10 si hace falta.
- Otras monedas además de USD.
- Reintentos o cortacircuitos contra la fuente.

## Modelo de datos

Decidido por el autor. Migración `supabase/migrations/<timestamp>_trm.sql`.

### Tabla `public.trm`

Una fila por vigencia, tal como la publica la fuente. Una fila puede cubrir varios días: la del sábado vale hasta el lunes.

| Columna | Tipo | Restricción / defecto |
|---|---|---|
| `usuario_id` | `uuid` | not null, default `auth.uid()`, FK `auth.users(id) on delete cascade` |
| `vigente_desde` | `date` | not null |
| `vigente_hasta` | `date` | not null |
| `valor_cent` | `integer` | not null, `check (valor_cent > 0)`. Centavos de peso por US$ 1: 3.461,92 = `346192`. |
| `obtenida_en` | `timestamptz` | not null, default `now()` |

- PK `(usuario_id, vigente_desde)` (`trm_pkey`). Su índice empieza por `usuario_id` y sirve de índice de usuario (REGLAS §4).
- `check (vigente_hasta >= vigente_desde)` (`trm_vigencia_check`).
- RLS, con `(select auth.uid())` como en las demás tablas:
  - `trm_select_propia`: `using ((select auth.uid()) = usuario_id)`;
  - `trm_insert_propia`: `with check ((select auth.uid()) = usuario_id)`;
  - sin UPDATE ni DELETE. Una TRM publicada no cambia.
- `valor_cent` no se cifra: es un dato público, no un monto del usuario (REGLAS §4 cifra importes).
- Sin historial de cambios: las filas no se modifican.

### Fuente

- Dataset «Tasa de Cambio Representativa del Mercado - TRM» de la Superintendencia Financiera en datos.gov.co (`32sa-8pi3`). Es abierto y no pide clave.
- Consulta de la fila que cubre la fecha F:
  `GET https://www.datos.gov.co/resource/32sa-8pi3.json?$where=vigenciadesde <= 'F' AND vigenciahasta >= 'F'&$limit=1`, con F como `YYYY-MM-DDT00:00:00.000` y la consulta codificada en la URL.
- Fila recibida: `{"valor":"3461.92","unidad":"COP","vigenciadesde":"2026-11-21T00:00:00.000","vigenciahasta":"2026-11-23T00:00:00.000"}`.
  - `valor` es un string con hasta dos decimales y sin ceros finales (`"3415.1"`).
  - Las fechas no traen zona: se toman los 10 primeros caracteres.
- `fetch` nativo con `AbortSignal.timeout(3000)`, sin reintentos. La respuesta se valida con Zod.
- **Falla** es cualquiera de estos casos: error de red, timeout, estado distinto de 200, JSON con otra forma, lista vacía, `unidad` distinta de `COP` o `valor` inválido. La fuente devuelve `null` y deja un aviso con `Logger.warn`, sin datos del usuario.
- La URL es una constante del archivo. No hay variable de entorno.

### Reglas del dominio (`src/domain/trm/`)

- **`parsearValor(texto): bigint | null`:**
  - acepta `^\d{1,6}(\.\d{1,2})?$` y lo pasa a centavos con aritmética de enteros, sin `Number` ni `parseFloat`;
  - `"3461.92"` → `346192n`, `"3415.1"` → `341510n` y `"3316"` → `331600n`;
  - cualquier otra cosa, o `0`, → `null`.
- **`formatearValor(cent): string`:** siempre con dos decimales: `346192n` → `"3461.92"` y `341510n` → `"3415.10"`.
- **`cubre(trm, fecha)`:** `vigenteDesde ≤ fecha ≤ vigenteHasta`.
- **`resolverTrm(guardada, obtenida, fecha)`**, la regla de respaldo:
  - si `guardada` cubre `fecha`, la devuelve con `desactualizada: false`;
  - si no, y `obtenida` no es nula, devuelve `obtenida` con `desactualizada: false`;
  - si no, y `guardada` no es nula, la devuelve con `desactualizada: true`;
  - si no, devuelve `trm: null` con `desactualizada: false`.
  - `guardada` es la fila en caché con mayor `vigenteDesde ≤ fecha`.

```ts
// src/domain/trm/trm.ts
/** Valor en centavos de peso por US$ 1. Fechas "YYYY-MM-DD". */
type Trm = { valorCent: bigint; vigenteDesde: string; vigenteHasta: string };
type TrmResuelta = { trm: Trm | null; desactualizada: boolean };
```

### Flujo de `TrmService.en(token, fecha)`

1. `TrmRepository.ultimaHasta(token, fecha)`: la fila con mayor `vigente_desde ≤ fecha`, o `null`.
2. Si cubre `fecha`, se usa sin llamar a la fuente.
3. Si no, `TrmFuente.obtenerEn(fecha)`. Si devuelve una fila, `TrmRepository.guardar(token, trm)` la inserta con `upsert(…, { onConflict: "usuario_id,vigente_desde", ignoreDuplicates: true })`. Dos peticiones simultáneas no chocan.
4. `resolverTrm(guardada, obtenida, fecha)`.
5. Si la fuente devolvió una fila pero guardarla falla, se responde con ella igual y queda un aviso en el log. La caché es una optimización y no debe tumbar la lectura.

`GET /trm` llama a `en(token, hoy)`. `hoy` es `fechaLocal(new Date(), zona)`, con la zona del perfil o la zona por defecto, como en SPEC 06.

### Contrato HTTP

Convenciones de `docs/api/README.md`.

```ts
type TrmDto = {
  valor: string;            // "3461.92": COP por US$ 1, siempre con dos decimales
  vigenteDesde: string;     // "YYYY-MM-DD"
  vigenteHasta: string;     // "YYYY-MM-DD"; puede ser posterior a vigenteDesde (fin de semana)
  fuente: string;           // "Superintendencia Financiera de Colombia"
};

type TrmVigenteDto = {
  fechaHoy: string;         // "YYYY-MM-DD" en la zona del usuario
  trm: TrmDto | null;       // null si nunca se obtuvo ninguna
  desactualizada: boolean;  // true: la fuente falló y trm es la última conocida, que no cubre hoy
};
```

| Método y ruta | Cuerpo / consulta | Respuesta |
|---|---|---|
| `GET /trm` | — | `200 TrmVigenteDto` |

- `fuente` es una constante del DTO, porque hoy hay una sola fuente.
- La fecha que muestra la interfaz («11 nov 2026») es `vigenteDesde`.
- Con `desactualizada: true`, el cliente indica que la tasa no es la de hoy.
- Con `trm: null`, el cliente no muestra equivalentes en COP.
- La falla de la fuente nunca es un error HTTP.

### Errores nuevos

Ninguno. `GET /trm` solo puede dar `NO_AUTENTICADO` y `ERROR_INTERNO` (falla de Supabase al leer la caché).

## Estructura de archivos

```
supabase/migrations/<timestamp>_trm.sql
src/
  app.module.ts                        # + TrmModule
  trm/
    trm.controller.ts                  # GET /trm
    trm.service.ts                     # en(token, fecha); exportado
    trm.module.ts                      # provee TrmService, TrmRepository, TrmFuente, PerfilesRepository
    dto.ts
  domain/trm/
    trm.ts                             # tipos
    valor.ts (+ .test.ts)              # parsearValor, formatearValor
    vigente.ts (+ .test.ts)            # cubre, resolverTrm
  repositories/
    datos-gov/
      trm.fuente.ts (+ .test.ts)       # TrmFuente.obtenerEn; aTrm(json) puro
    supabase/
      trm.repository.ts                # ultimaHasta, guardar
      tipos.ts                         # regenerado
test/
  utilidades.ts                        # crearApp acepta reemplazar proveedores
  aislamiento.e2e-spec.ts              # ampliado (no se borra ni se desactiva)
  trm.e2e-spec.ts
docs/api/
  trm.md, README.md
REGLAS.md (y ../Tino-web/REGLAS.md)    # §7
```

Dirección: controller → service → `domain/`, con los repositorios detrás del servicio. `domain/` no importa Nest, Zod ni Supabase.

## Plan de implementación

1. Enmendar REGLAS §7 en `tino-api` y `../Tino-web`: inversiones pasa de «Diseñado pero no construir todavía» a «Construir ahora». Los dos archivos quedan idénticos.
2. Escribir `supabase/migrations/<timestamp>_trm.sql` según el modelo. **El autor la revisa antes del paso 3** (REGLAS §8).
3. Aplicarla con `apply_migration` sobre Tino dev. Correr `get_advisors` (security y performance) y corregir los avisos en una migración nueva. Regenerar `tipos.ts`.
4. Ampliar `test/aislamiento.e2e-spec.ts`. Con dos usuarios, cada uno con una fila en `trm`:
   - cada uno ve solo la suya;
   - un INSERT con `usuario_id` ajeno falla;
   - UPDATE y DELETE, propios o ajenos, afectan 0 filas.
   - `npm test` en verde.
5. `domain/trm/trm.ts` y `valor.ts`, con pruebas:
   - `"3461.92"`→`346192n`, `"3415.1"`→`341510n`, `"3316"`→`331600n`;
   - `"0"`, `"-1"`, `"3461.925"`, `"3.461,92"`, `""` y `"abc"` dan `null`;
   - `341510n`→`"3415.10"`.
6. `vigente.ts` con pruebas: `cubre` en los dos bordes, y los cuatro casos de `resolverTrm`.
7. `repositories/datos-gov/trm.fuente.ts`:
   - `aTrm(json)` puro, probado con las filas reales de arriba;
   - casos `null`: lista vacía, `unidad: "USD"`, `valor` inválido y forma inesperada;
   - `TrmFuente.obtenerEn(fecha)` arma la URL, aplica el timeout y devuelve `null` ante cualquier falla.
8. `repositories/supabase/trm.repository.ts` con `ultimaHasta` y `guardar` (cliente del usuario, `paraUsuario`).
9. `src/trm/` con `TrmService.en`, `GET /trm` y el registro en `app.module.ts`.
10. `crearApp` acepta reemplazos de proveedores (`overrideProvider`). `test/trm.e2e-spec.ts` usa una `TrmFuente` falsa que cuenta llamadas. Se omite con aviso si falta `SUPABASE_SECRET_KEY`, como las demás.
11. `docs/api/trm.md` y su fila en `README.md`.

## Tabla de cobertura

| N-xx | Cobertura |
|---|---|
| N-01 | `GET /trm` → `trm.valor` y `trm.vigenteDesde`. |
| N-02 | Fuera de alcance: avisos (REGLAS §7). |
| N-03 | Fuera de alcance: REGLAS §7; Metas no figura en REGLAS. |
| N-04 | Ya cubierto por SPEC 04. |
| N-05, N-06 | SPEC 10 (cuenta de inversión). |
| N-07 | TRM, fecha y fuente: `GET /trm` → `trm.valor`, `vigenteDesde` y `fuente`. Que aplique solo a cuentas USD: SPEC 10. |
| N-08 – N-32 | SPEC 10 (valoración, posiciones, efectivo y precio manual). Los equivalentes en COP usan `TrmService.en`. |
| N-33 | SPEC 11 (clase de activo y fecha de precio automático). |
| N-34 – N-37 | SPEC 10. |
| N-38 | `GET /trm` no depende de cuentas: responde igual sin cuentas de inversión. |
| N-39 – N-47 | SPEC 10. |
| N-48, N-50 | SPEC 11. |
| N-49 | SPEC 10 (activo manual). |
| N-51 | `TrmService.en` trae la TRM sola, la primera vez que se pide cada vigencia. |
| N-52 | Parte TRM: `resolverTrm` → última conocida con `desactualizada: true`. Parte precios: SPEC 11. |
| N-53 | SPEC 10. |
| N-54 | Parte TRM: `TrmService.en(token, fecha)` con cualquier fecha (sin endpoint). Parte precios: SPEC 10 y 11. |
| N-55 – N-73 | SPEC 10. |
| N-74 | `GET /trm` (la misma TRM en la cabecera de Cuentas). |
| N-75 | SPEC 10. |
| N-76 | Fuera de alcance: dividendos (duda resuelta en el inventario). |
| N-77 | Fuera de alcance: solo fondeo COP↔inversión (duda resuelta en el inventario). |
| N-78 | Fuera de alcance: comisión dentro del precio (duda resuelta en el inventario). |

Endpoint → N-xx:

- `GET /trm`: N-01, N-07, N-38, N-74.

La N-01 de los inventarios de cuentas, captura, resumen, recurrentes y deudas pedía lo mismo, y la N-08 de cuentas igual. Ahora las cubre `GET /trm`.

## Criterios de aceptación

`H` es hoy en la zona del perfil. La fuente falsa devuelve `{ valor: "3461.92", vigenciadesde: H, vigenciahasta: H+2 }`, salvo que se indique otra cosa.

- [ ] `npm test`, `npm run lint` y `npm run typecheck` pasan.
- [ ] REGLAS §7 dice lo mismo en los dos repos e incluye inversiones en «Construir ahora».
- [ ] `list_migrations` muestra la migración y el archivo existe en `supabase/migrations/`.
- [ ] `get_advisors` (security) no reporta avisos sobre `trm`.
- [ ] `test/aislamiento.e2e-spec.ts` pasa con las comprobaciones del paso 4.
- [ ] Sin caché, `GET /trm` → `200` con:
  - `fechaHoy` `H`;
  - `trm` `{ valor: "3461.92", vigenteDesde: H, vigenteHasta: H+2, fuente: "Superintendencia Financiera de Colombia" }`;
  - `desactualizada: false`;
  - una fila en `trm` con `valor_cent` `346192`.
- [ ] Un segundo `GET /trm` responde lo mismo sin llamar a la fuente.
- [ ] Con una fila guardada `H−3`…`H−3` y la fuente fallando, `GET /trm` → esa fila con `desactualizada: true`.
- [ ] Sin caché y con la fuente fallando, `GET /trm` → `200` con `trm: null` y `desactualizada: false`.
- [ ] Con `valor: "3415.1"` en la fuente, `GET /trm` → `valor: "3415.10"`.
- [ ] Dos `GET /trm` simultáneos sin caché responden `200` y dejan una sola fila.
- [ ] Sin token, `GET /trm` → `401 NO_AUTENTICADO`.
- [ ] `aTrm` convierte las filas reales de la fuente citadas en este spec.
- [ ] Ningún archivo de `src/domain/` importa `@nestjs/*`, `zod` ni `@supabase/*`. Ningún valor de TRM pasa por `number`.
- [ ] Ningún archivo fuera de `src/repositories/datos-gov/` contiene `datos.gov.co`.
- [ ] `docs/api/trm.md` existe y `README.md` lo enlaza.

## Decisiones

- **Sí:** el inventario se parte en tres specs: TRM, cuentas de inversión y precios automáticos. **No:** un solo spec, porque tocaría más de tres áreas.
- **Sí:** la TRM se trae bajo demanda y se guarda en una caché por usuario, con RLS y el token del usuario. **No:** un job con `pg_cron` y `pg_net`, porque parsear HTTP en SQL saca lógica de Nest. **No:** un worker aparte con `service_role`, porque es otro proceso y otra credencial. **No:** una tabla global escribible por cualquier usuario, porque uno podría envenenar la TRM de todos.
- **Sí:** datos.gov.co (Superintendencia Financiera) y rótulo «Superintendencia Financiera de Colombia». **No:** el rótulo «Banco de la República» del diseño: la TRM la certifica la Superfinanciera.
- **Sí:** una fila por vigencia, igual que la fuente. **No:** una fila por día (más filas y una expansión que no aporta).
- **Sí:** `valor_cent integer` en centavos de peso, `bigint` en el dominio y string con dos decimales en el contrato. **No:** `numeric` (obliga a parsear decimales). **No:** cifrarlo, porque es un dato público.
- **Sí:** solo SELECT e INSERT, sin historial: una TRM publicada no cambia (RN-13 aplica a datos del usuario).
- **Sí:** la última conocida como respaldo, con `desactualizada`, y `trm: null` si nunca hubo ninguna. **No:** un `503`: la falta de TRM no debe tumbar pantallas que muestran pesos.
- **Sí:** `fetch` nativo con timeout de 3 s, sin reintentos y sin dependencias. **No:** `@nestjs/resilience` por ahora. Reintentar suma latencia cuando la fuente está caída, y la caché ya amortigua.
- **Sí:** la fuente vive en `src/repositories/datos-gov/` y es inyectable. Las e2e la reemplazan por una falsa. **No:** e2e contra la fuente real (frágiles y lentas). La forma real queda fijada en las pruebas de `aTrm`.
- **Sí:** `TrmService.en(token, fecha)` acepta cualquier fecha (N-54), aunque `GET /trm` solo pida hoy. SPEC 10 lo usa para los equivalentes y el patrimonio histórico. **No:** `GET /trm?fecha=`: ninguna N-xx lo pide.
- **Sí:** `fuente` como constante del DTO. **No:** una columna `fuente` mientras haya una sola.
- **Sí:** la URL de la fuente como constante. **No:** una variable de entorno, porque no cambia entre entornos.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| datos.gov.co cambia la forma del dataset o lo retira | `aTrm` valida con Zod y devuelve `null`. Entra la última conocida con `desactualizada: true` y un aviso en el log. Cambiar de fuente solo toca `trm.fuente.ts`. |
| La fuente está lenta y frena cada petición sin caché del día | Timeout de 3 s. Solo pasa una vez por vigencia y por usuario: después se lee de la caché. |
| La fuente cae varios días y cada `GET /trm` paga el timeout | Aceptado a escala personal. Si molesta, un spec futuro guarda el último intento fallido. |
| Un usuario inserta una TRM falsa en su caché por PostgREST | Solo afecta sus propios equivalentes (RN-12 intacta), igual que el riesgo aceptado en SPEC 08. |
| `hoy` del usuario no coincide con el día de Colombia (otra zona) | La vigencia se busca con el `hoy` del perfil, coherente con el resto de la API. Con un día de diferencia se usa la TRM vecina, que es correcta para ese día local. |
| Inserciones simultáneas de la misma vigencia | `ignoreDuplicates` sobre la PK: la segunda no hace nada. |

## Lo que **no** entra en este spec

- Cuentas de inversión, posiciones, operaciones, fondeo, patrimonio y resumen (SPEC 10).
- Precios automáticos de activos (SPEC 11).
- TRM de una fecha pasada por HTTP, y lecturas de varias fechas en una consulta.
- Otras monedas.
- Reintentos y cortacircuitos contra la fuente.

Cada uno, si llega, va en su propio spec.
