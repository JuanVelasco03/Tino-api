# Necesidades — Inversiones

> **Diseño:** `../Tino-web/referencias/export-inversiones`
> **Fecha:** 2026-11-21
> **Spec que la cubre:** SPEC 09 (TRM) y SPEC 10 (cuentas de inversión). Pendiente: SPEC 11 (precios automáticos).

## Pantalla: Inversiones escritorio

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-01 | El menú muestra la TRM de referencia vigente con su fecha. | dato | explícita | Retoma N-01 de cuentas, captura, resumen, recurrentes y deudas. |
| N-02 | «Avisos» muestra el número de pendientes. | dato | explícita | Fuera de alcance. |
| N-03 | Entradas a Metas y Avisos. | acción | explícita | Fuera de alcance. |
| N-04 | «Registrar» abre la captura rápida. | acción | explícita | Ya cubierto. |
| N-05 | La cabecera muestra el nombre de la cuenta de inversión. | dato | explícita | |
| N-06 | La cabecera muestra la moneda de la cuenta y su naturaleza (activo). | dato | explícita | |
| N-07 | La cabecera muestra la TRM aplicada a los equivalentes, con su fecha y su fuente (Banco de la República). | dato | explícita | Solo en cuentas USD. |
| N-08 | «Valor de mercado»: posiciones a su último precio más efectivo disponible, en la moneda de la cuenta. | dato | explícita | Calculado (ver choques). |
| N-09 | Equivalente en COP del valor de mercado. | dato | explícita | REGLAS §6. |
| N-10 | «Costo de las posiciones»: suma del costo de las posiciones abiertas. | dato | explícita | |
| N-11 | Equivalente en COP del costo. | dato | explícita | |
| N-12 | «Rendimiento»: valor de las posiciones − su costo, con signo. | dato | explícita | No realizado. Color por signo: cliente. |
| N-13 | Rendimiento en % sobre el costo, dos decimales. | dato | explícita | |
| N-14 | Equivalente en COP del rendimiento, con la TRM de hoy. | dato | explícita | Sin efecto cambiario desde cada compra (lo dice el diseño). |
| N-15 | Cada posición muestra su símbolo. | dato | explícita | |
| N-16 | Cada posición muestra el nombre del activo. | dato | explícita | |
| N-17 | Cada posición muestra su cantidad, con fracciones. | dato | explícita | BTC con 6 decimales en el diseño; precisión la fija el spec. |
| N-18 | Cada posición muestra su costo promedio por unidad. | dato | explícita | Derivado (ver choques). |
| N-19 | Cada posición muestra su último precio por unidad. | dato | explícita | |
| N-20 | Cada posición muestra su valor (cantidad × precio) y su equivalente COP. | dato | explícita | |
| N-21 | Cada posición muestra su rendimiento y su equivalente COP. | dato | explícita | |
| N-22 | Cada posición muestra su rendimiento en %. | dato | explícita | |
| N-23 | Cada posición muestra la fecha de su precio, si es de cierre, y la hora cuando es intradía. | dato | explícita | «Cierre 10 nov», «11 nov · 09:30». |
| N-24 | Cada posición indica si su precio es manual (el proveedor no cubre el activo). | dato | explícita | Etiqueta «manual». |
| N-25 | Una posición manual muestra la antigüedad de su precio («hace 4 días»). | dato | explícita | Derivable de N-23. |
| N-26 | «Actualizar precio» en una posición manual abre la edición de su cotización. | acción | explícita | Identificar el activo. |
| N-27 | Guardar un precio manual por unidad, con fecha de hoy. | acción | explícita | |
| N-28 | El precio manual es obligatorio y mayor que cero; si no, se indica. | validación | implícita | |
| N-29 | Vista previa del valor de la posición con el precio digitado, y su equivalente COP. | dato | explícita | Cálculo del cliente con N-17 y N-07. |
| N-30 | Fila «Efectivo disponible»: saldo sin invertir y su equivalente COP. | dato | explícita | Calculado (ver choques). |
| N-31 | La fila de efectivo muestra la fecha del saldo («Saldo eToro · 11 nov»). | dato | explícita | Ver choques. |
| N-32 | Fila «Total cuenta»: valor total, rendimiento total y %. | dato | explícita | Mismas cifras que N-08, N-12, N-13. |
| N-33 | La nota resume la fecha del precio por clase de activo (acciones/ETF al cierre, cripto con hora). | dato | explícita | Requiere la clase del activo o derivarla de N-23. |
| N-34 | Orden definido de las posiciones. | dato | implícita | Lo fija el spec. |

