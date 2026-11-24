# Necesidades — Detalle de cuenta y tarjeta

> **Diseño:** `../Tino-web/referencias/export-detalle-cuenta` y `../Tino-web/referencias/export-tarjeta`
> **Fecha:** 2026-11-23
> **Spec que la cubre:** SPEC 14

Subrutas de Cuentas. Detalle de cuenta: efectivo y banco. Tarjeta: `tarjeta_credito`. Inversión mantiene su pantalla (SPEC 10).

## Pantalla: Detalle de cuenta escritorio

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-01 | Desde Cuentas se abre el detalle de una cuenta identificada. | acción | implícita | Efectivo/banco → detalle; tarjeta → pantalla de tarjeta. |
| N-02 | La cabecera muestra nombre, tipo (ícono), detalle y naturaleza (miga «Cuentas › Activos»). | dato | explícita | Lectura de una sola cuenta. |
| N-03 | Saldo actual de la cuenta. | dato | explícita | RN-01. |
| N-04 | Saldo conciliado: saldo tras el último movimiento conciliado con todo lo anterior conciliado. | dato | explícita | Calculado. |
| N-05 | Fecha hasta la que la cuenta está conciliada («al 31 oct»). | dato | explícita | |
| N-06 | Número de movimientos sin conciliar de la cuenta, o «todo conciliado». | dato | explícita | Sobre toda la cuenta, no solo el rango. |
| N-07 | Entradas del rango: suma de lo que entró a la cuenta. | dato | explícita | |
| N-08 | Salidas del rango: suma de lo que salió. | dato | explícita | |
| N-09 | Atajos de rango: últimos 30 días, mes actual, mes anterior. | acción | explícita | |
| N-10 | Rango libre desde/hasta. | acción | explícita | Duda resuelta. |
| N-11 | Texto del rango con sus fechas («12 oct – 11 nov 2026»). | dato | explícita | |
| N-12 | Lista de movimientos de la cuenta en el rango, el más reciente primero. | dato | explícita | |
| N-13 | Fecha de cada movimiento. | dato | explícita | |
| N-14 | Concepto de cada movimiento. | dato | explícita | |
| N-15 | Categoría; en transferencia, la otra cuenta («Desde Bancolombia» / «Hacia …»); en ajuste, «Ajuste»; dividido, sus partes. | dato | explícita | Incluye préstamos, inversiones y metas como contraparte. |
| N-16 | Importe con signo según su efecto en esta cuenta (entra +, sale −). | dato | explícita | RN-02. |
| N-17 | Saldo corrido tras cada movimiento. | dato | explícita | RN-01. |
| N-18 | Estado de conciliación de cada movimiento en esta cuenta. | dato | explícita | Por cuenta (duda resuelta). |
| N-19 | Tocar el estado concilia o desconcilia ese movimiento en esta cuenta. | acción | explícita | |
| N-20 | Saldo al inicio del rango al pie («Saldo al 12 oct»). | dato | explícita | |
| N-21 | Seleccionar varios movimientos. | acción | explícita | Estado de cliente. |
| N-22 | «Seleccionar pendientes» marca todos los pendientes del rango. | acción | explícita | Con N-18. |
| N-23 | Barra de selección: cantidad y suma con signo de lo seleccionado. | dato | explícita | Sobre importes ya recibidos; el spec decide si lo da la API. |
| N-24 | «Marcar como conciliados» concilia en lote los seleccionados. | acción | explícita | |

## Pantalla: Detalle de cuenta escritorio · Ajustar saldo

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-25 | El panel muestra el saldo en TINO. | dato | explícita | = N-03. |
| N-26 | El usuario escribe el saldo real contado en pesos. | acción | explícita | |
| N-27 | El saldo real es un entero en pesos sin decimales; si no, error en el campo. | validación | implícita | ¿Negativo en banco? Lo decide el spec. |
| N-28 | Diferencia = real − saldo, con signo. | dato | explícita | La API la fija al registrar. |
| N-29 | Vista previa: «hoy · Ajuste de saldo · diferencia». | dato | explícita | Fecha = hoy en la zona del usuario. |
| N-30 | «Registrar ajuste» crea un movimiento de ajuste por la diferencia, con categoría reservada. | acción | explícita | RN-14. |
| N-31 | Sin diferencia no se registra ajuste. | validación | explícita | Botón inactivo; la API también lo rechaza. |
| N-32 | Opción «Marcar todo como conciliado hasta hoy» al registrar, activa por defecto. | acción | explícita | Incluye el ajuste. |
| N-33 | El ajuste aparece en el historial como «Ajuste de saldo», categoría «Ajuste», conciliado. | dato | explícita | |
| N-34 | El ajuste no cuenta como ingreso ni gasto en el resumen; va aparte en «Ajustes». | dato | explícita | RN-14. Revisa SPEC 06. |
| N-35 | Solo efectivo y banco admiten ajuste. | validación | implícita | Duda resuelta. |

