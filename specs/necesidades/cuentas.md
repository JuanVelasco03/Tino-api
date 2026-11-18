# Necesidades — Cuentas

> **Diseño:** `../Tino-web/referencias/export-cuentas`
> **Fecha:** 2026-11-18
> **Spec que la cubre:** SPEC 03

## Pantalla: Menú escritorio · Menú móvil

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-01 | El menú muestra la TRM de referencia vigente con su fecha. | dato | explícita | Fuera de alcance. |
| N-02 | «Avisos» muestra el número de avisos pendientes (en móvil, punto en «Más»). | dato | explícita | Fuera de alcance. |
| N-03 | Entradas a Deudas y préstamos, Recurrentes, Inversiones y Avisos. | acción | explícita | Fuera de alcance. |
| N-04 | Entrada a Metas. | acción | explícita | Fuera de alcance. |
| N-05 | «Registrar» abre la captura rápida. | acción | explícita | Fuera de este inventario. |

## Pantalla: Cuentas escritorio

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|
| N-06 | La cabecera indica la fecha a la que están los saldos (hoy, para el usuario). | dato | explícita | |
| N-07 | Esa fecha se calcula en la zona horaria del usuario. | dato | implícita | Ya cubierto. |
| N-08 | La cabecera indica la TRM con que se convierte el USD. | dato | explícita | Fuera de alcance. |
| N-09 | Las cuentas se agrupan en Activos («Lo que tienes») y Pasivos («Lo que debes») según la naturaleza de su tipo. | dato | explícita | RN-02. |
| N-10 | Cada grupo muestra el total de los saldos de sus cuentas. | dato | explícita | Calculado. |
| N-11 | Cada cuenta muestra su nombre. | dato | explícita | |
| N-12 | Cada cuenta muestra su tipo (Efectivo, Banco, Tarjeta de crédito), que también decide su ícono. | dato | explícita | |
| N-13 | Cada cuenta muestra una línea de detalle opcional (ej. «Ahorros ·· 4821», «Billetera»). | dato | explícita | Texto libre o estructurado lo decide el spec. |
| N-14 | Cada cuenta muestra su saldo actual en pesos. | dato | explícita | Calculado (ver choques). |
| N-15 | En un pasivo, el saldo se presenta como deuda (signo menos y leyenda «deuda»). | dato | explícita | Ver choques. |
| N-16 | La tarjeta muestra su cupo total. | dato | explícita | |
| N-17 | La tarjeta muestra el porcentaje de cupo usado (barra y «Usado N %»). | dato | explícita | Calculado. |
| N-18 | La tarjeta muestra su cupo disponible. | dato | explícita | Calculado (RN-18). |
| N-19 | La tarjeta muestra fecha de corte, días hasta el corte y pago límite. | dato | explícita | Fuera de alcance. |
| N-20 | Una cuenta en USD muestra su saldo en USD, el equivalente en COP y la tasa. | dato | explícita | Fuera de alcance. |
| N-21 | Un préstamo otorgado muestra «te debe desde», interés y «por cobrar». | dato | explícita | Fuera de alcance. |
| N-22 | Una deuda contraída muestra «le debes desde» e interés. | dato | explícita | Fuera de alcance. |
| N-23 | El cierre muestra el total de Activos y el de Pasivos. | dato | explícita | Mismo cálculo que N-10. |
| N-24 | El cierre muestra el patrimonio neto: activos menos pasivos. | dato | explícita | Calculado. |
| N-25 | Dentro de cada grupo, las cuentas aparecen en el orden elegido por el usuario, el mismo en web y celular. | dato | explícita | |
| N-26 | En modo «Ordenar», el usuario mueve una cuenta dentro de su grupo (arrastrar o subir/bajar) y el nuevo orden se guarda. | acción | explícita | |
| N-27 | Reordenar no saca una cuenta de su grupo. | validación | implícita | |
| N-28 | Una cuenta nueva entra en el orden de su grupo sin que el usuario tenga que reordenar. | dato | implícita | Posición la decide el spec. |
| N-29 | Cada cuenta se identifica para editarla, archivarla, eliminarla o reordenarla. | dato | implícita | |
| N-30 | «Nueva cuenta» crea una cuenta. | acción | explícita | Formulario no dibujado. |
| N-31 | El nombre es obligatorio; si falta, error en el campo. | validación | implícita | |
| N-32 | El nombre no se repite entre las cuentas no archivadas del usuario; si se repite, error en el campo. | validación | implícita | |
| N-33 | El tipo es obligatorio y solo admite efectivo, banco o tarjeta de crédito. | validación | implícita | |
| N-34 | Al crear se informa el saldo inicial (en la tarjeta, la deuda inicial). | dato | implícita | RN-01. |
| N-35 | Al crear una tarjeta, el cupo total es obligatorio y mayor que cero. | validación | implícita | |
| N-36 | Los montos (saldo inicial, cupo) son pesos enteros; un valor inválido muestra error en el campo. | validación | implícita | REGLAS §6. |
| N-37 | Al crear, el detalle es opcional. | dato | implícita | |
| N-38 | Editar una cuenta: nombre, detalle, tipo, cupo y saldo inicial. | acción | implícita | |
| N-39 | El tipo solo cambia dentro de la misma naturaleza (efectivo ↔ banco); activo ↔ pasivo se rechaza con error. | validación | implícita | RN-02. |
| N-40 | Cambiar el saldo inicial deja registro: valor anterior, nuevo y fecha. | dato | implícita | RN-13 (ver choques). |
| N-41 | Eliminar una cuenta sin movimientos la borra, previa confirmación. | acción | implícita | |
| N-42 | Una cuenta con movimientos no se borra: se archiva. | acción | implícita | Ver choques. |
| N-43 | Solo se archiva una cuenta con saldo cero; si no, un error lo explica. | validación | implícita | RN-16. |
| N-44 | Las cuentas archivadas no aparecen en la lista. | dato | implícita | Con saldo cero no alteran totales ni patrimonio. |
| N-45 | El usuario puede ver la lista de sus cuentas archivadas. | dato | implícita | Interfaz sin diseñar. |
| N-46 | El usuario puede restaurar una cuenta archivada; si su nombre choca con una no archivada, se pide renombrar. | acción | implícita | |
| N-47 | Sin cuentas, estado vacío que invita a crear la primera. | estado | implícita | |
| N-48 | Un grupo sin cuentas (p. ej. sin pasivos) se distingue, con total cero. | estado | implícita | |
| N-49 | Estado de carga y de error al obtener la lista. | estado | implícita | |
| N-50 | Fallos al crear, editar, archivar, restaurar, reordenar o eliminar devuelven un motivo comprensible. | estado | implícita | |
| N-51 | Montos exactos (sin coma flotante), presentables en formato colombiano: punto de miles, pesos sin decimales, signo − (U+2212). | dato | implícita | REGLAS §6. |
| N-52 | Un usuario solo ve y modifica sus propias cuentas. | dato | implícita | RN-12, REGLAS §4. |

