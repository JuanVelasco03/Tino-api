# SPEC 06 — Resumen del mes

> **Estado:** Aprobado
> **Depende de:** SPEC 03, SPEC 04, SPEC 05
> **Fecha:** 2026-11-21
> **Objetivo:** Que `GET /resumen?mes=` dé las cifras de un mes (ingresos, gastos, resultado y gasto por categoría, comparados con el mes anterior), la serie de patrimonio de 12 meses y el puente del patrimonio del mes, todo calculado por la API.

## Por qué existe este spec

Es el primer informe. REGLAS §7 se enmendó para que entre el resumen del mes; los demás informes siguen fuera.

Fija dos patrones:

- **El patrimonio a una fecha se calcula, no se guarda** (RN-01). Se reconstruye desde las cuentas, el historial de saldo inicial (`cuentas_cambios`) y los movimientos con fecha hasta ese día. No hay fotos de cierre de mes.
- **La API envía las cifras derivadas** (variaciones y porcentajes). Web y celular muestran lo mismo sin repetir lógica. Los porcentajes viajan como enteros en décimas, sin coma flotante.

Con los montos cifrados (SPEC 05), Postgres no suma. Todo se calcula en `src/domain/` (REGLAS §5, excepción). SQL solo filtra y trae las columnas necesarias.

Cubre el inventario `specs/necesidades/resumen.md` (ver tabla de cobertura).

## Alcance

**Entra:**

- `GET /resumen?mes=YYYY-MM`: cabecera, tres cifras comparadas, gasto por categoría, «sin categoría», patrimonio de hoy, serie de 12 puntos, cambio en el mes y datos del estado de día uno.
- Error nuevo `MES_FUTURO`.
- Dominio puro en `src/domain/resumen/` y utilidades de mes en `src/domain/fecha/mes.ts`, con pruebas unitarias.
- `src/repositories/supabase/resumen.repository.ts`: solo lecturas, sin migración.
- Módulo `src/resumen/`.
- Prueba de punta a punta `test/resumen.e2e-spec.ts`, con una comprobación de aislamiento entre dos usuarios.
- `docs/api/resumen.md` y la fila en `docs/api/README.md`.
- Ya hecho antes del spec: REGLAS §7 enmendado en `tino-api` y `../Tino-web`.

**Fuera de alcance (specs futuros):**

- TRM, avisos y entradas a otros módulos (N-01, N-02, N-03).
- Revaluación de inversiones en el puente (N-45).
- Otros informes: series por categoría, rangos libres, exportar.
- Filtro de «sin clasificar» en `GET /movimientos`: el cliente filtra la lista del mes (N-34).
- Caché o fotos de patrimonio (RN-01).
- Ajustes de saldo (RN-14). Cuando lleguen, este spec se revisa para separarlos del gasto.

## Modelo de datos

**No hay migración.** El resumen lee tablas existentes con el token del usuario (RN-19) y calcula en el dominio.

### Lecturas (`resumen.repository.ts`)

| Fuente | Columnas | Filtro |
|---|---|---|
| `cuentas` | `id, tipo, saldo_inicial, creado_en, archivada_en` | todas, también las archivadas |
| `cuentas_cambios` | `cuenta_id, valor_anterior, valor_nuevo, cambiado_en` | `campo = 'saldo_inicial'` |
| `movimientos` | `id, tipo, monto, fecha, cuenta_origen_id, cuenta_destino_id, categoria_id` | todos los del usuario |
| `movimiento_partes` | `movimiento_id, categoria_id, monto` | de los movimientos del mes y del anterior |
| `categorias` | vía `CategoriasRepository.listar` | — |
| `perfiles` | zona horaria, vía `PerfilesRepository.leerPropio` | — |

- Los montos se descifran con `CifradorMontos` y la AAD de su fila de origen (SPEC 05). El historial de `cuentas_cambios` usa la AAD de `cuentas.saldo_inicial`.
- Las consultas corren en paralelo.

### Definiciones (dominio)

Todas las fechas son días calendario `"YYYY-MM-DD"` en la zona del perfil. `creado_en` y `cambiado_en` se pasan a día local con `fechaLocal`.

