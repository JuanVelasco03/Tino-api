# Necesidades — Resumen

> **Diseño:** `../Tino-web/referencias/export-resumen`
> **Fecha:** 2026-11-21
> **Spec que la cubre:** SPEC 06

## Pantalla: Resumen escritorio

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-01 | El menú muestra la TRM de referencia con su fecha. | dato | explícita | Fuera de alcance. |
| N-02 | «Avisos» muestra el número de pendientes. | dato | explícita | Fuera de alcance. |
| N-03 | Entradas a Deudas y préstamos, Recurrentes, Inversiones, Metas y Avisos. | acción | explícita | Fuera de alcance. |
| N-04 | «Registrar» abre la captura rápida. | acción | explícita | Ya cubierto. |
| N-05 | Al abrir, el resumen muestra el mes actual en la zona del usuario. | dato | implícita | |
| N-06 | La cabecera muestra el mes y el año del resumen («Octubre 2026»). | dato | explícita | |
| N-07 | Se navega al mes anterior. | acción | explícita | |
| N-08 | Se navega al mes siguiente. | acción | explícita | |
| N-09 | No se navega más allá del mes actual. | validación | implícita | Duda resuelta. |
| N-10 | Un mes inválido da un error comprensible. | validación | implícita | |
| N-11 | La cabecera muestra el rango de días del mes («1 – 31 oct»). | dato | explícita | |
| N-12 | La cabecera muestra el número de movimientos del mes: todos, transferencias incluidas. | dato | explícita | Duda resuelta. Coincide con la lista de Movimientos del mes. |
| N-13 | La cabecera indica el mes de comparación: el anterior. | dato | explícita | |
| N-14 | Total de ingresos del mes. | dato | explícita | Calculado. |
| N-15 | Total de gastos del mes. | dato | explícita | Calculado. |
| N-16 | Resultado neto: ingresos menos gastos; puede ser negativo. | dato | explícita | Calculado. |
| N-17 | Cada una de las tres cifras muestra su valor en el mes anterior. | dato | explícita | |
| N-18 | Cada cifra muestra su variación absoluta frente al mes anterior, con signo. | dato | explícita | |
| N-19 | Cada cifra muestra su variación porcentual frente al mes anterior. | dato | explícita | |
| N-20 | Si el valor del mes anterior es cero, la variación porcentual no aplica y se distingue. | estado | implícita | |
| N-21 | Las transferencias, incluido el pago de la tarjeta, no cuentan como ingreso ni como gasto. | validación | implícita | RN-05, RN-07 (ver choques). |
| N-22 | Los movimientos de cuentas archivadas siguen contando en su mes. | dato | implícita | RN-16. |
| N-23 | Gasto por categoría: cada categoría con su gasto del mes. | dato | explícita | |
| N-24 | Cada categoría muestra su porcentaje del total de gastos del mes. | dato | explícita | |
| N-25 | Cada categoría muestra su gasto del mes anterior. | dato | explícita | |
| N-26 | Cada categoría muestra su variación absoluta frente al mes anterior. | dato | explícita | |
| N-27 | Se listan las categorías con gasto en el mes o en el anterior, con cero donde no lo hubo. | dato | implícita | Duda resuelta. |
| N-28 | Las categorías van de mayor a menor gasto del mes; «Sin categoría» va al final. | dato | explícita | |
| N-29 | La fila «Sin categoría» suma los gastos sin clasificar, con monto, porcentaje, mes anterior y variación. | dato | explícita | |
| N-30 | Un gasto dividido reparte su monto entre las categorías de sus partes. | dato | implícita | |
| N-31 | La fila de total muestra el total de gastos, 100 %, el total del mes anterior y la variación. | dato | explícita | Mismas cifras que N-15, N-17, N-18. |
| N-32 | El indicador muestra el porcentaje del gasto del mes que está sin clasificar. | dato | explícita | |
| N-33 | El indicador muestra cuántos gastos del mes están sin clasificar (sin categoría ni división). | dato | explícita | Duda resuelta: solo gastos. |
| N-34 | «Clasificar» lleva a los gastos sin clasificar del mes para asignarles categoría. | acción | explícita | La edición ya existe (SPEC 04); el spec decide cómo se obtiene la lista. |
| N-35 | Patrimonio neto de hoy. | dato | explícita | Mismo cálculo que en Cuentas (SPEC 03). |
| N-36 | Serie de doce puntos: patrimonio al cierre de cada uno de los once meses anteriores y el de hoy, cada punto con su mes. | dato | explícita | Calculado (ver choques). |
| N-37 | La serie se ancla en hoy, no en el mes que se está viendo. | dato | explícita | El diseño muestra «dic 2025 – hoy» con octubre a la vista. |
| N-38 | Variación del patrimonio en el periodo de la serie: hoy menos el primer punto. | dato | explícita | |
| N-39 | Rango de la serie («dic 2025 – hoy»). | dato | explícita | |
| N-40 | El patrimonio a una fecha suma las cuentas creadas hasta ese día: saldo inicial más movimientos con fecha hasta ese día, activos menos pasivos. | dato | implícita | Duda resuelta. RN-01, RN-02. |
| N-41 | Las cuentas archivadas cuentan en los cierres pasados con el saldo que tenían entonces. | dato | implícita | |
| N-42 | La serie no tiene puntos antes del punto de partida (creación de la primera cuenta). | dato | implícita | Duda resuelta. |
| N-43 | Cambio en el mes: patrimonio al cierre del mes anterior. | dato | explícita | |
| N-44 | Cambio en el mes: resultado del mes. | dato | explícita | Igual a N-16. |
| N-45 | Cambio en el mes: revaluación de inversiones. | dato | explícita | Fuera de alcance. |
| N-46 | Cambio en el mes: «Otros cambios», lo que movió el patrimonio sin ser resultado (saldos iniciales de cuentas creadas en el mes, ediciones de saldo inicial). | dato | implícita | Duda resuelta (ver choques). |
| N-47 | Cambio en el mes: patrimonio al cierre del mes mostrado; en el mes actual, a hoy. | dato | explícita | |
| N-48 | El puente cuadra: patrimonio anterior + resultado + otros cambios = patrimonio al cierre. | validación | implícita | |
| N-49 | Un mes sin movimientos muestra las cifras en cero, sin el mensaje de día uno. | estado | implícita | Duda resuelta. |
| N-50 | Estados de carga y de error al obtener el resumen. | estado | implícita | |
| N-51 | Montos exactos, presentables en formato colombiano; porcentajes con coma decimal. | dato | implícita | REGLAS §6. |
| N-52 | Las cifras las calcula la API; el cliente no suma movimientos. | dato | implícita | REGLAS §5, montos cifrados (SPEC 05). |
| N-53 | Un usuario solo ve su propio resumen. | dato | implícita | RN-12. |

