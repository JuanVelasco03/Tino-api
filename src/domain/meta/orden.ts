/** Orden de los grupos de metas (SPEC 13, N-09). */

type Ordenable = {
  fechaMeta: string | null;
  creadoEn: Date;
  cumplidaEl: string | null;
  archivadaEn: Date | null;
};

/** Activas: fecha meta más cercana primero, sin fecha al final; empate por creación. */
export function ordenarActivas<T extends Ordenable>(metas: readonly T[]): T[] {
  return metas.toSorted((x, y) => {
    if (x.fechaMeta !== y.fechaMeta) {
      if (x.fechaMeta === null) return 1;
      if (y.fechaMeta === null) return -1;
      return x.fechaMeta < y.fechaMeta ? -1 : 1;
    }
    return x.creadoEn.getTime() - y.creadoEn.getTime();
  });
}

/** Cumplidas: el cumplimiento más reciente primero. */
export function ordenarCumplidas<T extends Ordenable>(metas: readonly T[]): T[] {
  return metas.toSorted((x, y) => {
    const a = x.cumplidaEl ?? "";
    const b = y.cumplidaEl ?? "";
    if (a !== b) return a > b ? -1 : 1;
    return y.creadoEn.getTime() - x.creadoEn.getTime();
  });
}

/** Archivadas: la archivada más recientemente primero. */
export function ordenarArchivadas<T extends Ordenable>(metas: readonly T[]): T[] {
  return metas.toSorted(
    (x, y) => (y.archivadaEn?.getTime() ?? 0) - (x.archivadaEn?.getTime() ?? 0),
  );
}