- **Mes mostrado** `M`. **Mes anterior** `M−1`. Rango de `M`: `rangoDelMes(M)`.
- **Ingresos / gastos de un mes:** suma de `monto` de los movimientos `ingreso` / `gasto` con fecha en el mes. Las transferencias no cuentan (RN-05, RN-07).
- **Resultado:** ingresos − gastos.
- **Gasto por categoría:** un gasto con `categoria_id` suma a su categoría. Un gasto dividido suma cada parte a la categoría de la parte. Un gasto sin categoría ni partes suma a «sin categoría».
- **Cantidad de movimientos:** todos los del mes, de cualquier tipo, también los de cuentas archivadas. Coincide con `GET /movimientos?mes=`.
- **Saldo inicial vigente de una cuenta en la fecha F:**
  - Se toma el último cambio con día local ≤ F y se usa su `valor_nuevo`.
  - Si no hay ninguno, se toma el primer cambio posterior y se usa su `valor_anterior`.
  - Si no hay cambios, vale `saldo_inicial`.
- **Patrimonio en la fecha F:** se suma cada cuenta con día local de `creado_en` ≤ F, archivadas incluidas. Cada cuenta aporta su saldo inicial vigente en F más el efecto de sus movimientos con fecha ≤ F (`calcularSaldo`). Los activos suman y los pasivos restan (`naturalezaDe`).
- **Inicio:** el día local de creación de la cuenta más antigua, archivadas incluidas. Es `null` sin cuentas.
- **Serie:** el patrimonio en el último día de cada uno de los 11 meses anteriores al mes actual, más el de hoy. Se omiten los puntos con fecha anterior al inicio. Va en orden ascendente y el último punto es hoy.
- **Cambio en el mes:**
  - `patrimonioAnterior` = patrimonio en el último día de `M−1`.
  - `patrimonioCierre` = patrimonio en el último día de `M`.
  - `resultado` = resultado de `M`.
  - `otrosCambios` = cierre − anterior − resultado. Recoge los saldos iniciales de cuentas creadas en el mes, las ediciones de saldo inicial del mes y los movimientos fechados antes de crear su cuenta.
- **Variación:** actual − anterior.
- **Porcentaje en décimas:** `round(1000 × parte / total)`, con redondeo half-up lejos de cero, calculado con `bigint`. 274 = 27,4 %. Es `null` si el total es cero.
- **Variación porcentual:** `round(1000 × (actual − anterior) / |anterior|)`. Es `null` si el anterior es cero.

### Tipos de dominio (`src/domain/resumen/resumen.ts`)

```ts
type Comparacion = { actual: bigint; anterior: bigint; variacion: bigint; variacionPorcentaje: number | null };
type CategoriaDelMes = { categoriaId: string; monto: bigint; anterior: bigint; variacion: bigint; porcentaje: number | null };
type ResumenMes = {
  cantidadMovimientos: number;
  ingresos: Comparacion; gastos: Comparacion; resultado: Comparacion;
  categorias: CategoriaDelMes[];
  sinCategoria: Omit<CategoriaDelMes, "categoriaId"> & { cantidad: number };
};
type PuntoPatrimonio = { fecha: string; patrimonio: bigint };
```

### Contrato HTTP

Convenciones de `docs/api/README.md`. Montos como string entero (con guion ASCII si son negativos). Fechas `"YYYY-MM-DD"` en la zona del usuario. **Excepción documentada:** los porcentajes de este módulo son enteros en décimas y pueden ser negativos o pasar de 1000.

```ts
type Ref = { id: string; nombre: string };
type ComparacionDto = { actual: string; anterior: string; variacion: string; variacionPorcentaje: number | null };
type CategoriaResumenDto = { categoria: Ref; monto: string; anterior: string; variacion: string; porcentaje: number | null };

type ResumenDto = {
  mes: string;                  // "YYYY-MM"
  mesAnterior: string;          // "YYYY-MM"
  desde: string;                // primer día del mes
  hasta: string;                // último día del mes
  fechaHoy: string;
  inicio: string | null;        // punto de partida; null sin cuentas
  tieneMovimientos: boolean;    // false → estado de día uno
  cuentasActivas: number;       // no archivadas
  cantidadMovimientos: number;
  ingresos: ComparacionDto;
  gastos: ComparacionDto;
  resultado: ComparacionDto;
  categorias: CategoriaResumenDto[];
  sinCategoria: { monto: string; anterior: string; variacion: string; porcentaje: number | null; cantidad: number };
  patrimonio: {
    hoy: string;
    serie: { fecha: string; patrimonio: string }[];   // ascendente; último = hoy; 1 a 12 puntos ([] sin cuentas)
    variacionSerie: string;                           // último − primero; "0" con menos de dos puntos
  };
  cambioDelMes: {
    fechaAnterior: string;      // último día de M−1
    fechaCierre: string;        // último día de M
    patrimonioAnterior: string;
    resultado: string;
    otrosCambios: string;
    patrimonioCierre: string;
  };
};
```

