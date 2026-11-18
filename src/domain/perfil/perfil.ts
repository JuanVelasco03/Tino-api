export type MonedaBase = "COP" | "USD";

export type Perfil = {
  id: string;
  nombre: string | null;
  monedaBase: MonedaBase;
  zonaHoraria: string;
  primerUsoCompletado: boolean;
};