## Pantalla: Detalle de cuenta móvil

Mismos datos y acciones que escritorio: cabecera (N-02), saldo (N-03), conciliado (N-04 a N-06), atajos (N-09), lista con concepto, fecha, categoría, importe y saldo corrido (N-12 a N-17), estado y toque para conciliar (N-18, N-19), modo «Seleccionar / Listo» con lote (N-21, N-23, N-24), saldo al inicio (N-20), hoja de ajuste (N-25 a N-33). Sin entradas/salidas ni rango libre visibles: no agrega necesidades.

## Implícitas del detalle de cuenta

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-36 | Cuenta inexistente o ajena → error de no encontrada. | estado | implícita | RN-12. |
| N-37 | Rango sin movimientos → lista vacía, con saldo al inicio. | estado | implícita | |
| N-38 | Cuenta sin conciliar nunca → conciliado «—» y conteo de pendientes. | estado | implícita | |
| N-39 | Movimientos con fecha futura aparecen arriba en los atajos, para que la última fila cuadre con el saldo actual. | dato | implícita | Duda resuelta. |
| N-40 | Conciliar y desconciliar quedan en el historial de cambios. | dato | implícita | RN-13. |
| N-41 | Editar monto, fecha o cuenta de un movimiento lo devuelve a pendiente en la cuenta afectada. | dato | implícita | Duda resuelta. |
| N-42 | El ajuste es editable y eliminable desde Movimientos, con historial. | acción | implícita | RN-13. |
| N-43 | Una cuenta archivada se puede ver, pero no ajustar ni conciliar. | validación | implícita | Coherente con `CUENTA_ARCHIVADA`. ¿Ver archivada? Lo decide el spec. |
| N-44 | Montos en formato colombiano, columnas alineadas. | dato | implícita | REGLAS §6; cliente. |

## Pantalla: Tarjeta de crédito escritorio

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-45 | Cabecera: nombre, detalle («Visa ·· 7731»), naturaleza (miga «Cuentas › Pasivos»). | dato | explícita | |
| N-46 | Cupo total. | dato | explícita | |
| N-47 | Deuda actual. | dato | explícita | |
| N-48 | Disponible hoy. | dato | explícita | RN-18. |
| N-49 | Porcentaje usado (barra y «Usado 32 %»). | dato | explícita | |
| N-50 | «¿Puedo comprar esto?»: dado un valor, dice si cabe en el disponible. | dato | explícita | |
| N-51 | Si cabe: disponible restante y uso resultante en %. | dato | explícita | |
| N-52 | Si cabe: en qué corte entra la compra hecha hoy y su pago límite. | dato | explícita | |
| N-53 | Si no cabe: cuánto falta y el disponible de hoy. | dato | explícita | |
| N-54 | Sin valor: invitación a escribirlo. Valor = entero en pesos > 0. | validación | explícita | |
| N-55 | Ciclo en curso: fecha de inicio, de corte y de pago límite. | dato | explícita | |
| N-56 | Días hasta el corte y hasta el pago límite; posición de hoy en el ciclo. | dato | explícita | |
| N-57 | Saldo al corte anterior, con su fecha. | dato | explícita | |
| N-58 | Pagos y abonos desde el corte anterior: fecha, concepto, cuenta de origen, monto. | dato | explícita | Pago = transferencia (RN-07); devoluciones también abonan. |
| N-59 | Saldo anterior pendiente: saldo al corte anterior menos abonos. | dato | explícita | Calculado. |
| N-60 | Consumos del período: fecha, concepto, categoría, monto. | dato | explícita | |
| N-61 | Número de consumos del ciclo. | dato | explícita | |
| N-62 | Subtotal de consumos. | dato | explícita | |
| N-63 | Cargos del banco aparte: fecha, concepto, detalle («Cargo fijo», «Sobre 597.980»), monto. | dato | explícita | Gastos con categoría reservada «Cuota de manejo» / «Intereses» (duda resuelta). |
| N-64 | Subtotal de cargos. | dato | explícita | |
| N-65 | Deuda actual al pie = saldo anterior pendiente + consumos + cargos. | dato | explícita | Debe cuadrar con N-47. |
| N-66 | Condiciones: cupo. | dato | explícita | = N-46. |
| N-67 | Condiciones: tasa mensual vencida y su equivalente efectivo anual. | dato | explícita | |
| N-68 | Condiciones: cuota de manejo mensual. | dato | explícita | |
| N-69 | Condiciones: día de corte. | dato | explícita | |
| N-70 | Condiciones: día límite de pago. | dato | explícita | |
| N-71 | Condiciones: cuenta desde la que se paga. | dato | explícita | |
| N-72 | «Registrar pago» abre una transferencia: origen = cuenta de pago, destino = tarjeta, monto sugerido = saldo anterior pendiente. | acción | explícita | RN-07; duda resuelta. |