| Método y ruta | Consulta | Respuesta |
|---|---|---|
| `GET /resumen` | `?mes=YYYY-MM` (opcional: mes actual en la zona del usuario) | `200 ResumenDto` |

- `categorias`: las que tienen gasto en `M` o en `M−1`, sin «sin categoría». Van por `monto` desc, luego `anterior` desc y luego `posicion` de la categoría.
- `sinCategoria` está siempre presente, aunque sea con ceros. El cliente decide si mostrarla.
- `porcentaje` de cada categoría y de `sinCategoria`: parte de `gastos.actual`.
- Un mes anterior al inicio responde con ceros, sin error. El cliente oculta «‹» cuando `desde` ≤ `inicio`.
- «Clasificar» (N-34): el cliente filtra `GET /movimientos?mes=` por `tipo = "gasto"`, `categoria = null` y `partes = []`, y edita con `PUT /movimientos/:id`.

### Errores nuevos

| `codigo` | Estado | `campo` | `mensaje` |
|---|---|---|---|
| `MES_FUTURO` | 400 | `mes` | «Ese mes todavía no llega.» |

Se reutilizan `MES_INVALIDO`, `NO_AUTENTICADO`, `ENTRADA_INVALIDA` y `ERROR_INTERNO`.

## Estructura de archivos

```
src/
  app.module.ts                          # + ResumenModule
  comun/error-api.ts                     # + MES_FUTURO
  resumen/
    resumen.controller.ts                # GET /resumen
    resumen.service.ts
    resumen.module.ts
    esquemas.ts                          # Zod: ?mes
    dto.ts
  domain/
    fecha/mes.ts (+ mes.test.ts)         # + mesAnterior, ultimoDia, mesesAnteriores
    resumen/
      resumen.ts                         # tipos
      porcentaje.ts (+ .test.ts)         # porcentajeEnDecimas, variacionPorcentual
      mes.ts (+ .test.ts)                # resumirMes: cifras, categorías, sin categoría
      patrimonio.ts (+ .test.ts)         # saldoInicialVigente, patrimonioEn, serie, cambioDelMes
  repositories/supabase/
    resumen.repository.ts
test/
  resumen.e2e-spec.ts
docs/api/
  resumen.md, README.md
```

Dirección: controller → service → `domain/`, con los repositorios detrás del servicio. `domain/` no importa Nest, Zod ni Supabase.

## Plan de implementación

1. `domain/fecha/mes.ts`: `mesAnterior("2026-01")` → `"2025-12"`, `ultimoDia("2026-02")` → `"2026-02-28"`, `mesesAnteriores("2026-11", 11)` → `"2025-12"` … `"2026-10"`. Con pruebas.
2. `domain/resumen/porcentaje.ts` con pruebas:
   - 260000/300000 → 867.
   - 1/3 → 333.
   - 5/1000 → 5.
   - Total 0 → `null`.
   - Variación de 1.580.000 a −300.000 → −1190.
   - Anterior negativo: se divide por su valor absoluto.
3. `domain/resumen/mes.ts`: `resumirMes(movimientos, partes, categorias, M)` con pruebas:
   - Las transferencias no suman.
   - El gasto dividido se reparte entre sus partes.
   - Una categoría con gasto solo en `M−1` aparece con 0.
   - Orden, `sinCategoria.cantidad` y `cantidadMovimientos` con transferencias.
4. `domain/resumen/patrimonio.ts` con pruebas:
   - Saldo inicial vigente antes, entre y después de dos ediciones.
   - Una cuenta creada después de F no cuenta.
   - Un pasivo resta.
   - Una cuenta archivada cuenta en el pasado.
   - Los puntos de la serie anteriores al inicio se omiten.
   - El puente cuadra.
   - Con una cuenta creada en el mes, su saldo inicial queda en `otrosCambios`.
