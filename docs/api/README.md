# Tino API — Referencia para clientes

Contrato HTTP **vigente** de la API, por módulo. Lo leen los clientes (Tino web,
y más adelante la app de celular) y sus agentes al escribir el spec de una
pantalla: aquí está lo que la API devuelve y acepta hoy.

- Los specs (`specs/NN-*.md`) explican por qué se decidió cada cosa y son
  históricos. Este documento es la referencia viva: cada spec que agrega o
  cambia un endpoint lo actualiza en la misma rama.
- Ante conflicto entre este documento y el código, el código manda y este
  documento tiene un defecto que se corrige.

| Módulo | Documento | Spec de origen |
|---|---|---|
| Perfil | [`perfil.md`](perfil.md) | SPEC 02, SPEC 04 |
| Cuentas | [`cuentas.md`](cuentas.md) | SPEC 03, SPEC 04 |
| Movimientos | [`movimientos.md`](movimientos.md) | SPEC 04 |
| Captura rápida y sugerencias | [`captura.md`](captura.md) | SPEC 04 |
| Reglas de categorización | [`reglas.md`](reglas.md) | SPEC 04 |
| Resumen del mes | [`resumen.md`](resumen.md) | SPEC 06 |

---

## Convenciones comunes

### Base y autenticación

- Base local: `http://localhost:4000` (variable `PUERTO`). CORS solo admite el
  origen `ORIGEN_WEB` (por defecto `http://localhost:3000`).
- **Toda** ruta exige `Authorization: Bearer <access_token>`, el token de
  Supabase Auth del usuario. La API no emite tokens ni tiene sesión: el cliente
  obtiene el token del proveedor y lo envía en cada petición.
- Sin token, con token vencido o mal formado: `401 NO_AUTENTICADO`. El cliente
  debe refrescar la sesión o llevar al inicio de sesión.
- Cada usuario solo ve y toca sus propios datos (RLS). Un id de otro usuario se
  comporta como inexistente (`404`).

### Cuerpos y tipos

- JSON en `Content-Type: application/json`.
- **Montos:** string con un entero en unidades menores, sin separadores ni
  decimales: `"1284300"` = 1.284.300 COP. El negativo lleva guion ASCII:
  `"-500000"`. Nunca `number`: un número JSON pierde precisión por encima de
  2^53. Para operar en el cliente, `BigInt(monto)`.
- **Fechas e instantes:** ISO 8601 en UTC (`"2026-11-18T23:46:12.750Z"`). Una
  fecha calendario sin hora va como `"YYYY-MM-DD"` y ya viene en la zona del
  usuario.
- **Porcentajes:** `number` entero (0–100). **Excepción:** en
  [`resumen.md`](resumen.md) son enteros en décimas (`274` = 27,4 %), pueden ser
  negativos o pasar de `1000`.
- La presentación es del cliente (REGLAS §6): formato colombiano (punto de
  miles, coma decimal), pesos sin decimales, cifras tabulares, signo «−» de los
  pasivos.

### Errores

Todas las respuestas de error tienen el mismo cuerpo:

```ts
type ErrorApi = {
  statusCode: number; // igual al estado HTTP
  codigo: string;     // estable: el cliente decide con él
  mensaje: string;    // en español, listo para mostrar
  campo?: string;     // campo del cuerpo al que se refiere, si aplica
};
```

```json
{ "statusCode": 409, "codigo": "NOMBRE_DUPLICADO", "mensaje": "Ya tienes una cuenta con ese nombre.", "campo": "nombre" }
```

- El cliente decide por `codigo`, nunca por el texto de `mensaje`.
- `mensaje` se puede mostrar tal cual. Web y celular dicen lo mismo.
- Si viene `campo`, el error se muestra junto a ese campo del formulario.
  Puede ser una ruta (`"ids.0"`).
- Si hay varios problemas en la entrada, llega solo el primero.
- Nunca llega texto de Postgres ni detalle interno.

Códigos comunes a todos los módulos:

| `codigo` | Estado | Cuándo |
|---|---|---|
| `NO_AUTENTICADO` | 401 | Falta el token o no es válido. |
| `ENTRADA_INVALIDA` | 400 | La forma de la entrada no es la esperada (cuerpo que no es objeto, JSON mal formado, `:id` que no es UUID, valor fuera de un enum). |
| `ERROR_INTERNO` | 500 | Falla inesperada. Mostrar el mensaje y permitir reintentar. |

**Hoy:** cualquier otro 4xx que no es del catálogo (ruta inexistente, el `404`
de `/perfil` sin perfil) sale con `codigo: "ENTRADA_INVALIDA"` y conserva su
estado HTTP. No hay todavía un código genérico de «no encontrado».
