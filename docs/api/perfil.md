# Perfil

> **Spec de origen:** SPEC 02 · Convenciones comunes en [`README.md`](README.md).

El perfil se crea solo, por trigger, al registrarse el usuario. Hoy es de solo
lectura.

## `GET /perfil`

Perfil del usuario autenticado.

**200**

```json
{
  "id": "5b1c…",
  "nombre": null,
  "monedaBase": "COP",
  "zonaHoraria": "America/Bogota",
  "primerUsoCompletado": false
}
```

```ts
type Perfil = {
  id: string;
  nombre: string | null;
  monedaBase: "COP" | "USD";
  zonaHoraria: string;          // IANA
  primerUsoCompletado: boolean;
};
```

| Estado | `codigo` | Cuándo |
|---|---|---|
| 401 | `NO_AUTENTICADO` | Sin token válido. |
| 404 | `ENTRADA_INVALIDA` | El usuario no tiene perfil (cuenta anterior a SPEC 02). Ver la nota de 4xx en `README.md`. |
