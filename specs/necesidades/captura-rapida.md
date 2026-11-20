# Necesidades — Captura rápida

> **Diseño:** `../Tino-web/referencias/export-captura`
> **Fecha:** 2026-11-19
> **Spec que la cubre:** SPEC 04

## Pantalla: Registrar escritorio

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-01 | El menú muestra la TRM de referencia con su fecha. | dato | explícita | Fuera de alcance. |
| N-02 | «Avisos» muestra el número de pendientes. | dato | explícita | Fuera de alcance. |
| N-03 | Entradas a Deudas y préstamos, Recurrentes, Inversiones, Metas y Avisos. | acción | explícita | Fuera de alcance. |
| N-04 | La lista muestra los movimientos de un mes; por defecto, el actual en la zona del usuario. | dato | explícita | «Movimientos · Noviembre 2026». |
| N-05 | El usuario cambia de mes para ver meses anteriores. | acción | implícita | Duda resuelta. |
| N-06 | Orden: fecha más reciente primero; a igual fecha, el último registrado primero. El recién registrado aparece arriba. | dato | explícita | |
| N-07 | Cada fila muestra la fecha del movimiento. | dato | explícita | En la zona del usuario. |
| N-08 | Cada fila muestra la descripción. | dato | explícita | |
| N-09 | Cada fila muestra la categoría; «sin clasificar» si no tiene; en una transferencia, que es transferencia. | dato | explícita | RN-05. |
| N-10 | Cada fila muestra la cuenta; en una transferencia, origen → destino. | dato | explícita | «Nequi → Deuda» implica préstamos (fuera). |
| N-11 | Cada fila muestra el importe con signo por tipo: gasto −, ingreso +, transferencia sin signo. | dato | explícita | |
| N-12 | Un movimiento dividido se distingue en la lista y deja ver sus partes. | dato | implícita | |
| N-13 | Un mes sin movimientos muestra estado vacío. | estado | implícita | |
| N-14 | Estado de carga y de error de la lista. | estado | implícita | |
| N-15 | Cada movimiento se identifica para editarlo o eliminarlo. | dato | implícita | |
| N-16 | Editar un movimiento: todos sus campos, incluido el tipo. | acción | implícita | Duda resuelta. |
| N-17 | Al editar, valen las reglas del tipo resultante (p. ej., pasar a transferencia quita categoría y división y exige destino). | validación | implícita | RN-03, RN-05. |
| N-18 | Eliminar un movimiento, previa confirmación. | acción | implícita | RN-13. |
| N-19 | Toda edición o eliminación queda registrada: qué cambió, valor anterior, nuevo y cuándo. | dato | implícita | RN-13 (ver choques). |
| N-20 | Tras crear, editar o eliminar, el saldo de cada cuenta afectada lo refleja. | dato | implícita | RN-01, RN-02 (ver choques). |
| N-21 | Selector de tipo: gasto, ingreso o transferencia; gasto por defecto. | acción | explícita | |
| N-22 | El monto es obligatorio, en pesos enteros y mayor que cero; sin él no se registra. | validación | explícita | Botón inactivo con 0. |
| N-23 | El movimiento guarda su moneda (la de la cuenta, hoy COP) y la tasa de su fecha. | dato | implícita | RN-04. |
| N-24 | La descripción es opcional, texto libre. | dato | explícita | El prototipo registra sin ella. |
| N-25 | Al escribir, se proponen hasta dos conceptos ya usados por el usuario que empiecen por el texto, sin distinguir mayúsculas ni tildes, cada uno con su categoría. | dato | explícita | |
| N-26 | Aceptar una sugerencia (Tab o clic) completa la descripción y propone su categoría. | acción | explícita | |
| N-27 | Se ofrecen las categorías del tipo elegido (gasto o ingreso); la transferencia no tiene. | dato | explícita | RN-05. |
| N-28 | Mientras escribe, la regla que coincide propone la categoría; se muestra como propuesta, con la palabra clave que la originó. | dato | explícita | RN-11. «Sugerida por «almuerzo»». |
| N-29 | El usuario elige, cambia o quita la categoría a mano. | acción | explícita | RN-11. |
| N-30 | Sin categoría, el movimiento se registra igual como «sin clasificar». | validación | explícita | Duda resuelta. |
| N-31 | La categoría debe ser del tipo del movimiento. | validación | implícita | |
| N-32 | Se elige la cuenta entre las del usuario: ícono por tipo, nombre, saldo actual; en un pasivo, como deuda. | dato | explícita | Ya cubierto. |
| N-33 | La cuenta predeterminada del usuario viene puesta y se indica cuál es. | dato | explícita | |
| N-34 | El usuario elige su cuenta predeterminada, la misma en web y celular. | acción | implícita | Interfaz sin diseñar. |
| N-35 | Vista previa del saldo resultante («Nequi 20.321 → 5.321»; en pasivo, la deuda sube con un gasto). | dato | explícita | Ver choques. |
| N-36 | Solo se registra en cuentas propias no archivadas; otra cosa se rechaza. | validación | implícita | |
| N-37 | Una transferencia exige cuenta de origen y destino, distintas. | validación | explícita | RN-03 (ver choques). |
| N-38 | Una transferencia no lleva categoría ni computa como gasto o ingreso. | validación | implícita | RN-05, RN-07. |
| N-39 | Fecha: hoy por defecto en la zona del usuario; admite cualquier fecha, pasada o futura. | dato | explícita | Duda resuelta. |
| N-40 | Nota opcional, texto libre. | dato | explícita | |
| N-41 | Dividir un movimiento entre categorías: partes con categoría y monto. | acción | explícita | |
| N-42 | Las partes suman exactamente el monto; cada una > 0 y con categoría del tipo; si no, error. | validación | implícita | |
| N-43 | Una transferencia no se divide. | validación | implícita | RN-05. |
| N-44 | Asociar una persona al movimiento. | acción | explícita | Fuera de alcance. |
| N-45 | Registrar crea el movimiento y devuelve lo necesario para ponerlo arriba de la lista y en el aviso «Registrado: Almuerzo −15.000 en Nequi». | acción | explícita | |
| N-46 | «Deshacer» elimina el movimiento recién creado; la eliminación queda registrada. | acción | explícita | Plazo de 5 s: solo cliente. |
| N-47 | Al registrar con categoría elegida a mano para un texto sin regla, se ofrece crear la regla «texto → categoría»; el usuario puede descartarla. | acción | explícita | RN-11 (ver choques). |
| N-48 | Al corregir una categoría propuesta por regla, se ofrece ajustar la regla. | acción | implícita | RN-11. |
| N-49 | Un fallo al registrar, editar o eliminar devuelve un motivo comprensible, por campo cuando aplica. | estado | implícita | |
| N-50 | Un usuario nuevo arranca con categorías por defecto de gasto y de ingreso. | dato | implícita | Duda resuelta; contenido lo fija el spec. |
| N-51 | Un usuario nuevo arranca con reglas iniciales que proponen esas categorías. | dato | implícita | En «primer día», «corrientazo» → Comida funciona. |
| N-52 | Montos exactos, sin coma flotante, presentables en formato colombiano. | dato | implícita | REGLAS §6. |
| N-53 | Un usuario solo ve y modifica sus movimientos, categorías y reglas. | dato | implícita | RN-12. |
| N-54 | Con movimientos registrados, la moneda base del perfil ya no cambia. | validación | implícita | RN-15; SPEC 02 lo dejó para movimientos. |
| N-55 | Una cuenta con movimientos no se elimina (se archiva). | validación | implícita | Pendiente de SPEC 03 (N-42 de cuentas). |

