# Necesidades — Recurrentes

> **Diseño:** `C:\Users\PC\Downloads\TINO sistema de diseño (5)\export-recurrentes`
> **Fecha:** 2026-11-21
> **Spec que la cubre:** SPEC 07

## Pantalla: Recurrentes escritorio

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-01 | El menú muestra la TRM de referencia con su fecha. | dato | explícita | Fuera de alcance. |
| N-02 | «Avisos» muestra el número de pendientes. | dato | explícita | Fuera de alcance. |
| N-03 | Entradas a Deudas y préstamos, Inversiones, Metas y Avisos. | acción | explícita | Fuera de alcance. |
| N-04 | «Registrar» abre la captura rápida. | acción | explícita | Ya cubierto. |
| N-05 | La entrada «Recurrentes» del menú lleva a esta pantalla. | acción | explícita | Navegación del cliente. |
| N-06 | La bandeja lista las ocurrencias por confirmar: las que generan las plantillas activas y aún no tienen movimiento. | dato | explícita | RN-10. |
| N-07 | Una ocurrencia entra a la bandeja 7 días antes de su vencimiento, sin que el usuario haga nada. | dato | explícita | Duda resuelta: anticipación fija. |
| N-08 | Una ocurrencia vencida sin confirmar ni omitir sigue en la bandeja y se distingue como vencida. | estado | implícita | Duda resuelta. |
| N-09 | Contador de ocurrencias por confirmar. | dato | explícita | |
| N-10 | La bandeja va por vencimiento, la más antigua primero. | dato | explícita | Las vencidas quedan arriba. |
| N-11 | Cada ocurrencia muestra su fecha de vencimiento. | dato | explícita | |
| N-12 | Cada ocurrencia muestra cuánto falta («mañana», «en 3 días») o que está vencida. | dato | explícita | Relativo a hoy en la zona del usuario. |
| N-13 | Cada ocurrencia muestra su concepto. | dato | explícita | |
| N-14 | Cada ocurrencia muestra su categoría; una transferencia no lleva. | dato | explícita | RN-05. |
| N-15 | Cada ocurrencia muestra su cuenta; una transferencia, origen y destino. | dato | explícita | |
| N-16 | Cada ocurrencia muestra su importe con el sentido de su tipo (gasto, ingreso, transferencia). | dato | explícita | |
| N-17 | Se distingue importe fijo de estimado («≈», «fijo» / «estimado»). | dato | explícita | |
| N-18 | El estimado de una plantilla variable es su último importe confirmado; sin ninguno, el importe de la plantilla. | dato | explícita | |
| N-19 | Las ocurrencias no tocan saldos, cupo ni resumen hasta confirmarse. | validación | explícita | RN-10, RN-01. |
| N-20 | «Confirmar» registra el movimiento con el importe mostrado, concepto, cuenta(s), categoría y la fecha de vencimiento. | acción | explícita | Duda resuelta (fecha). Desde ahí cuenta en saldos (SPEC 04). |
| N-21 | Tras confirmar, un mensaje cita concepto, importe y cuenta afectada. | estado | explícita | |
| N-22 | «Ajustar» permite cambiar el importe antes de confirmar. | acción | explícita | Solo el importe. |
| N-23 | Al ajustar se ve el importe del periodo anterior, con la etiqueta de su periodicidad («Último mes», «Último bimestre»). | dato | explícita | Vacío si no hay anterior. |
| N-24 | «Confirmar <importe>» registra con el importe ajustado, que pasa a ser el último valor (N-18). | acción | explícita | |
| N-25 | El importe ajustado es entero y mayor que cero; si no, error en el campo. | validación | implícita | |
| N-26 | «Omitir» cierra la ocurrencia del periodo sin movimiento; la plantilla sigue activa. | acción | explícita | Ver choques (RN-16). |
| N-27 | Tras omitir, un mensaje indica que la plantilla sigue activa. | estado | explícita | |
| N-28 | «Deshacer» tras confirmar elimina el movimiento creado y devuelve la ocurrencia a por confirmar. | acción | explícita | La eliminación queda en el historial (RN-13). |
| N-29 | «Deshacer» tras omitir devuelve la ocurrencia a por confirmar. | acción | explícita | |
| N-30 | Confirmar u omitir una ocurrencia ya cerrada da un error comprensible. | validación | implícita | Doble toque, otro dispositivo. |
| N-31 | Confirmar con una cuenta archivada da error y la ocurrencia sigue pendiente. | validación | implícita | Igual que registrar (SPEC 04). |
| N-32 | Bandeja vacía: «Nada por confirmar» con el aviso de los 7 días. | estado | explícita | |
| N-33 | «Comprometido» se refiere al mes actual en la zona del usuario y lo nombra. | dato | explícita | |
| N-34 | Total comprometido del mes: salidas (gastos y transferencias) de las ocurrencias del mes pagadas, por confirmar y programadas; sin omitidas. | dato | explícita | Duda resuelta. Calculado. La barra la dibuja el cliente con N-35–N-37. |
| N-35 | Pagado: suma y número de pagos. | dato | explícita | |
| N-36 | Por confirmar: suma y número de pagos. | dato | explícita | |
| N-37 | Programado: suma y número de las ocurrencias del mes aún fuera de la ventana de 7 días. | dato | explícita | |
| N-38 | Lo pagado cuenta con su importe confirmado; lo pendiente y programado, con el fijo o el estimado. | dato | implícita | |
| N-39 | Una plantilla con varias ocurrencias en el mes (semanal, quincenal) cuenta cada una. | dato | implícita | |
| N-40 | Ingresos esperados: cada ingreso recurrente del mes aún no confirmado, con concepto, fecha e importe, uno por línea. | dato | explícita | Duda resuelta. |
| N-41 | Lista de todas las plantillas, con contador. | dato | explícita | |
| N-42 | Las plantillas van por su vencimiento en el mes actual. | dato | explícita | El spec fija el orden de las que no vencen este mes. |
| N-43 | Cada plantilla muestra su concepto. | dato | explícita | |
| N-44 | Cada plantilla muestra su periodicidad: semanal, quincenal, mensual, bimestral, trimestral o anual. | dato | explícita | Duda resuelta. |
| N-45 | Cada plantilla muestra su vencimiento: día del mes o «último día»; en semanal y quincenal, el día que le corresponde. | dato | explícita | |
| N-46 | Cada plantilla muestra su cuenta; una transferencia, origen → destino. | dato | explícita | |
| N-47 | Cada plantilla muestra su categoría; una transferencia, «Transferencia». | dato | explícita | RN-05. |
| N-48 | Cada plantilla muestra su importe con el sentido de su tipo y «≈» si es variable. | dato | explícita | |
| N-49 | Cada plantilla muestra su estado en el mes actual con fecha: pagado, por confirmar, programado u omitido. | dato | explícita | |
| N-50 | Una plantilla sin vencimiento en el mes actual se distingue y muestra su próximo vencimiento. | estado | implícita | Bimestral, trimestral, anual. |
| N-51 | Una plantilla pausada se distingue en la lista y no genera ocurrencias. | estado | implícita | Duda resuelta. |
| N-52 | «Nueva plantilla» abre el alta. | acción | explícita | Formulario no dibujado. |
| N-53 | Alta: tipo (gasto, ingreso o transferencia). | dato | implícita | Duda resuelta. |
| N-54 | Alta: concepto. | dato | implícita | |
| N-55 | Alta: importe. | dato | implícita | |
| N-56 | Alta: fijo o variable. | dato | implícita | |
| N-57 | Alta: periodicidad. | dato | implícita | |
| N-58 | Alta: vencimiento (día del mes, último día o día de la semana según periodicidad). | dato | implícita | |
| N-59 | Alta: primer vencimiento, que ancla bimestral, trimestral, anual, semanal y quincenal. | dato | implícita | |
| N-60 | Alta: cuenta de origen (gasto), de destino (ingreso) o ambas (transferencia). | dato | implícita | |
| N-61 | Alta: categoría del tipo, elegida entre las existentes; ninguna en transferencia. | dato | implícita | Categorías de SPEC 04. |
| N-62 | El concepto es obligatorio. | validación | implícita | |
| N-63 | El importe es entero y mayor que cero. | validación | implícita | |
| N-64 | Periodicidad y vencimiento deben ser válidos. | validación | implícita | |
| N-65 | Las cuentas son propias y activas; en transferencia, distintas. | validación | implícita | RN-03. |
| N-66 | La categoría es del tipo; una transferencia no lleva. | validación | implícita | RN-05. |
| N-67 | Cada error se indica en su campo. | validación | implícita | |
| N-68 | Editar una plantilla cambia cualquier campo; los movimientos ya confirmados no cambian. | acción | implícita | Duda resuelta. El spec fija qué pasa con las ocurrencias ya en la bandeja. |
| N-69 | Pausar una plantilla deja de generar ocurrencias. | acción | implícita | Duda resuelta. |
| N-70 | Reanudar vuelve a generar desde el próximo vencimiento, sin recuperar los del tiempo en pausa. | acción | implícita | |
| N-71 | Eliminar una plantilla conserva los movimientos ya confirmados. | acción | implícita | Duda resuelta. La confirmación es del cliente. |
| N-72 | Cada plantilla y cada ocurrencia se identifican para actuar sobre ellas. | dato | implícita | |
| N-73 | Un vencimiento en día 29–31 cae el último día en meses más cortos. | dato | implícita | Duda resuelta. |
| N-74 | Las ediciones y eliminaciones de plantillas quedan registradas. | dato | implícita | RN-13: sin modificación silenciosa. |
| N-75 | Un movimiento confirmado es un movimiento normal: sale en Movimientos, cuenta en saldos y resumen, se edita y elimina con historial. | dato | implícita | SPEC 04, SPEC 06. |
| N-76 | Eliminar desde Movimientos un movimiento de una ocurrencia la devuelve a por confirmar; editarlo la deja pagada y su importe pasa a ser el último valor. | validación | implícita | Duda resuelta. |
| N-77 | Una plantilla de pago de tarjeta es transferencia; un gasto recurrente en la tarjeta aumenta su deuda. | validación | implícita | RN-07, RN-02. |
| N-78 | Plantilla de abono a una deuda con una persona («Nequi → Deuda con mamá»). | acción | explícita | Fuera de alcance. |
| N-79 | Plantillas en USD. | dato | implícita | Fuera de alcance. |
| N-80 | Estados de carga y de error de la pantalla. | estado | implícita | |
| N-81 | Importes exactos, presentables en formato colombiano. | dato | implícita | REGLAS §6. |
| N-82 | Importes de plantillas cifrados como los de movimientos; totales y estimados los calcula la API. | dato | implícita | REGLAS §4, §5, SPEC 05. |
| N-83 | Un usuario solo ve y opera sus plantillas y ocurrencias. | dato | implícita | RN-12. |

