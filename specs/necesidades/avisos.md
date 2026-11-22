# Necesidades — Avisos

> **Diseño:** `../Tino-web/referencias/export-avisos`
> **Fecha:** 2026-11-22
> **Spec que la cubre:** SPEC 12

## Pantalla: Avisos escritorio

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-01 | El menú muestra la TRM de referencia con su fecha. | dato | explícita | Ya cubierto. |
| N-02 | «Avisos» en el menú muestra el número de avisos sin leer. | dato | explícita | Sin número si son 0. Cubre el N-02 de los demás inventarios. |
| N-03 | Entradas a Resumen, Movimientos, Cuentas, Deudas y préstamos, Recurrentes e Inversiones. | acción | explícita | Navegación del cliente. |
| N-04 | Entrada a Metas. | acción | explícita | Fuera de alcance. |
| N-05 | «Registrar» abre la captura rápida. | acción | explícita | Ya cubierto. |
| N-06 | La cabecera muestra cuántos avisos hay sin leer, o «Todo leído» si ninguno. | dato | explícita | |
| N-07 | «Marcar todo como leído» marca leídos todos los avisos listados. | acción | explícita | |
| N-08 | Si no hay sin leer, «Marcar todo como leído» se ve atenuado. | estado | explícita | Derivable de N-06. |
| N-09 | La lista agrupa en «Hoy», «Ayer», «Esta semana» y «Antes» según la fecha del aviso en la zona del usuario; los grupos vacíos no se muestran. | dato | explícita | |
| N-10 | Orden: el más reciente primero, dentro de cada grupo y entre grupos. | dato | implícita | |
| N-11 | Solo se listan los avisos de los últimos 60 días. | dato | implícita | Ver dudas resueltas. |
| N-12 | Cada aviso tiene un tipo (recurrente, cobro, deuda, precio manual) que define su icono. | dato | explícita | |
| N-13 | Cada aviso indica si está leído o no. | dato | explícita | Punto y peso, no solo color. |
| N-14 | Título del aviso: la fuente y el plazo («Gas Vanti vence en 3 días», «Camila: hoy es la fecha acordada», «Abono a mamá en 3 días»). | dato | explícita | Nombre de la fuente y antelación aplicada. |
| N-15 | Detalle del aviso pendiente: según el tipo, fecha de vencimiento o acordada, cuenta de origen, «por confirmar», si el importe es estimado, cuánto te deben y el próximo recordatorio. | dato | explícita | |
| N-16 | Detalle del aviso resuelto: qué pasó, cuándo y desde qué cuenta («Se confirmó el 8 nov desde Bancolombia», «Abonaste 100.000 el 6 nov desde Nequi. Quedan 500.000»). | dato | explícita | Recurrente omitido también resuelve. Cuándo se resuelve cada tipo lo fija el spec. |
| N-17 | Monto del aviso: importe del recurrente («≈» si es estimado); capital pendiente en un cobro; en una deuda, el abono hecho si está resuelta y si no el capital pendiente. Precio manual sin monto. | dato | explícita | Deuda pendiente no dibujada: capital pendiente. |
| N-18 | El monto indica su sentido: salida o entrada. | dato | explícita | Color de salida. |
| N-19 | Momento del aviso: fecha y hora (08:00). | dato | explícita | El cliente formatea: hora si es hoy, día y hora si ayer, día si es más antiguo. |
| N-20 | «Confirmar» en un recurrente fijo pendiente lleva a confirmar esa ocurrencia. | acción | explícita | Identificar plantilla y vencimiento. La confirmación es de SPEC 07. |
| N-21 | «Ajustar» en un recurrente variable pendiente lleva a confirmarlo con el importe real. | acción | explícita | SPEC 07. |
| N-22 | «Registrar abono» en un cobro con capital pendiente lleva al abono de ese préstamo. | acción | explícita | Identificar el préstamo. SPEC 08. |
| N-23 | Un aviso de precio manual lleva a registrar el precio de ese activo. | acción | implícita | No dibujado. SPEC 10/11. |
| N-24 | Un aviso resuelto no muestra acción. | estado | explícita | La API indica si está resuelto. |
| N-25 | Clic en un aviso alterna leído/no leído; el cambio persiste entre dispositivos. | acción | explícita | |
| N-26 | Resolver la fuente (confirmar, omitir, abonar, registrar precio) deja el aviso leído. | estado | implícita | |
| N-27 | Un aviso sale de la lista si su fuente ya no existe (recurrente eliminado o pausado, préstamo eliminado, activo sin posición) o su tipo está desactivado. | estado | implícita | |
| N-28 | Sin avisos en 60 días: estado vacío. | estado | implícita | |
| N-29 | Encabezado de antelación: «Avisos a las 08:00», en la zona del usuario. | dato | explícita | Hora fija, no editable. Ver choques. |
| N-30 | Lista de tipos con nombre, descripción y si está activo. | dato | explícita | |
| N-31 | Cada tipo muestra su antelación vigente y las opciones que admite. | dato | explícita | Recurrentes 1/3/5 días/1 semana; deuda 1/3 días/1 semana; cobro nunca/cada 2 semanas/cada mes; precio 3/7/14 días. |
| N-32 | Activar o desactivar un tipo se guarda. | acción | explícita | |
| N-33 | Elegir una opción se guarda y activa el tipo si estaba desactivado. | acción | explícita | |
| N-34 | Valores por defecto: recurrentes 3 días, cobros cada mes, deuda 1 semana, precio manual desactivado con 7 días. | dato | implícita | |
| N-35 | Solo se aceptan las opciones del tipo; otra da error. | validación | implícita | |
| N-36 | Recurrentes: un aviso N días antes del vencimiento de cada ocurrencia abierta de una plantilla activa. | dato | explícita | Gasto, ingreso y transferencia. |
| N-37 | Cobros: aviso el día acordado de cada préstamo otorgado con capital pendiente; se repite cada 14 o 30 días exactos, o nunca, mientras quede capital. | dato | explícita | |
| N-38 | Lo que debes: aviso N días antes de la fecha acordada de cada deuda contraída con capital pendiente. | dato | explícita | |
| N-39 | Precio manual: un aviso por activo manual con posición cuando su último precio cumple N días; registrar precio lo resuelve y reinicia el plazo. | dato | explícita | |
| N-40 | Préstamo o deuda sin fecha acordada no genera aviso. | dato | implícita | |
| N-41 | Tipo «Pago de la tarjeta» (aviso y antelación). | dato | explícita | Fuera de alcance. |
| N-42 | Tipo «Corte de la tarjeta» (aviso y antelación). | dato | explícita | Fuera de alcance. |
| N-43 | Avisos de tarjeta en la lista: deuda actual y «Ver tarjeta». | dato | explícita | Fuera de alcance. |