## Pantalla: Resumen móvil

Mismos datos que escritorio: cifras con su porcentaje «vs sept.» (N-19), total de gastos en la cabecera de categorías (N-15), «sin categoría, en N movimientos» (N-32, N-33), «desde dic 2025» (N-39). Sin el bloque de cambio en el mes. Barra inferior: N-04, N-03. Sin necesidades nuevas.

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|

## Pantalla: Día uno · resumen escritorio

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-54 | Si el usuario no tiene ningún movimiento, se ve el estado «Hoy es tu primer día» en lugar de la comparación. | estado | explícita | Duda resuelta. La API indica si hay movimientos. |
| N-55 | El mensaje cita cuántas cuentas activas tiene el usuario («tus 3 cuentas»). | dato | explícita | Puede cubrirlo SPEC 03; lo decide el spec. |
| N-56 | Ingresos, gastos y resultado en cero, con leyendas. | estado | explícita | Mismas cifras que N-14 a N-16. |
| N-57 | Gasto por categoría vacío, con explicación. | estado | explícita | |
| N-58 | Patrimonio de partida con su fecha («Punto de partida · 11 nov»): la creación de la primera cuenta. | dato | explícita | Duda resuelta. |
| N-59 | En día uno no se ofrece navegar entre meses. | estado | explícita | El límite hacia atrás en general lo fija el spec. |
| N-60 | «Registrar el primer gasto» abre la captura. | acción | explícita | Ya cubierto. |
| N-61 | «Agregar otra cuenta» abre el alta de cuenta. | acción | explícita | Ya cubierto. |
| N-62 | Los saldos iniciales no cuentan como ingresos. | validación | explícita | Van en «Otros cambios» (N-46). |

