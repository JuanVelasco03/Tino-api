# TRM

> **Spec de origen:** SPEC 09 · Convenciones comunes en [`README.md`](README.md).

TRM oficial: pesos colombianos por US$ 1, certificada por la Superintendencia
Financiera. La API la trae sola de la fuente pública la primera vez que se
pide cada vigencia y la guarda en una caché por usuario. El cliente no la
registra ni la elige.

Sirve para mostrar el equivalente en COP de toda cifra en dólares y la tasa
aplicada (REGLAS §6). No depende de las cuentas: responde igual aunque el
usuario no tenga cuentas en dólares.

## `GET /trm`

TRM vigente hoy, en la zona horaria del perfil.

**200**

```json
{
  "fechaHoy": "2026-11-22",
  "trm": {
    "valor": "3461.92",
    "vigenteDesde": "2026-11-21",
    "vigenteHasta": "2026-11-23",
    "fuente": "Superintendencia Financiera de Colombia"
  },
  "desactualizada": false
}
```

```ts
type TrmVigenteDto = {
  fechaHoy: string;         // "YYYY-MM-DD" en la zona del usuario
  trm: TrmDto | null;       // null si nunca se obtuvo ninguna
  desactualizada: boolean;  // true: la fuente falló y trm es la última conocida, que no cubre hoy
};

type TrmDto = {
  valor: string;            // COP por US$ 1, siempre con dos decimales y punto decimal
  vigenteDesde: string;     // "YYYY-MM-DD"
  vigenteHasta: string;     // "YYYY-MM-DD"; puede ser posterior a vigenteDesde (fin de semana)
  fuente: string;           // hoy siempre "Superintendencia Financiera de Colombia"
};
```

Cómo presentarla:

- **`valor` es un string decimal, no un monto en unidades menores.** Es la
  única excepción a la convención de montos del `README.md`: `"3461.92"` =
  3.461,92 COP por US$ 1. Se muestra con formato colombiano
  (`3.461,92`). Para operar sin coma flotante, quitar el punto y usar
  `BigInt` (centavos de peso por dólar).
- La fecha que muestra la interfaz («21 nov 2026») es `vigenteDesde`. Una TRM
  puede cubrir varios días: la del sábado vale hasta el lunes.
- Con `desactualizada: true`, la fuente no respondió y `trm` es la última
  conocida. El cliente indica que la tasa no es la de hoy.
- Con `trm: null`, nunca se ha obtenido ninguna. El cliente no muestra
  equivalentes en COP.
- Que la fuente falle nunca produce un error HTTP.

| Estado | `codigo` | Cuándo |
|---|---|---|
| 401 | `NO_AUTENTICADO` | Sin token válido. |
| 500 | `ERROR_INTERNO` | Falla al leer la caché. |

La primera petición de cada vigencia puede tardar hasta unos 3 s si la fuente
está lenta; las siguientes se leen de la caché.
