---
name: necesidades
description: Revisa una carpeta de referencias de diseño y produce el inventario numerado de necesidades (N-01, N-02…) que el spec de la API debe cubrir. No diseña modelo ni endpoints. Úsalo antes de /spec en cualquier feature con interfaz.
disable-model-invocation: true
argument-hint: 'ruta a la carpeta de diseño, ej. ../Tino-web/referencias/export-cuentas'
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Bash(ls:*), Bash(cat:*), Bash(date:*)
---

# /necesidades — Inventario de necesidades a partir del diseño

## Contexto de la sesión

Fecha de hoy (úsala en la cabecera, nunca la adivines):
!`date +%F`

Inventarios existentes:
!`ls specs/necesidades/ 2>/dev/null || echo "La carpeta specs/necesidades/ aún no existe"`

Specs existentes:
!`ls specs/ 2>/dev/null`

Ruta recibida: `$ARGUMENTS`

---

Tu trabajo es leer un diseño y listar **todo lo que la API tiene que dar** para que ese diseño funcione, numerado para que el spec de la API lo cubra punto por punto con una tabla de cobertura.

**No diseñas nada.** Prohibido proponer tablas, columnas, tipos, nombres de campos, endpoints o DTOs. Eso lo decide el autor en `/spec` (REGLAS §8). Describe necesidades en lenguaje de producto: "la lista muestra el saldo de cada cuenta", no "GET /cuentas devuelve `saldo`".

Responde siempre en español. Lee `plantilla.md` (en la carpeta de este skill): es el formato obligatorio del inventario.

## Fase 1 — Validar la entrada

1. Si `$ARGUMENTS` viene vacío, pide la ruta de la carpeta de diseño y para.
2. Comprueba que la ruta existe (`ls`). Si no, dilo y para.
3. Propón el nombre de la feature: el nombre de la carpeta sin el prefijo `export-` (ej. `export-cuentas` → `cuentas`). Confírmalo con el usuario junto con las preguntas de la Fase 3, o antes si no hay preguntas.
4. Si `specs/necesidades/<feature>.md` ya existe, estás en **modo re-ejecución** (ver Fase 5).

## Fase 2 — Leer

1. `REGLAS.md` completo: reglas de negocio (§3), alcance (§7) y trabajo con IA (§8).
2. Los specs de `specs/`: lo que ya está construido se cita (ej. "cubierto por SPEC 02"), no se vuelve a pedir como nuevo.
3. Todo el diseño de la carpeta:
   - `.html` y `.dc.html`: identifica cada pantalla por su `data-screen-label`. Lee textos, listas (`sc-for`), condiciones (`sc-if`), botones, formularios, estados y variables de plantilla (`{{ … }}`): delatan datos que vienen de la API.
   - Imágenes (`.png`, `.jpg`, `.webp`): míralas.
   - `.md` o notas: léelas.
   - Ignora archivos de runtime (`support.js` y similares).
   - `.zip`: avisa que existe y que no lo extraes; pregunta si hay que revisarlo.

## Fase 3 — Inventariar

Recorre cada pantalla y anota cada necesidad con un ID `N-01`, `N-02`… continuo en todo el documento. **Una necesidad = un dato o una acción verificable.** Si una fila dice "y", probablemente son dos.

**Explícitas** — lo que se ve:
- Datos mostrados (cada columna, cifra, etiqueta que depende del usuario).
- Acciones (botones, enlaces, formularios, gestos).
- Orden, agrupación, filtros y búsquedas visibles.

**Implícitas** — lo que el diseño no dibuja pero hace falta:
- Identificar el elemento para editarlo, borrarlo o navegar a su detalle.
- Validaciones de cada formulario y el error que ve el usuario.
- Estados: vacío, carga, error, éxito, confirmación de borrado.
- Historial de cambios cuando se modifican datos financieros (RN-13).
- Formato de dinero y moneda extranjera con su equivalente en COP (REGLAS §6).

**Choques con reglas** — si el diseño sugiere algo contrario a una RN (ej. un saldo que parece guardado → se calcula, RN-01; pagar la tarjeta como gasto → transferencia, RN-07), anótalo en la tabla de choques. Gana la regla; la necesidad queda reformulada según ella.

**Fuera de alcance** — lo que REGLAS §7 deja en "no construir todavía" o "no diseñar" va a su tabla con el motivo. Mantiene su ID.

**Dudas** — lo que el diseño no deja claro y cambia lo que la API debe dar: pregúntalo con `AskUserQuestion` en bloques de 3 a 5, opciones concretas, recomendación primero. No inventes. Pregunta antes de escribir el archivo.

## Fase 4 — Mostrar y guardar

1. Muestra el inventario completo como borrador.
2. Ajusta lo que el usuario corrija.
3. Con su visto bueno, escribe `specs/necesidades/<feature>.md` siguiendo `plantilla.md`.

## Fase 5 — Re-ejecución

Si el archivo ya existía:
- Los IDs existentes se conservan con su número.
- Las necesidades nuevas toman el siguiente número libre.
- Las que ya no aplican pasan a la tabla **Retiradas** con motivo y fecha.
- **Nunca** se renumera ni se reutiliza un ID: el spec de la API y el de la web los citan.
- Muestra qué cambió (nuevas, modificadas, retiradas) antes de guardar.
- Si el inventario ya tiene "Spec que la cubre", avisa que ese spec debe actualizar su tabla de cobertura.

## Fase 6 — Encadenar con /spec

Al guardar el inventario, muestra:

```
✅ Inventario guardado en specs/necesidades/<feature>.md (N necesidades, M fuera de alcance).
Sigo con /spec para el spec de la API.
```

Y continúa en la misma conversación con el flujo de `/spec`, sin que el usuario lo escriba:

1. Lee `~/.claude/skills/spec/SKILL.md` y `~/.claude/skills/spec/template.md`, y sigue ese skill **tal cual**, todas sus fases y reglas. No lo resumas ni te saltes la fase de preguntas.
2. Su contexto de sesión (fecha y `ls specs/`) ya está arriba en este skill; úsalo.
3. Su `$ARGUMENTS` es: `<feature>: cubrir el inventario specs/necesidades/<feature>.md`.
4. En sus preguntas no repitas lo que el inventario ya resolvió (dudas resueltas, choques, fuera de alcance): el foco ahora es lo que decide el autor — modelo de datos, nombres, endpoints, DTOs y errores.
5. El spec resultante incluye la **tabla de cobertura** de todas las `N-xx` (ver `CLAUDE.md` § Specs) y, al guardarlo, rellena "Spec que la cubre" en el inventario.

Si el usuario prefiere parar tras el inventario, cierra con:
`Siguiente paso: /spec <feature> en Tino-API, con tabla de cobertura de todas las N-xx.`