## Pantalla: Inversiones móvil

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-35 | Tocar una posición manual abre la hoja de precio manual. | acción | explícita | Mismo flujo que N-26. |
| N-36 | La hoja muestra el precio anterior y su fecha. | dato | explícita | Historial de precios. |

## Pantalla: Día uno · Inversiones

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-37 | Sin cuentas de inversión, estado vacío con invitación. | estado | explícita | |
| N-38 | La TRM de hoy, con fecha y fuente, se muestra aunque no haya cuenta de inversión. | dato | explícita | La TRM no depende de una cuenta. |
| N-39 | «Agregar cuenta de inversión» abre el alta. | acción | explícita | |

## Sin pantalla: cuenta, activos y precios

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-40 | Crear una cuenta de inversión con nombre y moneda (USD o COP). | acción | implícita | Duda resuelta. |
| N-41 | Nombre obligatorio y moneda USD o COP; error en el campo. | validación | implícita | |
| N-42 | Efectivo inicial opcional al crearla, en su moneda. | dato | implícita | Como el saldo inicial (SPEC 03). |
| N-43 | Registrar una posición inicial (activo que ya se tenía): símbolo, cantidad y costo promedio. No mueve efectivo. | acción | implícita | Duda resuelta. |
| N-44 | Editar el nombre de una cuenta de inversión. | acción | implícita | Probablemente SPEC 03. |
| N-45 | Archivar una cuenta de inversión. | acción | implícita | Probablemente SPEC 03. |
| N-46 | Con varias cuentas de inversión, listarlas para elegir cuál ver. | dato | implícita | Duda resuelta. Selector: web. |
| N-47 | Una cuenta sin posiciones ni efectivo muestra su propio estado vacío. | estado | implícita | |
| N-48 | Al registrar un activo por símbolo, saber si el proveedor lo cubre y su nombre; si no, queda manual. | acción | implícita | «TINO trae el precio cuando lo encuentra». |
| N-49 | Un activo que el proveedor no cubre exige nombre y primer precio manual. | validación | implícita | |
| N-50 | Los precios cubiertos se actualizan solos: acciones/ETF al cierre, cripto intradía. | dato | implícita | Duda resuelta. |
| N-51 | La TRM oficial se obtiene sola cada día, con fecha y fuente. | dato | implícita | Duda resuelta. |
| N-52 | Si el proveedor de precios o de TRM falla, se conserva el último valor con su fecha. | estado | implícita | |
| N-53 | Cambiar un precio manual no borra el anterior. | dato | implícita | RN-13; habilita N-36. |
| N-54 | Precio y TRM de una fecha pasada, para valorar inversiones en esa fecha. | dato | implícita | Lo exige el puente de patrimonio (N-73). |
| N-55 | Cuenta en COP: posiciones, efectivo y precios en COP, sin equivalente ni TRM. | dato | implícita | Duda resuelta. |

## Sin pantalla: operaciones

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-56 | Registrar una compra: activo, cantidad, precio, fecha. Resta del efectivo y suma a la posición. | acción | implícita | Comisión dentro del precio (duda resuelta). |
| N-57 | Compra: cantidad y precio > 0, fecha válida; si el efectivo no alcanza, se rechaza con error claro. | validación | implícita | Duda resuelta. |
| N-58 | Registrar una venta: activo, cantidad, precio, fecha. Suma al efectivo y resta de la posición. | acción | implícita | Duda resuelta. |
| N-59 | No se vende más cantidad de la que se tiene. | validación | implícita | |
| N-60 | Cada venta muestra su ganancia o pérdida realizada. | dato | implícita | No es ingreso (ver choques). |
| N-61 | Al venderse toda la cantidad, la posición se cierra y sale de la lista de abiertas. | estado | implícita | Si se muestran aparte, lo fija el spec. |
| N-62 | Cantidad y costo promedio se derivan de la posición inicial y las operaciones. | dato | implícita | Ver choques. |
| N-63 | Ver las operaciones de una cuenta o de una posición. | dato | implícita | Necesario para editar o eliminar. |
| N-64 | Editar y eliminar una operación o posición inicial, con historial de cambios. | acción | implícita | RN-13. |
| N-65 | Se rechaza un cambio que deje cantidad o efectivo negativo en alguna fecha. | validación | implícita | Coherente con N-57, N-59. |

