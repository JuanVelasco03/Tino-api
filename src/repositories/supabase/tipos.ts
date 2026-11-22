/* Generado con el MCP de Supabase (generate_typescript_types). No editar a mano. */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      categorias: {
        Row: {
          creado_en: string;
          id: string;
          nombre: string;
          posicion: number;
          tipo: string;
          usuario_id: string;
        };
        Insert: {
          creado_en?: string;
          id?: string;
          nombre: string;
          posicion: number;
          tipo: string;
          usuario_id: string;
        };
        Update: {
          creado_en?: string;
          id?: string;
          nombre?: string;
          posicion?: number;
          tipo?: string;
          usuario_id?: string;
        };
        Relationships: [];
      };
      cuentas: {
        Row: {
          actualizado_en: string;
          archivada_en: string | null;
          creado_en: string;
          cupo: string | null;
          detalle: string | null;
          id: string;
          nombre: string;
          posicion: number;
          saldo_inicial: string;
          tipo: string;
          usuario_id: string;
        };
        Insert: {
          actualizado_en?: string;
          archivada_en?: string | null;
          creado_en?: string;
          cupo?: string | null;
          detalle?: string | null;
          id?: string;
          nombre: string;
          posicion: number;
          saldo_inicial: string;
          tipo: string;
          usuario_id?: string;
        };
        Update: {
          actualizado_en?: string;
          archivada_en?: string | null;
          creado_en?: string;
          cupo?: string | null;
          detalle?: string | null;
          id?: string;
          nombre?: string;
          posicion?: number;
          saldo_inicial?: string;
          tipo?: string;
          usuario_id?: string;
        };
        Relationships: [];
      };
      cuentas_cambios: {
        Row: {
          cambiado_en: string;
          campo: string;
          cuenta_id: string;
          id: string;
          usuario_id: string;
          valor_anterior: string;
          valor_nuevo: string;
        };
        Insert: {
          cambiado_en?: string;
          campo: string;
          cuenta_id: string;
          id?: string;
          usuario_id: string;
          valor_anterior: string;
          valor_nuevo: string;
        };
        Update: {
          cambiado_en?: string;
          campo?: string;
          cuenta_id?: string;
          id?: string;
          usuario_id?: string;
          valor_anterior?: string;
          valor_nuevo?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cuentas_cambios_cuenta_id_fkey";
            columns: ["cuenta_id"];
            isOneToOne: false;
            referencedRelation: "cuentas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cuentas_cambios_cuenta_id_fkey";
            columns: ["cuenta_id"];
            isOneToOne: false;
            referencedRelation: "prestamos_detalle";
            referencedColumns: ["id"];
          },
        ];
      };
      movimiento_partes: {
        Row: {
          categoria_id: string;
          id: string;
          monto: string;
          movimiento_id: string;
          usuario_id: string;
        };
        Insert: {
          categoria_id: string;
          id?: string;
          monto: string;
          movimiento_id: string;
          usuario_id: string;
        };
        Update: {
          categoria_id?: string;
          id?: string;
          monto?: string;
          movimiento_id?: string;
          usuario_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "movimiento_partes_categoria_fkey";
            columns: ["usuario_id", "categoria_id"];
            isOneToOne: false;
            referencedRelation: "categorias";
            referencedColumns: ["usuario_id", "id"];
          },
          {
            foreignKeyName: "movimiento_partes_movimiento_id_fkey";
            columns: ["movimiento_id"];
            isOneToOne: false;
            referencedRelation: "movimientos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "movimiento_partes_movimiento_id_fkey";
            columns: ["movimiento_id"];
            isOneToOne: false;
            referencedRelation: "movimientos_detalle";
            referencedColumns: ["id"];
          },
        ];
      };
      movimientos: {
        Row: {
          actualizado_en: string;
          categoria_id: string | null;
          creado_en: string;
          cuenta_destino_id: string | null;
          cuenta_origen_id: string | null;
          descripcion: string | null;
          fecha: string;
          id: string;
          moneda: string;
          monto: string;
          nota: string | null;
          tasa: number;
          tipo: string;
          usuario_id: string;
        };
        Insert: {
          actualizado_en?: string;
          categoria_id?: string | null;
          creado_en?: string;
          cuenta_destino_id?: string | null;
          cuenta_origen_id?: string | null;
          descripcion?: string | null;
          fecha: string;
          id?: string;
          moneda?: string;
          monto: string;
          nota?: string | null;
          tasa?: number;
          tipo: string;
          usuario_id: string;
        };
        Update: {
          actualizado_en?: string;
          categoria_id?: string | null;
          creado_en?: string;
          cuenta_destino_id?: string | null;
          cuenta_origen_id?: string | null;
          descripcion?: string | null;
          fecha?: string;
          id?: string;
          moneda?: string;
          monto?: string;
          nota?: string | null;
          tasa?: number;
          tipo?: string;
          usuario_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "movimientos_categoria_fkey";
            columns: ["usuario_id", "categoria_id", "tipo"];
            isOneToOne: false;
            referencedRelation: "categorias";
            referencedColumns: ["usuario_id", "id", "tipo"];
          },
          {
            foreignKeyName: "movimientos_cuenta_destino_fkey";
            columns: ["usuario_id", "cuenta_destino_id"];
            isOneToOne: false;
            referencedRelation: "cuentas";
            referencedColumns: ["usuario_id", "id"];
          },
          {
            foreignKeyName: "movimientos_cuenta_origen_fkey";
            columns: ["usuario_id", "cuenta_origen_id"];
            isOneToOne: false;
            referencedRelation: "cuentas";
            referencedColumns: ["usuario_id", "id"];
          },
        ];
      };
      movimientos_cambios: {
        Row: {
          antes: Json;
          cambiado_en: string;
          despues: Json | null;
          id: string;
          movimiento_id: string;
          operacion: string;
          usuario_id: string;
        };
        Insert: {
          antes: Json;
          cambiado_en?: string;
          despues?: Json | null;
          id?: string;
          movimiento_id: string;
          operacion: string;
          usuario_id: string;
        };
        Update: {
          antes?: Json;
          cambiado_en?: string;
          despues?: Json | null;
          id?: string;
          movimiento_id?: string;
          operacion?: string;
          usuario_id?: string;
        };
        Relationships: [];
      };
      perfiles: {
        Row: {
          actualizado_en: string;
          creado_en: string;
          cuenta_predeterminada_id: string | null;
          id: string;
          moneda_base: string;
          nombre: string | null;
          primer_uso_completado: boolean;
          zona_horaria: string;
        };
        Insert: {
          actualizado_en?: string;
          creado_en?: string;
          cuenta_predeterminada_id?: string | null;
          id: string;
          moneda_base?: string;
          nombre?: string | null;
          primer_uso_completado?: boolean;
          zona_horaria?: string;
        };
        Update: {
          actualizado_en?: string;
          creado_en?: string;
          cuenta_predeterminada_id?: string | null;
          id?: string;
          moneda_base?: string;
          nombre?: string | null;
          primer_uso_completado?: boolean;
          zona_horaria?: string;
        };
        Relationships: [
          {
            foreignKeyName: "perfiles_cuenta_predeterminada_fkey";
            columns: ["id", "cuenta_predeterminada_id"];
            isOneToOne: false;
            referencedRelation: "cuentas";
            referencedColumns: ["usuario_id", "id"];
          },
        ];
      };
      prestamos: {
        Row: {
          actualizado_en: string;
          creado_en: string;
          cuenta_id: string;
          fecha_acordada: string | null;
          tasa_mensual_cpb: number;
          usuario_id: string;
        };
        Insert: {
          actualizado_en?: string;
          creado_en?: string;
          cuenta_id: string;
          fecha_acordada?: string | null;
          tasa_mensual_cpb?: number;
          usuario_id?: string;
        };
        Update: {
          actualizado_en?: string;
          creado_en?: string;
          cuenta_id?: string;
          fecha_acordada?: string | null;
          tasa_mensual_cpb?: number;
          usuario_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prestamos_cuenta_fkey";
            columns: ["usuario_id", "cuenta_id"];
            isOneToOne: false;
            referencedRelation: "cuentas";
            referencedColumns: ["usuario_id", "id"];
          },
        ];
      };
      prestamos_cambios: {
        Row: {
          cambiado_en: string;
          campo: string;
          id: string;
          prestamo_id: string;
          usuario_id: string;
          valor_anterior: string | null;
          valor_nuevo: string | null;
        };
        Insert: {
          cambiado_en?: string;
          campo: string;
          id?: string;
          prestamo_id: string;
          usuario_id: string;
          valor_anterior?: string | null;
          valor_nuevo?: string | null;
        };
        Update: {
          cambiado_en?: string;
          campo?: string;
          id?: string;
          prestamo_id?: string;
          usuario_id?: string;
          valor_anterior?: string | null;
          valor_nuevo?: string | null;
        };
        Relationships: [];
      };
      prestamos_intereses: {
        Row: {
          creado_en: string;
          movimiento_capital_id: string | null;
          movimiento_id: string;
          prestamo_id: string;
          usuario_id: string;
        };
        Insert: {
          creado_en?: string;
          movimiento_capital_id?: string | null;
          movimiento_id: string;
          prestamo_id: string;
          usuario_id?: string;
        };
        Update: {
          creado_en?: string;
          movimiento_capital_id?: string | null;
          movimiento_id?: string;
          prestamo_id?: string;
          usuario_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prestamos_intereses_capital_fkey";
            columns: ["usuario_id", "movimiento_capital_id"];
            isOneToOne: false;
            referencedRelation: "movimientos";
            referencedColumns: ["usuario_id", "id"];
          },
          {
            foreignKeyName: "prestamos_intereses_capital_fkey";
            columns: ["usuario_id", "movimiento_capital_id"];
            isOneToOne: false;
            referencedRelation: "movimientos_detalle";
            referencedColumns: ["usuario_id", "id"];
          },
          {
            foreignKeyName: "prestamos_intereses_movimiento_fkey";
            columns: ["usuario_id", "movimiento_id"];
            isOneToOne: false;
            referencedRelation: "movimientos";
            referencedColumns: ["usuario_id", "id"];
          },
          {
            foreignKeyName: "prestamos_intereses_movimiento_fkey";
            columns: ["usuario_id", "movimiento_id"];
            isOneToOne: false;
            referencedRelation: "movimientos_detalle";
            referencedColumns: ["usuario_id", "id"];
          },
          {
            foreignKeyName: "prestamos_intereses_prestamo_fkey";
            columns: ["usuario_id", "prestamo_id"];
            isOneToOne: false;
            referencedRelation: "prestamos";
            referencedColumns: ["usuario_id", "cuenta_id"];
          },
        ];
      };
      recurrentes: {
        Row: {
          actualizado_en: string;
          categoria_id: string | null;
          concepto: string;
          creado_en: string;
          cuenta_destino_id: string | null;
          cuenta_origen_id: string | null;
          generar_desde: string;
          id: string;
          monto: string;
          pausada_desde: string | null;
          periodicidad: string;
          primer_vencimiento: string;
          tipo: string;
          ultimo_dia: boolean;
          usuario_id: string;
          variable: boolean;
        };
        Insert: {
          actualizado_en?: string;
          categoria_id?: string | null;
          concepto: string;
          creado_en?: string;
          cuenta_destino_id?: string | null;
          cuenta_origen_id?: string | null;
          generar_desde: string;
          id: string;
          monto: string;
          pausada_desde?: string | null;
          periodicidad: string;
          primer_vencimiento: string;
          tipo: string;
          ultimo_dia?: boolean;
          usuario_id?: string;
          variable?: boolean;
        };
        Update: {
          actualizado_en?: string;
          categoria_id?: string | null;
          concepto?: string;
          creado_en?: string;
          cuenta_destino_id?: string | null;
          cuenta_origen_id?: string | null;
          generar_desde?: string;
          id?: string;
          monto?: string;
          pausada_desde?: string | null;
          periodicidad?: string;
          primer_vencimiento?: string;
          tipo?: string;
          ultimo_dia?: boolean;
          usuario_id?: string;
          variable?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "recurrentes_categoria_fkey";
            columns: ["usuario_id", "categoria_id", "tipo"];
            isOneToOne: false;
            referencedRelation: "categorias";
            referencedColumns: ["usuario_id", "id", "tipo"];
          },
          {
            foreignKeyName: "recurrentes_cuenta_destino_fkey";
            columns: ["usuario_id", "cuenta_destino_id"];
            isOneToOne: false;
            referencedRelation: "cuentas";
            referencedColumns: ["usuario_id", "id"];
          },
          {
            foreignKeyName: "recurrentes_cuenta_origen_fkey";
            columns: ["usuario_id", "cuenta_origen_id"];
            isOneToOne: false;
            referencedRelation: "cuentas";
            referencedColumns: ["usuario_id", "id"];
          },
        ];
      };
      recurrentes_cambios: {
        Row: {
          antes: Json;
          cambiado_en: string;
          despues: Json | null;
          id: string;
          operacion: string;
          recurrente_id: string;
          usuario_id: string;
        };
        Insert: {
          antes: Json;
          cambiado_en?: string;
          despues?: Json | null;
          id?: string;
          operacion: string;
          recurrente_id: string;
          usuario_id: string;
        };
        Update: {
          antes?: Json;
          cambiado_en?: string;
          despues?: Json | null;
          id?: string;
          operacion?: string;
          recurrente_id?: string;
          usuario_id?: string;
        };
        Relationships: [];
      };
      recurrentes_cierres: {
        Row: {
          creado_en: string;
          estado: string;
          id: string;
          movimiento_id: string | null;
          recurrente_id: string;
          usuario_id: string;
          vencimiento: string;
        };
        Insert: {
          creado_en?: string;
          estado: string;
          id?: string;
          movimiento_id?: string | null;
          recurrente_id: string;
          usuario_id?: string;
          vencimiento: string;
        };
        Update: {
          creado_en?: string;
          estado?: string;
          id?: string;
          movimiento_id?: string | null;
          recurrente_id?: string;
          usuario_id?: string;
          vencimiento?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurrentes_cierres_movimiento_fkey";
            columns: ["usuario_id", "movimiento_id"];
            isOneToOne: false;
            referencedRelation: "movimientos";
            referencedColumns: ["usuario_id", "id"];
          },
          {
            foreignKeyName: "recurrentes_cierres_movimiento_fkey";
            columns: ["usuario_id", "movimiento_id"];
            isOneToOne: false;
            referencedRelation: "movimientos_detalle";
            referencedColumns: ["usuario_id", "id"];
          },
          {
            foreignKeyName: "recurrentes_cierres_recurrente_fkey";
            columns: ["usuario_id", "recurrente_id"];
            isOneToOne: false;
            referencedRelation: "recurrentes";
            referencedColumns: ["usuario_id", "id"];
          },
          {
            foreignKeyName: "recurrentes_cierres_recurrente_fkey";
            columns: ["usuario_id", "recurrente_id"];
            isOneToOne: false;
            referencedRelation: "recurrentes_detalle";
            referencedColumns: ["usuario_id", "id"];
          },
        ];
      };
      reglas_categoria: {
        Row: {
          actualizado_en: string;
          categoria_id: string;
          creado_en: string;
          id: string;
          palabra_clave: string;
          usuario_id: string;
        };
        Insert: {
          actualizado_en?: string;
          categoria_id: string;
          creado_en?: string;
          id?: string;
          palabra_clave: string;
          usuario_id?: string;
        };
        Update: {
          actualizado_en?: string;
          categoria_id?: string;
          creado_en?: string;
          id?: string;
          palabra_clave?: string;
          usuario_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reglas_categoria_categoria_fkey";
            columns: ["usuario_id", "categoria_id"];
            isOneToOne: false;
            referencedRelation: "categorias";
            referencedColumns: ["usuario_id", "id"];
          },
        ];
      };
      trm: {
        Row: {
          obtenida_en: string;
          usuario_id: string;
          valor_cent: number;
          vigente_desde: string;
          vigente_hasta: string;
        };
        Insert: {
          obtenida_en?: string;
          usuario_id?: string;
          valor_cent: number;
          vigente_desde: string;
          vigente_hasta: string;
        };
        Update: {
          obtenida_en?: string;
          usuario_id?: string;
          valor_cent?: number;
          vigente_desde?: string;
          vigente_hasta?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      movimientos_detalle: {
        Row: {
          actualizado_en: string | null;
          categoria_id: string | null;
          categoria_nombre: string | null;
          creado_en: string | null;
          cuenta_destino_id: string | null;
          cuenta_destino_nombre: string | null;
          cuenta_origen_id: string | null;
          cuenta_origen_nombre: string | null;
          descripcion: string | null;
          fecha: string | null;
          id: string | null;
          moneda: string | null;
          monto: string | null;
          nota: string | null;
          partes: Json | null;
          tasa: number | null;
          tipo: string | null;
          usuario_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "movimientos_categoria_fkey";
            columns: ["usuario_id", "categoria_id", "tipo"];
            isOneToOne: false;
            referencedRelation: "categorias";
            referencedColumns: ["usuario_id", "id", "tipo"];
          },
          {
            foreignKeyName: "movimientos_cuenta_destino_fkey";
            columns: ["usuario_id", "cuenta_destino_id"];
            isOneToOne: false;
            referencedRelation: "cuentas";
            referencedColumns: ["usuario_id", "id"];
          },
          {
            foreignKeyName: "movimientos_cuenta_origen_fkey";
            columns: ["usuario_id", "cuenta_origen_id"];
            isOneToOne: false;
            referencedRelation: "cuentas";
            referencedColumns: ["usuario_id", "id"];
          },
        ];
      };
      prestamos_detalle: {
        Row: {
          creado_en: string | null;
          fecha_acordada: string | null;
          id: string | null;
          nombre: string | null;
          tasa_mensual_cpb: number | null;
          tipo: string | null;
        };
        Relationships: [];
      };
      recurrentes_detalle: {
        Row: {
          actualizado_en: string | null;
          categoria_id: string | null;
          categoria_nombre: string | null;
          concepto: string | null;
          creado_en: string | null;
          cuenta_destino_id: string | null;
          cuenta_destino_nombre: string | null;
          cuenta_origen_id: string | null;
          cuenta_origen_nombre: string | null;
          generar_desde: string | null;
          id: string | null;
          monto: string | null;
          pausada_desde: string | null;
          periodicidad: string | null;
          primer_vencimiento: string | null;
          tipo: string | null;
          ultimo_dia: boolean | null;
          usuario_id: string | null;
          variable: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "recurrentes_categoria_fkey";
            columns: ["usuario_id", "categoria_id", "tipo"];
            isOneToOne: false;
            referencedRelation: "categorias";
            referencedColumns: ["usuario_id", "id", "tipo"];
          },
          {
            foreignKeyName: "recurrentes_cuenta_destino_fkey";
            columns: ["usuario_id", "cuenta_destino_id"];
            isOneToOne: false;
            referencedRelation: "cuentas";
            referencedColumns: ["usuario_id", "id"];
          },
          {
            foreignKeyName: "recurrentes_cuenta_origen_fkey";
            columns: ["usuario_id", "cuenta_origen_id"];
            isOneToOne: false;
            referencedRelation: "cuentas";
            referencedColumns: ["usuario_id", "id"];
          },
        ];
      };
    };
    Functions: {
      comprobar_cuentas_actuales: {
        Args: {
          p_movimiento: Database["public"]["Tables"]["movimientos"]["Row"];
        };
        Returns: undefined;
      };
      conceptos_frecuentes: {
        Args: { p_desde: string; p_limite: number };
        Returns: {
          descripcion: string;
          tipo: string;
          usos: number;
        }[];
      };
      conceptos_por_prefijo: {
        Args: { p_limite: number; p_prefijo: string; p_tipo: string };
        Returns: {
          descripcion: string;
          usos: number;
        }[];
      };
      confirmar_ocurrencia: {
        Args: {
          p_monto: string;
          p_movimiento_id: string;
          p_recurrente_id: string;
          p_vencimiento: string;
        };
        Returns: string;
      };
      crear_prestamo: {
        Args: {
          p_cuenta_id: string;
          p_cuenta_propia_id: string;
          p_descripcion: string;
          p_fecha: string;
          p_fecha_acordada: string;
          p_monto: string;
          p_movimiento_id: string;
          p_nombre: string;
          p_saldo_inicial: string;
          p_tasa_mensual_cpb: number;
          p_tipo: string;
        };
        Returns: string;
      };
      eliminar_movimiento: { Args: { p_id: string }; Returns: undefined };
      foto_movimiento: { Args: { p_id: string }; Returns: Json };
      insertar_semilla: { Args: { p_usuario: string }; Returns: undefined };
      naturaleza_de: { Args: { tipo: string }; Returns: string };
      partes_o_vacio: { Args: { p_partes: Json }; Returns: Json };
      reemplazar_movimiento: {
        Args: {
          p_categoria_id: string;
          p_cuenta_destino_id: string;
          p_cuenta_origen_id: string;
          p_descripcion: string;
          p_fecha: string;
          p_id: string;
          p_monto: string;
          p_nota: string;
          p_partes: Json;
          p_tipo: string;
        };
        Returns: string;
      };
      registrar_abono: {
        Args: {
          p_capital: string;
          p_capital_id: string;
          p_categoria_interes_id: string;
          p_cuenta_propia_id: string;
          p_descripcion_capital: string;
          p_descripcion_interes: string;
          p_fecha: string;
          p_interes: string;
          p_interes_id: string;
          p_prestamo_id: string;
        };
        Returns: undefined;
      };
      registrar_movimiento: {
        Args: {
          p_categoria_id: string;
          p_cuenta_destino_id: string;
          p_cuenta_origen_id: string;
          p_descripcion: string;
          p_fecha: string;
          p_id: string;
          p_monto: string;
          p_nota: string;
          p_partes: Json;
          p_tipo: string;
        };
        Returns: string;
      };
      reordenar_cuentas: {
        Args: { p_ids: string[]; p_naturaleza: string };
        Returns: undefined;
      };
      validar_escritura_movimiento: {
        Args: {
          p_categoria_id: string;
          p_cuenta_destino_id: string;
          p_cuenta_origen_id: string;
          p_partes: Json;
          p_tipo: string;
          p_usuario: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
