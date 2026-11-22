# Necesidades — Metas de ahorro

> **Diseño:** `../Tino-web/referencias/export-metas`
> **Fecha:** 2026-11-22
> **Spec que la cubre:** SPEC 13

## Pantalla: Metas escritorio

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-01 | El menú muestra la TRM de referencia con su fecha. | dato | explícita | Ya cubierto. |
| N-02 | «Avisos» en el menú muestra el número de avisos sin leer. | dato | explícita | Ya cubierto. |
| N-03 | Entradas del menú, «Metas» incluida. | acción | explícita | Navegación del cliente. |
| N-04 | «Registrar» abre la captura rápida. | acción | explícita | Ya cubierto. |
| N-05 | La cabecera muestra la suma de lo ahorrado en las metas activas. | dato | explícita | Solo activas. |
| N-06 | La cabecera muestra la suma de los objetivos de las metas activas. | dato | explícita | |
| N-07 | «Nueva meta» abre el alta. | acción | explícita | |
| N-08 | La lista agrupa las metas en «Activas» y «Cumplidas»; un grupo vacío no se muestra. | dato | explícita | |
| N-09 | Orden: activas por fecha meta más cercana, sin fecha al final, empate por creación; cumplidas por cumplimiento más reciente. | dato | implícita | Ver dudas resueltas. |
| N-10 | Cada meta muestra su nombre. | dato | explícita | |
| N-11 | Cada meta muestra su avance (lo ahorrado), en COP. | dato | explícita | Calculado (ver choques). |
| N-12 | Cada meta muestra su objetivo, en COP. | dato | explícita | |
| N-13 | Cada meta muestra su porcentaje de avance, con un decimal y truncado; la barra se topa en 100 %. | dato | explícita | |
| N-14 | Cada meta muestra su fecha meta («Para el 15 dic», «Para dic 2027», «Sin fecha») o, si está cumplida, su fecha de cumplimiento («Cumplida el 12 sep»). | dato | explícita | |
| N-15 | Cada meta indica si está activa o cumplida. | dato | explícita | La cumplida va en secundario, sin celebración. |
| N-16 | Seleccionar una meta muestra su detalle. | acción | explícita | Identificar la meta. |
| N-17 | El detalle muestra la cuenta asociada, su tipo (icono) y el modo: «apartado para esta meta» o «toda la cuenta». | dato | explícita | |
| N-18 | El detalle muestra cuánto falta (objetivo − avance, nunca negativo). | dato | explícita | |
| N-19 | Ritmo con fecha de día: lo que falta y los días que quedan («faltan 1.200.000 en 34 días»). | dato | explícita | |
| N-20 | Ritmo con fecha de mes: lo que falta, los meses que quedan y la cuota mensual («unos 1.005.385 al mes durante 13 meses»). | dato | explícita | |
| N-21 | Ritmo sin fecha: aporte neto mensual promedio de los últimos 6 meses y mes estimado de llegada («alrededor de mayo de 2028»). | dato | explícita | Neto = aportes − retiros. Sin aportes, sin proyección. |
| N-22 | Ritmo de una cumplida: fecha en que llegó y, si hubo retiros después, cuándo y para qué («El dinero se usó el 14 sep en el taller»). | dato | explícita | |
| N-23 | Una cumplida muestra el avance que tenía al cumplirse; los retiros posteriores no lo bajan. | dato | implícita | Ver dudas resueltas. |
| N-24 | Nota de apartado compartido: saldo de la cuenta, lo apartado en esta meta y en cada otra meta (nombre y monto), y el saldo libre si lo hay. | dato | explícita | «Nubank tiene 2.500.000: 1.900.000 apartados aquí y 600.000 para el viaje.» |
| N-25 | Si lo apartado en una cuenta supera su saldo, la meta lo indica. | estado | implícita | Un gasto nunca se bloquea (RN-16). |
| N-26 | Nota de meta sobre inversión: valor de mercado en la moneda de la cuenta y TRM aplicada; el avance sube y baja con el mercado y el dólar. | dato | explícita | REGLAS §6. |
| N-27 | Historial de una meta por apartado: cada aporte o retiro con fecha y descripción («Apartado inicial», «Aporte», «Aporte desde Bancolombia», «Retiro · arreglo de la nevera»). | dato | explícita | Más reciente primero. |
| N-28 | Cada aporte o retiro muestra su monto con signo. | dato | explícita | |
| N-29 | Cada fila muestra el acumulado tras ella. | dato | explícita | Calculado. |
| N-30 | Historial de una meta de toda la cuenta: valor al cierre de cada mes desde la creación de la meta, más el valor de hoy. | dato | explícita | |
| N-31 | Cada fila de valor muestra su variación frente a la anterior; la primera, sin variación. | dato | explícita | Columna «Variación» en vez de «Aporte». |
| N-32 | La fila de hoy de una cuenta USD indica la TRM aplicada. | dato | explícita | |
| N-33 | Condiciones: cuenta asociada, objetivo, fecha meta o «Cumplida · 12 sep», y fecha de creación. | dato | explícita | |
| N-34 | «Registrar aporte» en una meta por apartado: monto, fecha y cuenta de origen opcional. | acción | explícita | |
| N-35 | Un aporte con cuenta de origen registra además la transferencia real hacia la cuenta de la meta. | acción | implícita | RN-16, RN-05. |
| N-36 | Un aporte sin origen no puede superar el saldo libre de la cuenta; si lo supera, error. | validación | implícita | |
| N-37 | El monto de un aporte o retiro es un entero en pesos mayor que cero. | validación | implícita | |
| N-38 | Registrar un retiro: monto, fecha y motivo opcional; libera lo apartado. | acción | implícita | No dibujado. Ver choques. |
| N-39 | Un retiro no puede dejar lo apartado en negativo. | validación | implícita | |
| N-40 | Editar o borrar un aporte o retiro; el cambio queda registrado. | acción | implícita | RN-13. Qué pasa con su transferencia lo fija el spec. |
| N-41 | «Registrar aporte» en una meta de toda la cuenta (efectivo o banco) registra una transferencia hacia la cuenta. | acción | implícita | |
| N-42 | «Ver inversiones» en una meta sobre inversión lleva al detalle de esa inversión. | acción | explícita | Identificar la cuenta. |
| N-43 | Una cumplida no admite aportes; no muestra «Registrar aporte» ni «Editar meta». | estado | explícita | |
| N-44 | «Editar meta» cambia nombre, objetivo, fecha, cuenta y modo. | acción | explícita | |
| N-45 | Cambiar la cuenta de una meta por apartado mueve lo apartado; si no cabe en el saldo libre de la nueva, error. | validación | implícita | Cambio de modo: lo fija el spec. |
| N-46 | Los cambios a una meta quedan registrados. | dato | implícita | RN-13. |
| N-47 | Eliminar una meta, con confirmación; libera lo apartado; las transferencias reales siguen en movimientos. | acción | implícita | |
| N-48 | Archivar una cumplida: sale de la lista. | acción | implícita | |
| N-49 | Consultar las metas archivadas. | dato | implícita | |
| N-50 | Alta: nombre obligatorio. | validación | implícita | |
| N-51 | Alta: objetivo obligatorio, entero en pesos mayor que cero. | validación | implícita | |
| N-52 | Alta: cuenta asociada obligatoria, activa (no archivada). Apartado: efectivo o banco. Toda la cuenta: efectivo, banco o inversión. Nunca tarjeta ni préstamo. | validación | implícita | |
| N-53 | Alta: modo obligatorio. | validación | implícita | |
| N-54 | Alta: fecha meta opcional, con precisión de día o de mes. | dato | implícita | Si debe ser futura lo fija el spec. |
| N-55 | Alta: apartado inicial opcional en modo apartado; mismas reglas que un aporte. Sale como «Apartado inicial». | acción | explícita | |
| N-56 | Una cuenta con una meta activa de toda la cuenta no admite otra meta activa; varias por apartado sí. | validación | implícita | |
| N-57 | El objetivo es siempre en COP; el avance de una cuenta USD se convierte con la TRM de hoy. | dato | implícita | REGLAS §6. |
| N-58 | Una meta pasa sola a cumplida el primer día en que su avance alcanza el objetivo, y lo sigue siendo. | dato | implícita | Cómo se evalúa en una inversión lo fija el spec. |
| N-59 | Inversión USD sin TRM: el avance no se puede calcular y se indica. | estado | implícita | |
| N-60 | Qué pasa con la meta si se archiva su cuenta. | estado | implícita | Lo fija el spec. |
| N-61 | Sin metas: estado vacío con invitación a crear la primera. | estado | implícita | |
| N-65 | Restaurar una meta archivada: vuelve a la lista. | acción | implícita | Pedido por el autor en /spec (2026-11-22). |

