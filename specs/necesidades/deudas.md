# Necesidades — Deudas

> **Diseño:** `../Tino-web/referencias/export-deudas`
> **Fecha:** 2026-11-21
> **Spec que la cubre:** SPEC 08

## Pantalla: Deudas escritorio

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-01 | El menú muestra la TRM de referencia con su fecha. | dato | explícita | Fuera de alcance. |
| N-02 | «Avisos» muestra el número de pendientes. | dato | explícita | Fuera de alcance. |
| N-03 | Entradas a Inversiones, Metas y Avisos. | acción | explícita | Fuera de alcance. |
| N-04 | «Registrar» abre la captura rápida. | acción | explícita | Ya cubierto. |
| N-05 | La entrada «Deudas y préstamos» del menú lleva a esta pantalla. | acción | explícita | Navegación del cliente. |
| N-06 | «Te deben»: total del capital pendiente de los préstamos otorgados. | dato | explícita | Calculado (ver choques). |
| N-07 | Bajo «Te deben», cuántas personas te deben. | dato | explícita | |
| N-08 | Bajo «Te deben», el total de intereses causados sin cobrar. | dato | explícita | No suma al patrimonio. |
| N-09 | Si nadie te debe, se lee «Nadie te debe». | estado | explícita | |
| N-10 | «Debes»: total del capital pendiente de las deudas contraídas. | dato | explícita | |
| N-11 | Bajo «Debes», a cuántas personas debes. | dato | explícita | |
| N-12 | Bajo «Debes», los intereses causados por pagar, o «sin intereses» si ninguna deuda tiene tasa. | dato | explícita | |
| N-13 | «Posición neta» = te deben − debes; puede ser negativa. | dato | explícita | |
| N-14 | Leyenda de la posición neta según su signo. | dato | explícita | Derivable del signo de N-13. |
| N-15 | La lista agrupa en «Te deben», «Debes» y «Saldadas»; los grupos vacíos no se muestran. | dato | explícita | Las saldadas se muestran todas. |
| N-16 | Cada grupo muestra su total; «Saldadas» no lleva total. | dato | explícita | |
| N-17 | Orden definido dentro de cada grupo. | dato | implícita | Lo fija el spec. |
| N-18 | Cada fila muestra el nombre de la persona. | dato | explícita | |
| N-19 | Cada fila muestra el sentido: te debe, le debes o saldada. | dato | explícita | |
| N-20 | Cada fila muestra el capital pendiente; 0 si está saldada. | dato | explícita | Calculado (ver choques). |
| N-21 | Una fila activa muestra «desde» (desembolso que abrió el saldo vigente) y los días transcurridos. | dato | explícita | |
| N-22 | Una fila saldada muestra cómo y cuándo se cerró («Pagó todo el…», «Condonado el…»). | dato | explícita | |
| N-23 | Una fila con fecha acordada pasada y capital > 0 se marca y muestra la fecha acordada. | dato | explícita | |
| N-24 | Elegir una fila abre su detalle. | acción | explícita | Identificar el préstamo. |
| N-25 | El detalle muestra el tipo: préstamo otorgado, deuda contraída o saldada. | dato | explícita | |
| N-26 | El detalle muestra el nombre de la persona. | dato | explícita | |
| N-27 | El detalle muestra el capital pendiente con su rótulo («Te debe», «Le debes», «Saldo»). | dato | explícita | Calculado (ver choques). |
| N-28 | Total prestado: suma de los desembolsos. | dato | explícita | «Le prestaste» / «Te prestó». |
| N-29 | Suma de abonos a capital y condonaciones. | dato | explícita | |
| N-30 | Si hubo condonación, para rotular «Abonos y condonación». | dato | explícita | |
| N-31 | Tasa de interés en palabras («1 % mensual sobre saldo» / «Sin intereses»). | dato | explícita | |
| N-32 | Intereses cobrados (pagados, si le debes). | dato | explícita | |
| N-33 | Intereses causados sin cobrar a hoy. | dato | explícita | Interés simple, mes de 30 días, sobre el capital pendiente. |
| N-34 | Fecha acordada, o «—» si no hay. | dato | explícita | |
| N-35 | Aviso de fecha acordada pasada: hace cuánto pasó. | dato | explícita | Relativo a hoy en la zona del usuario. |
| N-36 | El texto de ayuda del aviso cita la fecha del último abono. | dato | explícita | |
| N-37 | El historial muestra la fecha de cada movimiento. | dato | explícita | |
| N-38 | El historial describe cada movimiento: tipo y cuenta propia, o categoría si es condonación. | dato | explícita | |
| N-39 | El historial muestra el capital de cada movimiento con signo. | dato | explícita | |
| N-40 | El historial muestra el interés de cada movimiento, o «—». | dato | explícita | |
| N-41 | El historial muestra el saldo de capital corrido tras cada movimiento. | dato | explícita | RN-01. |
| N-42 | El historial va en orden cronológico. | dato | explícita | |
| N-43 | «Registrar abono» abre el formulario de abono. | acción | explícita | Formulario no dibujado. |
| N-44 | El abono indica la cuenta propia donde entra (te debe) o de donde sale (le debes). | acción | implícita | |
| N-45 | El abono indica su fecha. | acción | implícita | |
| N-46 | El abono indica su monto total. | acción | implícita | |
| N-47 | La API propone el reparto: interés = causados a la fecha del abono, el resto a capital. | dato | implícita | Duda resuelta. |
| N-48 | El usuario puede ajustar capital e interés antes de registrar. | acción | implícita | Duda resuelta. |
| N-49 | Al registrar, el capital es transferencia y el interés es ingreso (te debe) o gasto (le debes). | acción | implícita | RN-08, RN-09. La categoría del interés la fija el spec. |
| N-50 | El total es mayor que cero y las partes son enteras y no negativas. | validación | implícita | |
| N-51 | El capital del abono no supera el capital pendiente. | validación | implícita | |
| N-52 | La cuenta propia existe y no está archivada. | validación | implícita | |
| N-53 | La fecha del abono no es anterior al primer desembolso. | validación | implícita | |
| N-54 | Un abono que deja el capital en 0 pasa la persona a «Saldadas». | estado | explícita | |
| N-55 | Tras un alta, abono o condonación, los saldos de las cuentas, el consolidado y el patrimonio lo reflejan. | dato | implícita | RN-01. |
| N-56 | «Cambiar fecha acordada» la mueve o la quita. | acción | explícita | |
| N-57 | Renombrar a la persona. | acción | implícita | Duda resuelta. No dibujado. |
| N-58 | El nombre es obligatorio; si se puede repetir lo decide el spec. | validación | implícita | |
| N-59 | «Ver movimientos» en una saldada lleva a Movimientos filtrado por esa persona. | acción | explícita | |
| N-60 | Una saldada no ofrece abonar, cambiar la fecha acordada ni condonar. | estado | explícita | |
| N-61 | «Condonar lo pendiente…» solo aparece en préstamos otorgados con capital > 0. | estado | explícita | |
| N-62 | Opción «Todo lo pendiente», con el monto. | acción | explícita | |
| N-63 | Opción «Solo una parte», con un valor en COP. | acción | explícita | |
| N-64 | El valor parcial es entero, mayor que cero y no supera el capital pendiente; si no, error en el campo. | validación | implícita | Ver choques. |
| N-65 | Elegir la categoría de gasto de la condonación. | acción | explícita | |
| N-66 | Lista de categorías de gasto para elegir. | dato | explícita | Ya cubierto. |
| N-67 | La vista previa «Qué cambia» muestra el patrimonio neto actual. | dato | explícita | La resta la hace el cliente. |
| N-68 | Condonar registra un gasto con fecha de hoy, en la categoría elegida, por el valor, y baja el capital. | acción | explícita | RN-17. |
| N-69 | Condonar todo cierra el préstamo: los causados se dejan de cobrar sin registrar gasto y el historial se conserva. | acción | explícita | Duda resuelta. |
| N-70 | En una condonación parcial, los causados siguen corriendo sobre el nuevo capital. | dato | implícita | Duda resuelta. |
| N-71 | Tras condonar, un mensaje cita el monto y la categoría. | estado | explícita | |
| N-72 | «Deshacer» revierte la condonación: elimina el gasto, devuelve el capital y reabre si se cerró. | acción | explícita | RN-13 (ver choques). |
| N-73 | Un préstamo inexistente o de otro usuario da un error comprensible. | validación | implícita | |
| N-74 | Abonar o condonar sobre un estado que ya cambió (doble toque, otro dispositivo) da un error comprensible. | validación | implícita | |