## Pantalla: Cuentas móvil

Mismos datos que escritorio. El subtítulo combina tipo + detalle, o tipo + cupo en la tarjeta (cubierto por N-12, N-13, N-16). Reordenar con subir/bajar (N-26). Sin necesidades nuevas.

| ID | Necesidad | Tipo | Origen | Notas |
|---|---|---|---|---|

## Choques con reglas

| ID | Lo que sugiere el diseño | Regla | Cómo queda |
|---|---|---|---|
| N-10, N-14, N-23, N-24 | Saldos, totales y patrimonio parecen cifras fijas. | RN-01 | Se calculan desde saldo inicial y movimientos; no se almacenan. |
| N-15 | El saldo de la tarjeta aparece negativo. | RN-02 | El saldo de un pasivo es la deuda vigente (crece al gastar); el signo − es su efecto en el patrimonio, solo de presentación. |
| N-18 | El disponible parece un dato de la tarjeta. | RN-18 | Cupo total menos deuda vigente. No se almacena. |
| N-40 | Editar el saldo inicial altera el saldo hacia atrás. | RN-13 | Permitido, pero queda registrado. |
| N-42 | Eliminar una cuenta con movimientos borraría historia financiera. | RN-13, RN-16 | Se archiva en lugar de borrarse. |

## Fuera de alcance

| ID | Necesidad | Motivo |
|---|---|---|
| N-01 | TRM de referencia en el menú. | USD fuera hasta inversiones (duda resuelta). |
| N-02 | Contador de avisos. | REGLAS §7: avisos, no construir todavía. |
| N-03 | Entradas a Deudas, Recurrentes, Inversiones, Avisos. | REGLAS §7: no construir todavía. |
| N-04 | Entrada a Metas. | No figura en REGLAS; requiere enmendar §7 antes. |
| N-05 | «Registrar» / captura rápida. | Feature propia con su diseño e inventario. |
| N-08 | TRM en la cabecera de Cuentas. | USD fuera hasta inversiones. |
| N-19 | Corte y pago límite de la tarjeta. | REGLAS §7: tarjeta con ciclo, no construir todavía. |
| N-20 | Cuenta en USD con equivalente COP. | REGLAS §7: inversiones, no construir todavía. |
| N-21 | Detalle de préstamo otorgado. | REGLAS §7: deudas y préstamos, no construir todavía. |
| N-22 | Detalle de deuda contraída. | REGLAS §7: deudas y préstamos, no construir todavía. |

## Ya cubierto

| ID | Necesidad | Cubierta por |
|---|---|---|
| N-07 | Zona horaria del usuario. | SPEC 02 |

## Dudas resueltas

| ID | Pregunta | Decisión |
|---|---|---|
| N-09, N-33 | ¿Qué tipos de cuenta entran? | Efectivo, banco y tarjeta sin ciclo. Inversión, préstamo otorgado y deuda contraída fuera. |
| N-01, N-08, N-20 | ¿USD y TRM ya? | No: solo COP hasta inversiones. |
| N-30, N-38, N-41 | ¿Qué acciones sobre una cuenta? | Crear, editar y eliminar. |
| N-25, N-26 | ¿Dónde vive el orden? | En la API, por usuario. |
| N-40 | ¿Se puede editar el saldo inicial? | Sí, y el cambio queda registrado. |
| N-39 | ¿Se puede cambiar el tipo? | Solo dentro de la misma naturaleza. |
| N-42 | ¿Eliminar con movimientos? | Se archiva. |
| N-43 | ¿Saldo de una archivada? | Solo se archiva con saldo cero. |
| N-45, N-46 | ¿Ver y restaurar archivadas? | Sí, ambas. |
| N-32 | ¿Nombre único? | Sí, por usuario. |
| N-32, N-46 | ¿El nombre único incluye archivadas? | No, solo entre no archivadas. |

## Retiradas

| ID | Motivo | Fecha |
|---|---|---|