## Pantalla: Metas móvil

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-62 | Cada meta muestra el nombre de la cuenta con el icono de su tipo. | dato | explícita | Sale de N-17. |
| N-63 | Las activas muestran una línea corta de ritmo. | dato | explícita | Sale de N-19 a N-21. |
| N-64 | «+» abre el alta y «Más» lleva a Metas. | acción | explícita | Navegación del cliente. |

## Choques con reglas

| ID | Lo que sugiere el diseño | Regla | Cómo queda |
|---|---|---|---|
| N-11 | El avance parece una cifra guardada. | RN-01 | Se calcula: aportes − retiros (apartado) o saldo / valor de mercado (toda la cuenta). |
| N-27 | «Aporte desde Bancolombia» parece solo una etiqueta. | RN-16, RN-03, RN-05 | Es una transferencia real, sin categoría, que no cuenta como ingreso ni gasto. |
| N-38 | «Retiro · arreglo de la nevera» parece registrar el gasto. | RN-16 | El retiro solo libera lo apartado; el gasto se registra como movimiento aparte. |

## Fuera de alcance

| ID | Necesidad | Motivo |
|---|---|---|

## Ya cubierto

| ID | Necesidad | Cubierta por |
|---|---|---|
| N-01 | TRM de referencia en el menú. | SPEC 09 |
| N-02 | Número de avisos sin leer. | SPEC 12 |
| N-04 | Captura rápida. | SPEC 04 |

