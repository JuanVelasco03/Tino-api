# SPEC 05 — Montos cifrados en la base de datos

> **Estado:** Implementado
> **Depende de:** SPEC 03, SPEC 04
> **Fecha:** 2026-11-21
> **Objetivo:** Que todo monto (movimientos, partes, saldo inicial, cupo e historial) se guarde cifrado por la API, de modo que quien acceda a la base de datos no vea cifras.

## Por qué existe este spec

La amenaza es el acceso a la base: el panel de Supabase, un respaldo o una clave filtrada.
Supabase ya cifra el disco, pero eso no protege de quien lee la BD.
Por eso la clave vive solo en el entorno de la API y Postgres nunca ve un monto en claro.

Esto rompe tres patrones vigentes, y el spec los cambia a propósito:

- REGLAS §5 dice que la analítica se hace en SQL. Con montos cifrados, Postgres no puede sumar, así que el saldo (RN-01, RN-02), el gasto de hoy y el cupo (RN-18) se calculan en `src/domain/`.
- REGLAS §6 pide `NUMERIC`. En la BD el monto pasa a `text` cifrado y en memoria sigue siendo `bigint`.
- Las validaciones numéricas en SQL (`monto > 0`, partes que suman el total, `saldo_inicial >= 0`, `cupo > 0`) se van de la BD. Quedan solo en el dominio, donde ya existen (`validarMovimiento`, `validarCuenta`).

REGLAS.md se actualiza en los dos repositorios antes del código.

## Alcance

**Entra:**

- Cifrado AES-256-GCM en la API de: `movimientos.monto`, `movimiento_partes.monto`, `cuentas.saldo_inicial`, `cuentas.cupo`, `cuentas_cambios.valor_anterior` y `valor_nuevo`, y los montos dentro de las fotos de `movimientos_cambios`.
- Clave maestra `CLAVE_MONTOS_V1` y clave por usuario derivada con HKDF-SHA256.
- Formato versionado `v1.<iv>.<cifrado>.<tag>`. Descifrar elige la clave por versión; hoy solo existe v1.
- Relleno a 19 dígitos y AAD atada a usuario, tabla, columna y fila.
- La API genera el `id` de cuentas y movimientos antes de cifrar, porque la AAD lo necesita.
- Al editar, la API reutiliza el texto cifrado guardado si el monto no cambió. Así el historial en SQL no registra cambios falsos.
- Saldo por cuenta y gasto del día calculados en `src/domain/`.
- Una migración que borra los datos actuales, cambia las columnas a `text` y adapta las funciones y vistas.
- REGLAS.md actualizado en `tino-api` y `../Tino-web`.
- Pruebas unitarias del cifrador y del cálculo, más una e2e que comprueba que la BD no guarda cifras en claro.

**Fuera de alcance (para specs futuros):**

- El script de rotación que recifra todo a una clave v2.
- Cifrar textos (descripción, nota, nombres de cuenta). Rompería la categorización por reglas y los conceptos frecuentes en SQL.
- Cifrar `movimientos.tasa`.
- Convertir datos existentes: no hay datos reales y se borran.
- Cambios en el contrato HTTP o en Tino-web, salvo la copia de REGLAS.md.
- Una caché de saldos (RN-01 lo prohíbe).

## Modelo de datos

### Valor cifrado (columna `text`)

    v1.<iv>.<cifrado>.<tag>

- `v1`: versión de clave. Corresponde a `CLAVE_MONTOS_V1`.
- `iv`: 12 bytes aleatorios por valor, en base64url sin relleno.
- `cifrado`: AES-256-GCM sobre el monto en ASCII decimal con 19 dígitos y ceros a la izquierda (`"0000000000000005000"`). La longitud es siempre 19 bytes.
- `tag`: 16 bytes, en base64url.
- Restricción en la BD: `check (col ~ '^v[0-9]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{26}\.[A-Za-z0-9_-]{22}$')`. Un valor en claro escrito por error falla.

Todos los montos cifrados son enteros ≥ 0 de hasta 19 dígitos, como en `numeric(19, 0)`.

### Claves

- `CLAVE_MONTOS_V1`: 32 bytes en base64, en el entorno de la API y de las pruebas.
- La API no arranca si falta o si no decodifica a 32 bytes exactos.
- Clave del usuario: `HKDF-SHA256(ikm = maestra, salt = "tino/montos/v1", info = usuario_id, 32 bytes)`.

### AAD (datos asociados)

    <usuario_id>|<tabla>|<columna>|<id_fila>