## Pantalla: Recurrentes móvil

Mismos datos que escritorio: comprometido arriba (N-33 a N-37, sin número de pagos), bandeja (N-06 a N-32; el ajuste muestra «COP»), plantillas con periodicidad, vencimiento, estado e importe (N-41 a N-49). Sin «Nueva plantilla» visible; se entra desde «Más». Sin necesidades nuevas.

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|

## Choques con reglas

| ID | Lo que sugiere el diseño | Regla | Cómo queda |
|---|---|---|---|
| — | La pantalla entera. | REGLAS §7 | Recurrentes estaba en «no construir todavía». Se enmendó §7 en los dos repos. |
| N-26 | «Omitir» podría usarse para no registrar un pago que sí ocurrió. | RN-16 | Omitir es para un periodo en que el cobro no ocurrió. Si ocurrió, se confirma. |
| N-34 | El comprometido suma transferencias (abono, pago de tarjeta). | RN-05, RN-07 | Es salida comprometida, no gasto: no se suma al gasto del resumen. |
| N-78 | «Abono a mamá» a una cuenta de deuda. | RN-08, RN-17, REGLAS §7 | Préstamos no se construyen todavía. |
| N-06, N-19 | — | RN-10 | Coincide: nada toca saldos sin confirmar. |

## Fuera de alcance

