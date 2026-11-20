export type MonedaBase = "COP" | "USD";

export type Perfil = {
  id: string;
  nombre: string | null;
  monedaBase: MonedaBase;
  zonaHoraria: string;
  primerUsoCompletado: boolean;
  /** La elegida por el usuario, tal cual; la captura la resuelve si falta o está archivada. */
  cuentaPredeterminadaId: string | null;
};

/** Zona por defecto si el usuario no tiene perfil (cuenta anterior a SPEC 02). */
export const ZONA_HORARIA_POR_DEFECTO = "America/Bogota";