| Valor | tabla | columna | id_fila |
|---|---|---|---|
| `movimientos.monto` | `movimientos` | `monto` | `movimientos.id` |
| `movimiento_partes.monto` | `movimiento_partes` | `monto` | `<movimiento_id>:<categoria_id>` |
| `cuentas.saldo_inicial` | `cuentas` | `saldo_inicial` | `cuentas.id` |
| `cuentas.cupo` | `cuentas` | `cupo` | `cuentas.id` |

El historial copia el texto cifrado sin tocarlo, así que conserva la AAD de su fila de origen:

- `cuentas_cambios.valor_*` usa la AAD de `cuentas.saldo_inicial`.
- Las fotos de `movimientos_cambios` usan la de su movimiento o parte.

Un cifrado movido a otra fila, columna o usuario no descifra.

### Migración `supabase/migrations/20261121120000_montos_cifrados.sql`

1. Borra los datos: `movimientos_cambios`, `movimiento_partes`, `movimientos`, `cuentas_cambios`, `perfiles.cuenta_predeterminada_id = null` y `cuentas`. Los perfiles quedan.
2. Quita la vista `cuentas_con_saldo` y la función `gastos_del_dia`.
3. Cambia a `text not null` (o `text` en `cupo`), con la restricción de formato y sin las restricciones numéricas:
   - `movimientos.monto`, `movimiento_partes.monto`
   - `cuentas.saldo_inicial` (sin default), `cuentas.cupo`. Sigue la restricción `(cupo is not null) = (tipo = 'tarjeta_credito')`.
   - `cuentas_cambios.valor_anterior`, `valor_nuevo`
4. `validar_escritura_movimiento`: quita las validaciones de monto (`> 0`, entero, suma de partes). Siguen las de cuentas, categorías y pertenencia.
5. `registrar_movimiento` y `reemplazar_movimiento`, incluidos sus envoltorios del esquema privado (migración `..._movimientos_esquema_privado.sql`):
   - `p_monto` pasa a `text`.
   - `registrar_movimiento` recibe `p_id uuid` como primer parámetro y lo usa como `id`.
   - Las partes leen `monto` como texto.
   - Mismos permisos.
6. Se recrea `movimientos_detalle` con `'monto', p.monto` (ya es texto).
7. `foto_movimiento` y el trigger de `cuentas_cambios` no cambian su lógica.

### Código

- `src/repositories/cifrado/montos.ts`: `CifradorMontos`, provider de Nest.
  - `cifrar(monto: bigint, ctx: ContextoMonto): string`
  - `descifrar(valor: string, ctx: ContextoMonto): bigint`
  - `ContextoMonto = { usuarioId, tabla, columna, idFila }`
  - Guarda en memoria las claves derivadas por usuario.
- Los repositorios cifran al escribir y descifran al leer. Los servicios y el dominio siguen con `bigint`.
- `src/domain/cuenta/saldo.ts`: `calcularSaldo(cuenta, efectos)` hace `saldo_inicial + signo × (entradas − salidas)`. El signo es 1 en un activo y −1 en un pasivo (misma fórmula que la vista retirada).
- `src/domain/movimiento/gasto-del-dia.ts`: `sumarGastos(movimientos)` suma solo los de tipo `gasto` (RN-05).
- `src/config/env.ts`: `claveMontosV1: Buffer`, validada al arrancar.
- `src/repositories/supabase/tipos.ts`: se regenera.

## Plan de implementación

1. REGLAS.md, idéntico en `tino-api` y `../Tino-web`:
   - §4 suma la regla: «Los montos se cifran en la API. La base de datos nunca recibe ni devuelve una cifra en claro. La clave solo vive en el entorno de la API.»
   - §5: saldo, cupo y sumas de montos se calculan en `src/domain/`, como excepción a «analítica en SQL».
   - §6: los montos se guardan en la BD como `text` cifrado y en memoria son `bigint`.
2. `CLAVE_MONTOS_V1` en `env.ts`, `.env.example` y el ejemplo de pruebas. La API aborta si falta o es inválida.
3. `CifradorMontos` con pruebas unitarias: ida y vuelta, longitud fija, AAD distinta falla, otro usuario falla, versión desconocida falla, un byte alterado falla.
4. `calcularSaldo` y `sumarGastos` en el dominio, con pruebas unitarias.
5. Migración `20261121120000_montos_cifrados.sql`. **El autor la revisa antes de aplicarla** (REGLAS §8). Después se regenera `tipos.ts`.
6. Repositorio de cuentas:
   - Lee `cuentas` y los efectos (`monto`, `cuenta_origen_id`, `cuenta_destino_id`) de `movimientos`.
   - Descifra y entrega cuentas sin saldo. El servicio calcula el saldo con el dominio.
   - Al crear, genera el `id` y cifra `saldo_inicial` y `cupo`.
   - Al editar, reutiliza el cifrado si el valor no cambió.
