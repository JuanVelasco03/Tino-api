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
      cuentas: {
        Row: {
          actualizado_en: string;
          archivada_en: string | null;
          creado_en: string;
          cupo: number | null;
          detalle: string | null;
          id: string;
          nombre: string;
          posicion: number;
          saldo_inicial: number;
          tipo: string;
          usuario_id: string;
        };
        Insert: {
          actualizado_en?: string;
          archivada_en?: string | null;
          creado_en?: string;
          cupo?: number | null;
          detalle?: string | null;
          id?: string;
          nombre: string;
          posicion: number;
          saldo_inicial?: number;
          tipo: string;
          usuario_id?: string;
        };
        Update: {
          actualizado_en?: string;
          archivada_en?: string | null;
          creado_en?: string;
          cupo?: number | null;
          detalle?: string | null;
          id?: string;
          nombre?: string;
          posicion?: number;
          saldo_inicial?: number;
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
          valor_anterior: number;
          valor_nuevo: number;
        };
        Insert: {
          cambiado_en?: string;
          campo: string;
          cuenta_id: string;
          id?: string;
          usuario_id: string;
          valor_anterior: number;
          valor_nuevo: number;
        };
        Update: {
          cambiado_en?: string;
          campo?: string;
          cuenta_id?: string;
          id?: string;
          usuario_id?: string;
          valor_anterior?: number;
          valor_nuevo?: number;
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
            referencedRelation: "cuentas_con_saldo";
            referencedColumns: ["id"];
          },
        ];
      };
      perfiles: {
        Row: {
          actualizado_en: string;
          creado_en: string;
          id: string;
          moneda_base: string;
          nombre: string | null;
          primer_uso_completado: boolean;
          zona_horaria: string;
        };
        Insert: {
          actualizado_en?: string;
          creado_en?: string;
          id: string;
          moneda_base?: string;
          nombre?: string | null;
          primer_uso_completado?: boolean;
          zona_horaria?: string;
        };
        Update: {
          actualizado_en?: string;
          creado_en?: string;
          id?: string;
          moneda_base?: string;
          nombre?: string | null;
          primer_uso_completado?: boolean;
          zona_horaria?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      cuentas_con_saldo: {
        Row: {
          actualizado_en: string | null;
          archivada_en: string | null;
          creado_en: string | null;
          cupo: number | null;
          detalle: string | null;
          id: string | null;
          nombre: string | null;
          posicion: number | null;
          saldo: number | null;
          saldo_inicial: number | null;
          tipo: string | null;
          usuario_id: string | null;
        };
        Insert: {
          actualizado_en?: string | null;
          archivada_en?: string | null;
          creado_en?: string | null;
          cupo?: number | null;
          detalle?: string | null;
          id?: string | null;
          nombre?: string | null;
          posicion?: number | null;
          saldo?: number | null;
          saldo_inicial?: number | null;
          tipo?: string | null;
          usuario_id?: string | null;
        };
        Update: {
          actualizado_en?: string | null;
          archivada_en?: string | null;
          creado_en?: string | null;
          cupo?: number | null;
          detalle?: string | null;
          id?: string | null;
          nombre?: string | null;
          posicion?: number | null;
          saldo?: number | null;
          saldo_inicial?: number | null;
          tipo?: string | null;
          usuario_id?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      naturaleza_de: { Args: { tipo: string }; Returns: string };
      reordenar_cuentas: {
        Args: { p_ids: string[]; p_naturaleza: string };
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