## Pantalla: Avisos móvil

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-44 | La lista móvil muestra un detalle corto. | dato | explícita | Sin datos nuevos: sale de N-15 y N-16. |
| N-45 | «Configurar» abre la antelación por tipo y «‹ Avisos» vuelve. | acción | explícita | Navegación del cliente; usa N-29 a N-35. |

## Choques con reglas

| ID | Lo que sugiere el diseño | Regla | Cómo queda |
|---|---|---|---|
| N-29 | «Hora de Bogotá» fija. | REGLAS §6 | Zona del perfil del usuario. |
| N-16 | «Quedan 500.000» parece un texto guardado. | RN-01 | Capital y detalle se calculan con los datos vigentes; nada se congela en el aviso. |
| N-20 | La acción del aviso parece confirmar el recurrente. | RN-10 | Solo lleva a confirmar; nada altera saldos sin intervención del usuario. |

## Fuera de alcance

| ID | Necesidad | Motivo |
|---|---|---|
| N-04 | Entrada a Metas. | Metas no figura en REGLAS. |
| N-41 | Aviso de pago de la tarjeta. | REGLAS §7: tarjeta con ciclo, no construir todavía. |
| N-42 | Aviso de corte de la tarjeta. | REGLAS §7: tarjeta con ciclo, no construir todavía. |
| N-43 | Avisos de tarjeta en la lista. | REGLAS §7: tarjeta con ciclo, no construir todavía. |

## Ya cubierto

| ID | Necesidad | Cubierta por |
|---|---|---|
| N-01 | TRM de referencia en el menú. | SPEC 09 |
| N-05 | «Registrar» abre la captura rápida. | SPEC 04 |

## Dudas resueltas

| ID | Pregunta | Decisión |
|---|---|---|
| — | ¿REGLAS §7 deja avisos fuera? | Se enmienda §7 en ambos repos: entran avisos; tarjeta con ciclo sigue fuera. |
| N-29 | ¿Cómo llega un aviso? | Solo dentro de la app. Se derivan al leer; sin push ni correo. 08:00 es la hora desde la que aparece. |
| N-11 | ¿Hasta dónde llega el historial? | Últimos 60 días. |
| N-25 | ¿Leído/no leído? | Clic alterna; resolver la fuente lo marca leído. |
| N-37 | ¿Qué es «cada mes» / «cada 2 semanas»? | 30 y 14 días exactos desde la fecha acordada. |
| N-39 | ¿Precio manual: uno o se repite? | Uno por activo hasta que se actualice el precio. |
| N-27 | ¿Fuente eliminada o tipo desactivado? | Sus avisos desaparecen de la lista. |
| N-17 | ¿Monto de una deuda pendiente? | Capital pendiente. |

## Retiradas

| ID | Motivo | Fecha |
|---|---|---|