## Pantalla: Captura rápida (móvil)

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-56 | La cabecera muestra el total de gastos de hoy (zona del usuario); oculta si no hay. | dato | explícita | «Hoy −5.700». Sin transferencias ni ingresos. |
| N-57 | Conceptos frecuentes del usuario por tipo, sacados de su historial. | dato | explícita | |
| N-58 | Elegir un concepto frecuente rellena la descripción y propone la categoría por regla. | acción | explícita | |
| N-59 | Sin historial no hay conceptos frecuentes (estado vacío). | estado | explícita | «Tus conceptos frecuentes aparecerán aquí». |
| N-60 | Los «sin clasificar» suman a un indicador del resumen. | dato | explícita | Fuera de alcance. |

Resto del móvil (tipo, monto, Desde/Hacia, cuenta, fecha, categoría, deshacer) ya lo cubren N-21 a N-46.

## Choques con reglas

| ID | Lo que sugiere el diseño | Regla | Cómo queda |
|---|---|---|---|
| N-35 | El saldo resultante parece calcularlo la interfaz. | RN-01, RN-02 | La vista previa es solo presentación; el saldo vigente lo calcula la API tras registrar. |
| N-37 | En escritorio, la transferencia solo dibuja «De la cuenta». | RN-03 | Origen y destino obligatorios y distintos. |
| N-46 | Deshacer borra como si nada hubiera pasado. | RN-13 | Es una eliminación y queda registrada. |
| N-47 | La regla se crea sola al elegir una categoría a mano. | RN-11 | Se ofrece; el usuario la puede descartar. |
| N-17 | Al cambiar el tipo, el movimiento podría conservar su categoría. | RN-05 | Una transferencia pierde categoría y división. |

## Fuera de alcance

| ID | Necesidad | Motivo |
|---|---|---|
| N-01 | TRM en el menú. | USD fuera hasta inversiones (inventario de cuentas). |
| N-02 | Contador de avisos. | REGLAS §7: avisos, no construir todavía. |
| N-03 | Entradas a Deudas, Recurrentes, Inversiones, Metas, Avisos. | REGLAS §7; Metas no figura en REGLAS. |
| N-44 | Persona en el movimiento. | RN-17 → préstamos; REGLAS §7: no construir todavía. |
| N-60 | Indicador de sin clasificar en el resumen. | El resumen tiene su propio diseño; informes, REGLAS §7. |

## Ya cubierto

| ID | Necesidad | Cubierta por |
|---|---|---|
| N-32 | Cuentas con ícono, nombre, saldo y naturaleza. | SPEC 03 (el saldo con movimientos lo pide N-20) |

## Dudas resueltas

| ID | Pregunta | Decisión |
|---|---|---|
| N-04 a N-19 | ¿Entra la lista de movimientos? | Sí, con editar y eliminar. |
| N-05 | ¿Cómo se recorre el historial? | Por mes; se cambia de mes. |
| N-16 | ¿Se puede cambiar el tipo al editar? | Sí, todo. |
| N-50 | ¿De dónde salen las categorías? | Lista por defecto sembrada al usuario. |
| N-28, N-51 | ¿Entran las reglas? | Sí: palabra clave → categoría. |
| N-47 | ¿Regla automática al elegir a mano? | Se ofrece, se puede descartar. |
| N-33, N-34 | ¿Qué decide la cuenta predeterminada? | La elige el usuario. |
| N-30 | ¿Sin categoría o «Otros»? | Sin categoría («sin clasificar»). |
| N-40, N-41 | ¿Nota y dividir? | Ambas dentro. |
| N-39 | ¿Qué fechas? | Cualquiera. |
| N-46 | ¿Qué hace Deshacer? | Eliminar normal, registrado; el plazo es del cliente. |

## Retiradas

| ID | Motivo | Fecha |
|---|---|---|
