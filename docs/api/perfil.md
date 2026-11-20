# Perfil

> **Spec de origen:** SPEC 02 (cuenta predeterminada: SPEC 04) · Convenciones
> comunes en [`README.md`](README.md).

El perfil se crea solo, por trigger, al registrarse el usuario. Lo único que
el cliente cambia hoy es la cuenta predeterminada de la captura rápida.

## `GET /perfil`

Perfil del usuario autenticado.

**200**

```json
{
  "id": "5b1c…",
  "nombre": null,
  "monedaBase": "COP",
  "zonaHoraria": "America/Bogota",
  "primerUsoCompletado": false,
  "cuentaPredeterminadaId": null
}
```

```ts
type Perfil = {
  id: string;
  nombre: string | null;
  monedaBase: "COP" | "USD";
  zonaHoraria: string;                   // IANA
  primerUsoCompletado: boolean;
  cuentaPredeterminadaId: string | null; // la elegida, tal cual (puede estar archivada)
};
```

`cuentaPredeterminadaId` es la que eligió el usuario. Para saber cuál poner en
el formulario, el cliente usa `GET /captura` → `cuentaPredeterminadaId`, que ya
resuelve el caso de una elegida archivada o ausente (ver
[`captura.md`](captura.md)).

| Estado | `codigo` | Cuándo |
|---|---|---|
| 401 | `NO_AUTENTICADO` | Sin token válido. |
| 404 | `ENTRADA_INVALIDA` | El usuario no tiene perfil (cuenta anterior a SPEC 02). Ver la nota de 4xx en `README.md`. |

## `PATCH /perfil`

Elige la cuenta predeterminada de la captura. Es la misma en web y celular.

```json
{ "cuentaPredeterminadaId": "8f0e…" }
```

```ts
type EdicionPerfil = {
  cuentaPredeterminadaId: string | null; // obligatorio; null la quita
};
```

**200** `Perfil` actualizado.

| Estado | `codigo` | `campo` | Cuándo |
|---|---|---|---|
| 400 | `ENTRADA_INVALIDA` | `cuentaPredeterminadaId` | Falta o no es un UUID. |
| 422 | `CUENTA_INVALIDA` | `cuentaPredeterminadaId` | La cuenta no existe o es de otro usuario. |
| 409 | `CUENTA_ARCHIVADA` | `cuentaPredeterminadaId` | La cuenta está archivada. |
| 404 | `ENTRADA_INVALIDA` | — | El usuario no tiene perfil. |

La moneda base no se cambia por la API. En la base, cambiarla con movimientos
registrados falla (RN-15).