7. Repositorio de movimientos:
   - Genera el `id`, cifra el monto y las partes, y llama a `registrar_movimiento(p_id, …)`.
   - Al reemplazar, reutiliza el cifrado del monto y de cada parte (misma categoría y mismo monto) si no cambiaron.
   - Descifra en `movimientos_detalle`.
8. Captura: el gasto de hoy lee los movimientos del día y suma con `sumarGastos`.
9. Prueba e2e `test/montos-cifrados.e2e-spec.ts`:
   - Crea una cuenta y un movimiento.
   - Lee las filas crudas con el cliente de servicio de las pruebas.
   - Verifica que cada columna de monto cumple el formato y no contiene la cifra.
   - Verifica que la API devuelve el valor correcto.
   - Cubre los criterios de aceptación que se comprueban en la BD: textos distintos con la misma longitud, cifrado copiado → 500, editar la nota no recifra, editar el nombre no deja historial y un monto en claro no entra.
10. Ajuste de las pruebas existentes (ver «Pruebas»).
11. Prueba de humo con la API levantada (ver «Pruebas»).

## Pruebas

Las pruebas usan la misma API que se construye, no dobles:

- **De punta a punta** (`test/*.e2e-spec.ts`): levantan el `AppModule` completo con `crearApp()` y hacen peticiones HTTP con supertest. Usan usuarios reales de Tino dev con su token. Es el mismo camino que siguen la web y la app.
- **Unitarias** (`src/**/*.test.ts`): el cifrador y las funciones de dominio nuevas.
- **De humo**: con `npm run start:dev` en el puerto 4000, un script de prueba crea un usuario temporal. Con su token, el script crea una cuenta, registra un gasto, consulta `GET /cuentas`, `GET /movimientos` y `GET /captura`, y compara saldos y gasto de hoy con lo esperado. Al final borra el usuario. El script vive fuera del repositorio y no se versiona.

Ajuste de las pruebas existentes:

- Las que escriben o leen montos directo en la BD (`aislamiento`, `cuentas`, `movimientos`) usan `test/montos.ts`. Ese apoyo cifra y descifra con `CifradorMontos` y la clave de pruebas, para que las filas creadas a mano sean válidas y legibles.
- `aislamiento.e2e-spec.ts` se adapta: cambia `cuentas_con_saldo` por `cuentas`, `gastos_del_dia` por la misma consulta que usa la API para el gasto de hoy y los montos por montos cifrados. No se borra ni se desactiva ninguna aserción de aislamiento (REGLAS §4).
- Las aserciones sobre lo que devuelve la API (saldos, totales, errores) no cambian. Si fallan, se corrige el código, no la prueba.

Regla de cierre: se corre todo, y si algo falla se corrige y se vuelve a correr. Una aserción solo cambia si contradice este spec, y el cambio se anota. El spec pasa a `Implementado` cuando `npm test`, `npm run lint` y `npm run typecheck` pasan y la prueba de humo da lo esperado.

## Tabla de cobertura

No aplica: el spec no tiene interfaz ni agrega o cambia endpoints. El contrato de `docs/api/` sigue igual, así que no se actualiza. La pide el autor directamente, no un inventario de necesidades.

## Criterios de aceptación

- [x] La API no arranca sin `CLAVE_MONTOS_V1`, ni con una que no sea de 32 bytes.
- [x] En la BD, `movimientos.monto`, `movimiento_partes.monto`, `cuentas.saldo_inicial`, `cuentas.cupo` y `cuentas_cambios.valor_*` son `text` y cumplen `^v1\.`.
- [x] Un `insert` directo con un monto en claro (`'5000'`) falla por la restricción de formato.
- [x] Ninguna función ni vista de Postgres suma, compara o valida montos.
- [x] Dos movimientos con el mismo monto guardan textos cifrados distintos, y los dos tienen la misma longitud.
- [x] Copiar el `monto` cifrado de un movimiento a otro hace que la API responda 500 al leerlo, no un monto falso.
- [x] Editar solo la nota de un movimiento no cambia su `monto` cifrado.
- [x] Editar el nombre de una cuenta no agrega filas a `cuentas_cambios`.
- [x] `GET /cuentas` devuelve los mismos saldos, totales y patrimonio que antes para los mismos movimientos. Lo comprueban las e2e existentes de cuentas, movimientos y captura sin cambios en lo que verifican.
- [x] `test/aislamiento.e2e-spec.ts` pasa, adaptado a montos cifrados, sin perder ninguna aserción de aislamiento.
- [x] `npm test`, `npm run lint` y `npm run typecheck` pasan.
- [x] La prueba de humo contra la API levantada devuelve los saldos y el gasto de hoy esperados.
- [x] `REGLAS.md` es idéntico en `tino-api` y `../Tino-web`.