## Pantalla: Alta de préstamo o deuda (no dibujada)

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-75 | «Nuevo préstamo o deuda» abre el alta. | acción | explícita | |
| N-76 | El alta indica el sentido: le presté o me prestó. | acción | implícita | |
| N-77 | El alta elige una persona existente o escribe una nueva. | acción | implícita | |
| N-78 | Lista de personas existentes para elegir. | dato | implícita | |
| N-79 | El alta indica el monto del desembolso. | acción | implícita | |
| N-80 | El alta indica la cuenta propia de origen (le presté) o de destino (me prestó). | acción | implícita | RN-08, RN-16 (ver choques). |
| N-81 | El alta indica la fecha. | acción | implícita | |
| N-82 | Tasa mensual opcional, con decimales. | acción | implícita | Fija desde el alta. |
| N-83 | Fecha acordada opcional. | acción | implícita | |
| N-84 | Si la persona ya tiene préstamo en ese sentido, el desembolso suma al mismo; si estaba saldado, se reabre. | acción | implícita | Duda resuelta. |
| N-85 | El monto es entero y mayor que cero. | validación | implícita | |
| N-86 | El nombre es obligatorio si la persona es nueva. | validación | implícita | |
| N-87 | La cuenta propia existe y no está archivada. | validación | implícita | |
| N-88 | La tasa no es negativa. | validación | implícita | |
| N-89 | La fecha acordada no es anterior al desembolso. | validación | implícita | |