## Pantalla: Tarjeta de crédito móvil

Mismos datos que escritorio: disponible (N-48), barra y cupo (N-46, N-49), «Debes» (N-47), consulta (N-50 a N-54), ciclo con corte y pago y días (N-55, N-56), saldo anterior pendiente (N-59), consumos (N-60, N-62), cargos con nombre corto (N-63), deuda al pie (N-65). Sin condiciones ni «Registrar pago» visibles: no agrega necesidades.

## Implícitas de la tarjeta

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-73 | Al crear una tarjeta se fijan día de corte y día de pago (obligatorios); tasa, cuota de manejo y cuenta de pago opcionales. | acción | implícita | Duda resuelta. |
| N-74 | Las condiciones se editan desde la cuenta. | acción | implícita | |
| N-75 | Días 1–31; tasa y cuota ≥ 0; cuenta de pago debe ser activo propio no archivado. | validación | implícita | |
| N-76 | Día 29–31 en un mes más corto → último día del mes. | dato | implícita | Duda resuelta. |
| N-77 | El pago límite es el primer día de pago posterior al corte (puede caer el mes siguiente). | dato | implícita | |
| N-78 | Un consumo del día del corte entra en ese ciclo. | dato | implícita | Ciclo = día después del corte anterior … corte. |
| N-79 | Tarjeta existente sin días de corte/pago → la pantalla invita a completarlos, sin sección de ciclo. | estado | implícita | |
| N-80 | Primer ciclo de una tarjeta: el saldo inicial cuenta como saldo al corte anterior. | dato | implícita | |
| N-81 | Condición opcional vacía → «sin definir». | estado | implícita | |
| N-82 | Ciclo sin consumos o sin cargos → subtotal 0. | estado | implícita | |
| N-83 | Cambios de condiciones quedan en el historial. | dato | implícita | RN-13. |
| N-84 | Archivar la cuenta de pago o eliminarla deja la tarjeta sin cuenta de pago (o lo impide). | validación | implícita | Lo decide el spec. |

## Choques con reglas

| ID | Lo que sugiere el diseño | Regla | Cómo queda |
|---|---|---|---|
| N-45 a N-84 | Tarjeta con ciclo. | REGLAS §7 | Se enmienda §7 (ambos repos) antes del spec: pasa a «construir ahora». |
| N-04 | Saldo conciliado como cifra fija. | RN-01 | Se calcula desde movimientos y su estado. |
| N-48 | Disponible como dato de la tarjeta. | RN-18 | Cupo − deuda, calculado. |
| N-58, N-72 | Pago a la tarjeta. | RN-07 | Transferencia, nunca gasto. |
| N-63 | «No son consumos». | RN-09 | Son gastos (cuentan en el resumen); solo se agrupan aparte. |
| N-30, N-34 | Ajuste de saldo. | RN-14 | Tipo propio, categoría reservada, fuera de ingresos/gastos en el resumen. |
| N-26 | «TINO registra la diferencia». | RN-16 | Bien: queda como movimiento, no reescribe el saldo inicial. |

## Fuera de alcance

| ID | Necesidad | Motivo |
|---|---|---|

## Ya cubierto

| ID | Necesidad | Cubierta por |
|---|---|---|
| N-46, N-47, N-48, N-49 | Cupo, deuda, disponible, % usado. | SPEC 03 (`CuentaDto.tarjeta`, `saldo`) |
| N-72 | Crear la transferencia de pago. | SPEC 04 (`POST /movimientos`) |
| N-42 | Editar/eliminar con historial. | SPEC 04 (falta aceptar el tipo ajuste) |
| — | Menú: TRM, avisos, «Registrar». | SPEC 09, SPEC 12, SPEC 04 |

## Dudas resueltas

| ID | Pregunta | Decisión |
|---|---|---|
| N-45 a N-84 | ¿Tarjeta con ciclo pese a §7? | Sí, enmendando §7. |
| N-18, N-19 | ¿Conciliación por cuenta o por movimiento? | Por cuenta. |
| N-09, N-10 | ¿Rangos? | Tres atajos + rango libre. |
| N-63 | ¿Cómo nacen los cargos? | A mano, categorías reservadas; condiciones informativas. |
| N-35 | ¿Dónde se ajusta? | Efectivo y banco. |
| N-72 | ¿Qué prellena el pago? | Cuenta de pago + saldo anterior pendiente. |
| N-40, N-41 | ¿Historial de conciliación? ¿Editar desconcilia? | Sí y sí (monto, fecha o cuenta). |
| N-39 | ¿Futuros? | Arriba, dentro de los atajos. |
| N-73, N-79 | ¿Condiciones obligatorias? | Días de corte y pago sí; resto opcional. |
| N-76 | ¿Meses cortos? | Último día del mes. |
| — | ¿Tarjeta con historial conciliable? | No. |

## Retiradas

| ID | Motivo | Fecha |
|---|---|---|