## Notas de implementación

- Migración aplicada en Tino dev como versión `20261121062538` (`montos_cifrados`), desde `supabase/migrations/20261121120000_montos_cifrados.sql`.
- Además de lo planeado, `src/config/env.test.ts` prueba que la API no arranca sin `CLAVE_MONTOS_V1` o con una clave inválida. También se comprobó con `node dist/main.js`.
- Pruebas existentes ajustadas, sin cambiar lo que verifican: en `aislamiento`, los montos van cifrados, `cuentas_con_saldo` pasa a `cuentas` y `gastos_del_dia` pasa a la consulta de la API. En `cuentas`, el historial se descifra antes de comparar 100 → 250.
- Resultado: 260 pruebas en verde (unitarias y e2e contra Tino dev), lint y typecheck sin errores. La prueba de humo contra `npm run start:dev` dio saldos, patrimonio, gasto de hoy y edición correctos, y confirmó que la base solo tiene textos `v1.`.

## Decisiones

- **Sí:** la clave solo en la API. **No:** pgcrypto o Vault con la clave en Postgres, porque no protege de quien administra la BD.
- **Sí:** cálculo en el dominio. **No:** mandar la clave a Postgres en cada consulta para descifrar en SQL. La clave podría quedar en logs o en `pg_stat_statements`, y contradice que la API cifre y descifre.
- **Sí:** una maestra más HKDF por usuario. **No:** una clave global (una sola clave para todos) ni un sobre por usuario (más piezas sin ganancia a esta escala).
- **Sí:** `text` con el mismo nombre de columna. **No:** `bytea`, incómodo vía PostgREST y dentro del jsonb del historial. **No:** columnas `*_cifrado`, que cambian más vistas y funciones.
- **Sí:** relleno a 19 dígitos. Sin él, la longitud delata la magnitud.
- **Sí:** AAD por fila. Impide mover montos entre filas o usuarios sin que se note.
- **Sí:** IV aleatorio más reutilizar el cifrado si el valor no cambia. **No:** cifrado determinista (AES-SIV), que Node no trae y suma una dependencia. **No:** llevar la comparación del historial a la API, porque RN-13 dejaría de estar garantizada en la BD.
- **Sí:** la API genera los `id`. La AAD necesita el `id` antes del `insert`.
- **Sí:** un descifrado fallido da 500 y un log, sin detalle al cliente. Significa datos alterados o una clave equivocada, no un error del usuario.
- **Sí:** borrar los datos actuales. No hay datos reales.
- **Sí:** la rotación solo preparada (la versión va en el formato). El script va en otro spec.
- **Sí:** el cifrador en `src/repositories/cifrado/`. Es un detalle de almacenamiento, y el dominio sigue sin efectos (el IV es aleatorio).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Perder `CLAVE_MONTOS_V1` deja todos los montos ilegibles | Documentar en `.env.example` que se respalda fuera del repositorio y fuera de Supabase. |
| `GET /cuentas` trae todos los movimientos del usuario a memoria | Solo se seleccionan 3 columnas. Aceptable a escala personal. Si crece, se discute en otro spec (sin guardar saldos, RN-01). |
| Las validaciones de monto solo viven en el dominio | Toda escritura pasa por la API (RLS más funciones definer). Las pruebas del dominio cubren `> 0`, la suma de partes, `cupo > 0` y `saldo_inicial >= 0`. |
| Recifrar un valor que no cambió genera historial falso | Reutilizar el cifrado. Hay un criterio de aceptación que lo verifica. |
| Clave en logs | El entorno nunca se registra, y el error de arranque nombra la variable sin mostrar su valor. |

## Lo que **no** entra en este spec

- El script de rotación de clave.
- Cifrar textos o `tasa`.
- Convertir datos existentes.
- Cambios de contrato HTTP o en Tino-web (salvo REGLAS.md).
- Una caché de saldos.

Cada uno, si llega, va en su propio spec.