5. `MES_FUTURO` en `error-api.ts`.
6. `resumen.repository.ts`: lecturas en paralelo y descifrado. Sin escrituras.
7. `src/resumen/`:
   - El servicio resuelve la zona y `hoy` y valida que `M` no sea posterior al mes actual (`MES_FUTURO`).
   - Llama al dominio y arma el DTO.
   - `?mes` usa el esquema de `GET /movimientos` (`MES_INVALIDO`).
8. `test/resumen.e2e-spec.ts` con los criterios de aceptación. Se omite con aviso si falta `SUPABASE_SECRET_KEY`. Usa el cliente de servicio solo para fechar `creado_en` en el pasado.
9. `docs/api/resumen.md` y la fila en `README.md`, con la excepción de los porcentajes en décimas.

## Tabla de cobertura

| N-xx | Cobertura |
|---|---|
| N-01 | Fuera de alcance: USD hasta inversiones. |
| N-02 | Fuera de alcance: avisos (REGLAS §7). |
| N-03 | Fuera de alcance: REGLAS §7; Metas no figura en REGLAS. |
| N-04 | Ya cubierto por SPEC 04 (`GET /captura`, `POST /movimientos`). |
| N-05 | `GET /resumen` sin `mes` → mes actual (`mesLocal`). |
| N-06 | `ResumenDto.mes`. |
| N-07 | `?mes=` con `mesAnterior`. |
| N-08 | `?mes=` con el mes siguiente. |
| N-09 | `MES_FUTURO`. |
| N-10 | `MES_INVALIDO`. |
| N-11 | `ResumenDto.desde`, `hasta`. |
| N-12 | `ResumenDto.cantidadMovimientos`. |
| N-13 | `ResumenDto.mesAnterior`. |
| N-14 | `ingresos.actual`. |
| N-15 | `gastos.actual`. |
| N-16 | `resultado.actual`. |
| N-17 | `ComparacionDto.anterior`. |
| N-18 | `ComparacionDto.variacion`. |
| N-19 | `ComparacionDto.variacionPorcentaje` (décimas). |
| N-20 | `variacionPorcentaje: null` con anterior cero. |
| N-21 | `resumirMes` solo suma `ingreso` y `gasto`. |
| N-22 | Se leen los movimientos de todas las cuentas, archivadas incluidas. |
| N-23 | `categorias[].categoria`, `monto`. |
| N-24 | `categorias[].porcentaje`. |
| N-25 | `categorias[].anterior`. |
| N-26 | `categorias[].variacion`. |
| N-27 | `categorias`: con gasto en `M` o `M−1`. |
| N-28 | Orden de `categorias`; `sinCategoria` aparte. |
| N-29 | `sinCategoria.monto`, `porcentaje`, `anterior`, `variacion`. |
| N-30 | `resumirMes` reparte por `movimiento_partes`. |
| N-31 | `gastos` (mismas cifras). |
| N-32 | `sinCategoria.porcentaje`. |
| N-33 | `sinCategoria.cantidad`. |
| N-34 | `GET /movimientos?mes=` (SPEC 04), que el cliente filtra; `PUT /movimientos/:id`. |
| N-35 | `patrimonio.hoy`. |
| N-36 | `patrimonio.serie`. |
| N-37 | La serie se calcula desde `fechaHoy`, no desde `mes`. |
| N-38 | `patrimonio.variacionSerie`. |
| N-39 | `serie[0].fecha` y el último punto. |
| N-40 | `patrimonioEn` con cuentas creadas hasta F, saldo inicial vigente y movimientos ≤ F. |
| N-41 | `patrimonioEn` incluye las cuentas archivadas. |
| N-42 | La serie omite los puntos anteriores a `inicio`. |
| N-43 | `cambioDelMes.patrimonioAnterior`, `fechaAnterior`. |
| N-44 | `cambioDelMes.resultado`. |
| N-45 | Fuera de alcance: inversiones (REGLAS §7). |
| N-46 | `cambioDelMes.otrosCambios`. |
| N-47 | `cambioDelMes.patrimonioCierre`, `fechaCierre`. |
| N-48 | `otrosCambios` = cierre − anterior − resultado; prueba de dominio. |
| N-49 | Mes sin movimientos → ceros, con `tieneMovimientos` según el historial completo. |
| N-50 | Estados HTTP y `ErrorApi`. La carga es del cliente. |
| N-51 | Montos como string entero; porcentajes enteros en décimas. |
| N-52 | Todo se calcula en `src/domain/resumen/`. |
| N-53 | Lecturas con el token del usuario (RLS); comprobación de dos usuarios en la e2e. |
| N-54 | `tieneMovimientos`. |
| N-55 | `cuentasActivas`. |
| N-56 | Las tres `ComparacionDto` en cero. |
| N-57 | `categorias: []`. |
| N-58 | `inicio` y `patrimonio.serie` con un solo punto. |
| N-59 | `inicio`: el cliente oculta la navegación cuando `desde` ≤ `inicio`. |
| N-60 | Ya cubierto por SPEC 04. |
| N-61 | Ya cubierto por SPEC 03 (`POST /cuentas`). |
| N-62 | Los saldos iniciales no son movimientos; entran en `otrosCambios`. |