| ID | Necesidad | Motivo |
|---|---|---|
| N-01 | TRM en el menú. | USD fuera hasta inversiones. |
| N-02 | Contador de avisos. | REGLAS §7: avisos, no construir todavía. |
| N-03 | Entradas a Deudas, Inversiones, Metas, Avisos. | REGLAS §7; Metas no figura en REGLAS. |
| N-78 | Abono recurrente a una deuda con persona. | REGLAS §7: deudas y préstamos, no construir todavía. |
| N-79 | Plantillas en USD. | Movimientos solo en COP (SPEC 04). |

## Ya cubierto

| ID | Necesidad | Cubierta por |
|---|---|---|
| N-04 | «Registrar» abre la captura. | SPEC 04 |

## Dudas resueltas

| ID | Pregunta | Decisión |
|---|---|---|
| — | REGLAS §7 deja recurrentes sin construir. ¿Entra? | Sí. Se enmendó §7 en los dos repos. |
| N-52, N-68, N-69, N-71 | ¿Qué acciones sobre plantillas da la API? | Crear, editar, pausar/reanudar y eliminar. |
| N-20 | ¿Qué fecha lleva el movimiento al confirmar? | La de vencimiento. |
| N-08 | ¿Qué pasa con un pendiente vencido? | Sigue en la bandeja hasta confirmar u omitir. |
| N-44 | ¿Qué periodicidades? | Semanal, quincenal, mensual, bimestral, trimestral, anual. |
| N-53 | ¿Qué tipos de plantilla? | Gasto, ingreso y transferencia entre cuentas propias. |
| N-34 | ¿El comprometido incluye transferencias? | Sí, toda salida. |
| N-40 | ¿Qué muestra «Ingreso esperado» con varios ingresos? | Uno por línea, los no confirmados del mes. |
| N-76 | ¿Qué pasa al borrar desde Movimientos un confirmado? | La ocurrencia vuelve a por confirmar. |
| N-73 | ¿Día 29–31 en un mes más corto? | Último día del mes. |
| N-07 | ¿La anticipación de 7 días es fija? | Sí. |

## Retiradas

| ID | Motivo | Fecha |
|---|---|---|