## Sin pantalla: fondeo en otra moneda

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-66 | Transferir de una cuenta COP a una de inversión USD: monto que sale en COP y monto que llega en USD. | acción | implícita | RN-06, RN-16. |
| N-67 | La tasa de esa transferencia es el cociente de los dos montos, congelada. | dato | implícita | RN-04; duda resuelta. |
| N-68 | Retirar de la cuenta de inversión USD a una COP (la inversa). | acción | implícita | |
| N-69 | Ambos montos obligatorios y > 0; origen y destino distintos. | validación | implícita | RN-03. |
| N-70 | Una transferencia en USD muestra su equivalente en COP y la tasa. | dato | implícita | REGLAS §6. |

## Sin pantalla: otros módulos

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-71 | La cuenta de inversión aparece en Cuentas como activo, con valor de mercado en su moneda, equivalente COP y tasa. | dato | implícita | Retoma Cuentas N-20. |
| N-72 | El patrimonio neto suma las cuentas de inversión a valor de mercado en COP con la TRM de hoy. | dato | implícita | Duda resuelta. |
| N-73 | El puente de patrimonio del resumen muestra la revaluación de inversiones (no realizada y realizada) como línea propia. | dato | implícita | Retoma Resumen N-45. |
| N-74 | La cabecera de Cuentas indica la TRM. | dato | implícita | Retoma Cuentas N-08. |
| N-75 | Compras, ventas y fondeos no cuentan como ingreso ni gasto del mes. | dato | implícita | RN-05, RN-06. |

## Choques con reglas

| ID | Lo que sugiere el diseño | Regla | Cómo queda |
|---|---|---|---|
| N-30, N-31 | «Saldo eToro · 11 nov» parece un saldo guardado o conciliado a una fecha. | RN-01, RN-16 | Se calcula: efectivo inicial + fondeos − compras + ventas. La fecha es la del cálculo. |
| N-08, N-20 | El valor de mercado parece un dato de la posición. | RN-01 | Se calcula: cantidad × último precio. |
| N-17, N-18, N-62 | «Registra tus posiciones con cantidad y costo promedio» las pinta como datos fijos editables. | RN-01, RN-13 | Solo la posición inicial se digita; luego se derivan de las operaciones. |
| N-12, N-60, N-73 | El rendimiento puede leerse como ingreso. | RN-06 | Ni el no realizado ni el realizado son ingreso; van al puente como revaluación. |
| N-56 | Comprar podría registrarse como gasto. | RN-06 | Es movimiento interno de efectivo a posición. |

## Fuera de alcance

| ID | Necesidad | Motivo |
|---|---|---|
| N-02 | Contador de avisos. | REGLAS §7: avisos, no construir todavía. |
| N-03 | Entradas a Metas y Avisos. | REGLAS §7; Metas no figura en REGLAS. |
| N-76 | Dividendos. | Duda resuelta. |
| N-77 | Gastos e ingresos en USD; transferencias USD fuera de las cuentas de inversión. | Duda resuelta: solo fondeo COP↔inversión. |
| N-78 | Comisión como campo o gasto aparte. | Duda resuelta: dentro del precio. |

## Ya cubierto

| ID | Necesidad | Cubierta por |
|---|---|---|
| N-04 | «Registrar» abre la captura. | SPEC 04 |

## Dudas resueltas

| ID | Pregunta | Decisión |
|---|---|---|
| — | REGLAS §7 deja inversiones sin construir. ¿Entra? | Sí. Se enmienda §7 en los dos repos. |
| N-43, N-56, N-62 | ¿Cómo se forman posiciones y efectivo? | Posición inicial digitada; después compras y ventas. |
| N-66, N-77 | ¿Qué movimientos USD entran? | Solo transferencias COP↔cuenta de inversión. |
| N-50, N-51 | ¿Qué es automático? | Precios (si el proveedor cubre el activo) y TRM oficial. |
| N-71–N-73 | ¿Aparece en Cuentas y suma al patrimonio? | Sí, a valor de mercado; revaluación como línea del puente. |
| N-46 | ¿Cuántas cuentas de inversión? | Varias. |
| N-58, N-76 | ¿Ventas y dividendos? | Ventas sí; dividendos fuera. |
| N-40, N-55 | ¿Moneda de la cuenta? | USD o COP. |
| N-60, N-73 | ¿La ganancia realizada es ingreso? | No; va al puente con la revaluación. |
| N-67 | ¿Qué tasa se congela en el fondeo? | La implícita de los dos montos reales. |
| N-78 | ¿Comisiones? | Dentro del precio. |
| N-57 | ¿Compra sin efectivo suficiente? | Se rechaza. |

## Retiradas

| ID | Motivo | Fecha |
|---|---|---|
