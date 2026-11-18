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
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