## Dudas resueltas

| ID | Pregunta | Decisión |
|---|---|---|
| — | Metas no figura en REGLAS §7. | Se agrega a «Construir ahora» en ambos repositorios (2026-11-22). |
| N-34 | ¿Qué es un aporte? | Separar parte del saldo; con cuenta de origen, además la transferencia real. Retiro = liberar, motivo opcional. |
| N-52 | ¿Qué modo admite cada cuenta? | Apartado: efectivo o banco. Toda la cuenta: efectivo, banco o inversión. |
| N-36 | ¿Apartados por encima del saldo? | Se bloquea el aporte, nunca el gasto. |
| N-58 | ¿Cuándo es cumplida? | Automático, la primera vez que llega; no se revierte. |
| N-54 | ¿Fecha meta? | Opcional, día o mes. |
| N-40, N-47, N-48 | ¿Qué se borra? | Eliminar meta, editar o borrar aportes y retiros, archivar cumplidas. |
| N-44 | ¿Qué se edita? | Todo, cuenta incluida. |
| N-09 | ¿Orden? | Por fecha meta. |
| N-23 | ¿Avance de una cumplida? | El de cuando se cumplió. |
| N-56 | ¿Varias metas por cuenta? | Apartados sí; toda la cuenta es exclusiva. |

## Retiradas

| ID | Motivo | Fecha |
|---|---|---|