## Pantalla: Día uno móvil

Mismos datos que escritorio, sin «Agregar otra cuenta». Sin necesidades nuevas.

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|

## Choques con reglas

| ID | Lo que sugiere el diseño | Regla | Cómo queda |
|---|---|---|---|
| N-36, N-40, N-42 | «Cada cierre de mes agrega un punto» sugiere guardar una foto del patrimonio al cerrar el mes. | RN-01 | Cada punto se calcula desde saldos iniciales y movimientos. No se almacena saldo ni patrimonio. |
| N-45, N-46 | «Revaluación eToro» en el puente. | REGLAS §7 | Inversiones no se construyen todavía. El puente cuadra con «Otros cambios». |
| N-14, N-15, N-21 | Ingresos y gastos podrían incluir pagos de tarjeta o compras de inversión. | RN-05, RN-06, RN-07 | Las transferencias quedan fuera. Los ajustes de saldo, cuando existan, no se mezclan con el gasto (RN-14). |
| N-62 | — | RN-01 | El saldo inicial no es un movimiento ni un ingreso. |

## Fuera de alcance

| ID | Necesidad | Motivo |
|---|---|---|
| N-01 | TRM en el menú. | USD fuera hasta inversiones (inventario de cuentas). |
| N-02 | Contador de avisos. | REGLAS §7: avisos, no construir todavía. |
| N-03 | Entradas a Deudas, Recurrentes, Inversiones, Metas, Avisos. | REGLAS §7; Metas no figura en REGLAS. |
| N-45 | Revaluación de inversiones en el puente. | REGLAS §7: inversiones, no construir todavía. |

## Ya cubierto

| ID | Necesidad | Cubierta por |
|---|---|---|
| N-04 | «Registrar» abre la captura. | SPEC 04 |
| N-60 | «Registrar el primer gasto». | SPEC 04 |
| N-61 | «Agregar otra cuenta». | SPEC 03 |

## Dudas resueltas

| ID | Pregunta | Decisión |
|---|---|---|
| — | REGLAS §7 deja «informes» sin construir. ¿Entra el resumen? | Sí. Se enmienda §7 en los dos repos: el resumen del mes entra; otros informes siguen fuera. |
| N-46, N-48 | ¿Cómo cuadra el puente sin revaluación? | Con la línea «Otros cambios». |
| N-40, N-42, N-58 | ¿Desde cuándo cuenta el saldo inicial en la serie? | Desde la creación de la cuenta. El punto de partida es la creación de la primera. |
| N-09 | ¿Hasta dónde se navega? | Hasta el mes actual. |
| N-49, N-54 | ¿Cuándo sale «Hoy es tu primer día»? | Solo si el usuario no tiene ningún movimiento. Un mes vacío muestra ceros. |
| N-27 | ¿Aparece una categoría con gasto el mes anterior y cero en este? | Sí, con cero. |
| N-12 | ¿Qué cuenta «N movimientos»? | Todos los del mes, transferencias incluidas. |
| N-33 | ¿Qué entra en «sin categoría»? | Solo gastos sin categoría ni división. |

## Retiradas

| ID | Motivo | Fecha |
|---|---|---|

---

Este inventario cubre la N-60 de `captura-rapida.md` («sin clasificar» en el resumen) con N-32 y N-33.