Endpoint → N-xx: `GET /resumen` (N-05, N-14, N-23, N-36, N-43, N-54).

## Criterios de aceptación

Escenario e2e. `M` es el mes actual y `M−1` el anterior. Las cuentas Nequi (banco, saldo inicial `"1000000"`) y Tarjeta (`tarjeta_credito`, `"0"`, cupo `"4000000"`) tienen `creado_en` fechado el día 1 de `M−1`. Movimientos:

- En `M−1`:
  - ingreso de `"2000000"` (Salario) a Nequi;
  - gasto de `"300000"` en Comida desde Nequi;
  - gasto de `"20000"` en Transporte desde Nequi;
  - gasto de `"100000"` sin categoría con la Tarjeta;
  - transferencia de `"50000"` de Nequi a la Tarjeta.
- El día 1 de `M`:
  - gasto de `"200000"` en Comida desde Nequi;
  - gasto de `"90000"` con la Tarjeta, dividido en Comida `"60000"` y Mercado `"30000"`;
  - gasto de `"10000"` sin categoría desde Nequi.

Con ese escenario:

- [ ] `npm test`, `npm run lint` y `npm run typecheck` pasan.
- [ ] `GET /resumen` sin `mes` responde el mes actual. `?mes=2026-13` → `400 MES_INVALIDO`. El mes siguiente al actual → `400 MES_FUTURO`.
- [ ] `GET /resumen?mes=M`:
  - `cantidadMovimientos` es 3.
  - `ingresos`: `{ actual: "0", anterior: "2000000", variacion: "-2000000", variacionPorcentaje: -1000 }`.
  - `gastos`: `{ "300000", "420000", "-120000", -286 }`.
  - `resultado`: `{ "-300000", "1580000", "-1880000", -1190 }`.
- [ ] `categorias` va en este orden: Comida (`"260000"`, anterior `"300000"`, porcentaje 867), Mercado (`"30000"`, anterior `"0"`, porcentaje 100) y Transporte (`"0"`, anterior `"20000"`, variación `"-20000"`, porcentaje 0).
- [ ] `sinCategoria` es `{ monto: "10000", anterior: "100000", variacion: "-90000", porcentaje: 33, cantidad: 1 }`.
- [ ] `cambioDelMes` de `M`: anterior `"2580000"`, resultado `"-300000"`, otros `"0"` y cierre `"2280000"`. `patrimonio.hoy` es `"2280000"`.
- [ ] La serie tiene dos puntos: el último día de `M−1` con `"2580000"` y hoy con `"2280000"`. `variacionSerie` es `"-300000"`.
- [ ] Tras `PATCH` de Nequi con `saldoInicial: "1100000"`, `M` da otros `"100000"` y cierre `"2380000"`. El punto de `M−1` sigue en `"2580000"`.
- [ ] Tras crear Efectivo con `"45000"`, `M` da otros `"145000"` y `cuentasActivas` es 3.
- [ ] `GET /resumen?mes=M−1`: anterior `"0"`, resultado `"1580000"`, otros `"1000000"` y cierre `"2580000"`. El saldo inicial vigente en `M−1` sigue siendo el de antes de la edición.
- [ ] Un mes anterior a `M−1` responde `200` con cifras y puente en cero.
- [ ] Usuario nuevo con una cuenta de `"975372"` y sin movimientos:
  - `tieneMovimientos: false`;
  - las tres cifras en `"0"`, con `variacionPorcentaje: null`;
  - `categorias: []`;
  - la serie tiene un punto: hoy, con `"975372"`;
  - `inicio` es hoy.