## Pantalla: Deudas móvil

Lista y detalle muestran los mismos datos que escritorio (N-06 a N-60). No hay necesidades nuevas.

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|

## Pantalla: Día uno móvil

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-90 | Sin préstamos, te deben, debes y posición neta salen en 0. | estado | explícita | |
| N-91 | Sin préstamos, estado vacío «Nadie anotado todavía» con explicación. | estado | explícita | |
| N-92 | «Le presté a alguien» y «Alguien me prestó» abren el alta con ese sentido. | acción | explícita | |
| N-93 | En Cuentas (día uno), «Agregar una deuda con alguien» abre el alta con «me prestó». | acción | explícita | Pantalla Cuentas de `Vacios.dc.html`. |

## Transversales

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-94 | El patrimonio neto (Cuentas y Resumen) suma los préstamos otorgados como activo y las deudas contraídas como pasivo; los causados no cuentan. | dato | implícita | Duda resuelta. |
| N-95 | Los préstamos no aparecen en la lista de Cuentas ni se eligen como cuenta en la captura o en recurrentes. | dato | implícita | Todo movimiento de préstamo se hace desde Deudas. |
| N-96 | Los movimientos de préstamo salen en Movimientos; editarlos o eliminarlos allí se refleja en el préstamo y queda en el historial. | dato | implícita | RN-13. |
| N-97 | Los cambios de nombre y de fecha acordada quedan registrados. | dato | implícita | RN-13. |
| N-98 | En el resumen del mes, el interés cuenta como ingreso o gasto, la condonación como gasto y el capital no cuenta. | dato | implícita | RN-05, RN-09. |
| N-99 | Personas y préstamos solo los ve su usuario, comprobado en la prueba de aislamiento. | validación | implícita | RN-12. |

## Choques con reglas

| ID | Lo que sugiere el diseño | Regla | Cómo queda |
|---|---|---|---|
| N-06, N-20, N-27 | El saldo de cada persona parece un valor guardado. | RN-01 | Se calcula a partir de los movimientos del préstamo. |
| N-80 | «Le prestaste · desde Nequi» podría leerse como una salida de dinero = gasto. | RN-08 | Es una transferencia hacia el préstamo, no un gasto. |
| N-49 | El abono es una sola línea con capital e interés. | RN-08, RN-09 | El capital es transferencia; el interés es ingreso o gasto. |
| N-64 | El diseño recorta en silencio una parte mayor que el pendiente. | RN-13 | La API la rechaza con error; nada se ajusta en silencio. |
| N-72 | «Deshacer» parece borrar la condonación sin rastro. | RN-13 | La eliminación del gasto queda en el historial de cambios. |

## Fuera de alcance

| ID | Necesidad | Motivo |
|---|---|---|
| N-01 | TRM en el menú. | USD fuera hasta inversiones. |
| N-02 | Contador de avisos. | REGLAS §7: avisos, no construir todavía. |
| N-03 | Entradas a Inversiones, Metas, Avisos. | REGLAS §7; Metas no figura en REGLAS. |
| N-100 | Préstamos en USD. | Movimientos solo en COP (SPEC 04). |
| N-101 | Persona en la captura rápida, incluido marcar un gasto propio al registrarlo (RN-17). | Duda resuelta: el alta solo se hace desde Deudas; captura N-44 sigue fuera. |

## Ya cubierto

| ID | Necesidad | Cubierta por |
|---|---|---|
| N-04 | «Registrar» abre la captura. | SPEC 04 |
| N-66 | Lista de categorías de gasto. | SPEC 04 |
| N-67 | Patrimonio neto actual. | SPEC 03 (`patrimonioNeto`), ampliado por N-94. |

## Dudas resueltas

| ID | Pregunta | Decisión |
|---|---|---|
| — | REGLAS §7 deja deudas y préstamos sin construir. ¿Entra? | Sí. Se enmendó §7 en los dos repos. |
| N-84 | ¿Qué pasa al prestar otra vez a la misma persona? | Suma al mismo préstamo; una saldada se reabre. |
| N-08, N-12, N-33 | ¿Qué da la API de intereses? | Tasa y causados calculados; los cobrados son ingreso o gasto (RN-09). Los causados no entran al patrimonio. |
| N-47, N-48 | ¿Cómo se reparte un abono? | La API propone (causados primero) y el usuario ajusta. |
| N-75, N-101 | ¿Dónde se registra un préstamo nuevo? | Solo en Deudas. |
| N-56, N-57 | ¿Qué se edita de un préstamo? | Fecha acordada y nombre. La tasa queda fija desde el alta. |
| N-69, N-70 | ¿Qué pasa con los causados en una condonación parcial? | Siguen corriendo; solo se pierden al condonar todo. |
| N-94, N-95 | ¿Los préstamos aparecen en Cuentas? | No por ahora; sí suman al patrimonio. Cuentas N-21/N-22 siguen pendientes. |
| N-15 | ¿Cuántas saldadas se muestran? | Todas. |

## Retiradas

| ID | Motivo | Fecha |
|---|---|---|