- [ ] Un segundo usuario recibe su resumen sin ninguna cifra del primero.
- [ ] Ningún porcentaje del DTO es un número con decimales.
- [ ] Ningún archivo de `src/domain/` importa `@nestjs/*`, `zod` ni `@supabase/*`. Ningún monto pasa por `number`.
- [ ] `docs/api/resumen.md` existe y `README.md` lo enlaza.

## Decisiones

- **Sí:** se enmienda REGLAS §7 para que entre el resumen del mes. **No:** construir otros informes.
- **Sí:** una sola ruta, `GET /resumen?mes=`. **No:** separar la serie: serían dos llamadas al abrir y la recalcularía igual.
- **Sí:** el patrimonio a una fecha se reconstruye en cada consulta. **No:** fotos de cierre de mes (RN-01).
- **Sí:** cada cuenta cuenta desde su creación (día local de `creado_en`). **No:** desde siempre, ni desde su primer movimiento.
- **Sí:** el saldo inicial vigente en cada fecha se toma de `cuentas_cambios`, y los cierres pasados no cambian al editar. **No:** retroactivo.
- **Sí:** `otrosCambios` como residuo (cierre − anterior − resultado). El puente siempre cuadra y absorbe casos raros, como un movimiento fechado antes de crear su cuenta. **No:** sumar por separado altas y ediciones, que se descuadra en esos casos.
- **Sí:** la API envía variaciones y porcentajes. **No:** que cada cliente los calcule.
- **Sí:** porcentajes como enteros en décimas, con redondeo half-up y `bigint`. **No:** `number` con decimales. **No:** enteros de 0 a 100, que pierden el decimal del diseño.
- **Sí:** la variación porcentual divide por el valor absoluto del anterior, para que un resultado que empeora salga negativo. Es `null` con anterior cero.
- **Sí:** un mes futuro → `MES_FUTURO`. Un mes anterior al inicio responde ceros, y el cliente limita la navegación con `inicio`.
- **Sí:** «Clasificar» reutiliza `GET /movimientos?mes=`, que ya trae el mes completo. **No:** un filtro nuevo.
- **Sí:** `tieneMovimientos`, `cuentasActivas` e `inicio` en el DTO. **No:** que el cliente llame también a `GET /cuentas`.
- **Sí:** sin migración; lecturas de tablas existentes. **No:** una función SQL de lectura.
- **Sí:** el punto de hoy y los cierres cuentan movimientos con fecha ≤ F. Si hay movimientos con fecha futura, `patrimonio.hoy` difiere del `patrimonioNeto` de `GET /cuentas`, que los incluye (SPEC 04). Se documenta en `docs/api/resumen.md`.
- **Sí:** `cambioDelMes.patrimonioCierre` es al último día de `M`. En el mes actual coincide con hoy, salvo movimientos con fecha futura dentro del mes. El cliente lo rotula «a hoy».
- **Sí:** `categorias` desempata por `anterior` y luego por `posicion`, para que el orden sea estable.
- **Sí:** una cuenta eliminada (nunca tuvo movimientos) desaparece también de los cierres pasados. Eliminar equivale a que no existió.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Cada consulta trae todos los movimientos del usuario a memoria | Mismas tres o cuatro columnas que `GET /cuentas`. A escala personal sobra. Si crece, se discute en otro spec, sin guardar saldos (RN-01). |
| El día local de `creado_en` o `cambiado_en` depende de la zona actual del perfil | Si el usuario cambia de zona, una cuenta puede moverse de día en el borde. Es aceptable, se documenta y se prueba con `America/Bogota`. |
| Redondeo de porcentajes: la suma de categorías puede no dar 1000 | Lo normal en un informe. El cliente muestra «100 %» en el total sin sumar filas. |
| Fechar `creado_en` en la e2e exige el cliente de servicio | Solo en las pruebas, como ya hacen las de montos cifrados. La API nunca lo usa (REGLAS §4). |

## Lo que **no** entra en este spec

- TRM, avisos, inversiones y revaluación.
- Otros informes, rangos libres o exportación.
- Filtro de «sin clasificar» en `GET /movimientos`.
- Caché o fotos de patrimonio.
- Ajustes de saldo.

Cada uno, si llega, va en su propio spec.
