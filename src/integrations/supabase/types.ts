export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      campaign_clients: {
        Row: {
          campaign_id: string
          document: string
          id: string
          name: string
        }
        Insert: {
          campaign_id: string
          document?: string
          id?: string
          name?: string
        }
        Update: {
          campaign_id?: string
          document?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_clients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_due_dates: {
        Row: {
          campaign_id: string
          due_date: string
          id: string
          region_type: string
          region_value: string
        }
        Insert: {
          campaign_id: string
          due_date: string
          id?: string
          region_type?: string
          region_value: string
        }
        Update: {
          campaign_id?: string
          due_date?: string
          id?: string
          region_type?: string
          region_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_due_dates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_payment_methods: {
        Row: {
          active: boolean
          annual_interest_rate: number
          campaign_id: string
          id: string
          markup_percent: number
          method_name: string
        }
        Insert: {
          active?: boolean
          annual_interest_rate?: number
          campaign_id: string
          id?: string
          markup_percent?: number
          method_name: string
        }
        Update: {
          active?: boolean
          annual_interest_rate?: number
          campaign_id?: string
          id?: string
          markup_percent?: number
          method_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_payment_methods_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_products: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          product_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          product_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_products_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_segments: {
        Row: {
          active: boolean
          campaign_id: string
          id: string
          price_adjustment_percent: number
          segment_name: string
        }
        Insert: {
          active?: boolean
          campaign_id: string
          id?: string
          price_adjustment_percent?: number
          segment_name: string
        }
        Update: {
          active?: boolean
          campaign_id?: string
          id?: string
          price_adjustment_percent?: number
          segment_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_segments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          active: boolean
          active_modules: string[] | null
          available_due_dates: string[] | null
          commodities: string[]
          created_at: string
          created_by: string | null
          currency: string
          eligible_cities: string[] | null
          eligible_client_segments: string[] | null
          eligible_distributor_segments:
            | Database["public"]["Enums"]["channel_segment"][]
            | null
          eligible_mesoregions: string[] | null
          eligible_states: string[] | null
          exchange_rate_barter: number
          exchange_rate_products: number
          id: string
          interest_rate: number
          max_discount_internal: number
          max_discount_reseller: number
          name: string
          price_list_format: Database["public"]["Enums"]["price_list_format"]
          season: string
          target: Database["public"]["Enums"]["campaign_target"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          active_modules?: string[] | null
          available_due_dates?: string[] | null
          commodities?: string[]
          created_at?: string
          created_by?: string | null
          currency?: string
          eligible_cities?: string[] | null
          eligible_client_segments?: string[] | null
          eligible_distributor_segments?:
            | Database["public"]["Enums"]["channel_segment"][]
            | null
          eligible_mesoregions?: string[] | null
          eligible_states?: string[] | null
          exchange_rate_barter?: number
          exchange_rate_products?: number
          id?: string
          interest_rate?: number
          max_discount_internal?: number
          max_discount_reseller?: number
          name: string
          price_list_format?: Database["public"]["Enums"]["price_list_format"]
          season: string
          target?: Database["public"]["Enums"]["campaign_target"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          active_modules?: string[] | null
          available_due_dates?: string[] | null
          commodities?: string[]
          created_at?: string
          created_by?: string | null
          currency?: string
          eligible_cities?: string[] | null
          eligible_client_segments?: string[] | null
          eligible_distributor_segments?:
            | Database["public"]["Enums"]["channel_segment"][]
            | null
          eligible_mesoregions?: string[] | null
          eligible_states?: string[] | null
          exchange_rate_barter?: number
          exchange_rate_products?: number
          id?: string
          interest_rate?: number
          max_discount_internal?: number
          max_discount_reseller?: number
          name?: string
          price_list_format?: Database["public"]["Enums"]["price_list_format"]
          season?: string
          target?: Database["public"]["Enums"]["campaign_target"]
          updated_at?: string
        }
        Relationships: []
      }
      channel_margins: {
        Row: {
          campaign_id: string
          id: string
          margin_percent: number
          segment: Database["public"]["Enums"]["channel_segment"]
        }
        Insert: {
          campaign_id: string
          id?: string
          margin_percent?: number
          segment: Database["public"]["Enums"]["channel_segment"]
        }
        Update: {
          campaign_id?: string
          id?: string
          margin_percent?: number
          segment?: Database["public"]["Enums"]["channel_segment"]
        }
        Relationships: [
          {
            foreignKeyName: "channel_margins_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      combo_products: {
        Row: {
          combo_id: string
          id: string
          max_dose_per_ha: number
          min_dose_per_ha: number
          product_id: string
        }
        Insert: {
          combo_id: string
          id?: string
          max_dose_per_ha?: number
          min_dose_per_ha?: number
          product_id: string
        }
        Update: {
          combo_id?: string
          id?: string
          max_dose_per_ha?: number
          min_dose_per_ha?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "combo_products_combo_id_fkey"
            columns: ["combo_id"]
            isOneToOne: false
            referencedRelation: "combos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      combos: {
        Row: {
          campaign_id: string
          created_at: string
          discount_percent: number
          id: string
          name: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          discount_percent?: number
          id?: string
          name: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          discount_percent?: number
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "combos_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      commodity_pricing: {
        Row: {
          basis_by_port: Json | null
          campaign_id: string
          commodity: Database["public"]["Enums"]["commodity_type"]
          contract: string
          exchange: string
          exchange_price: number
          exchange_rate_bolsa: number
          exchange_rate_option: number | null
          id: string
          option_cost: number | null
          security_delta_freight: number | null
          security_delta_market: number | null
          stop_loss: number | null
          updated_at: string
          volatility: number | null
        }
        Insert: {
          basis_by_port?: Json | null
          campaign_id: string
          commodity?: Database["public"]["Enums"]["commodity_type"]
          contract?: string
          exchange?: string
          exchange_price?: number
          exchange_rate_bolsa?: number
          exchange_rate_option?: number | null
          id?: string
          option_cost?: number | null
          security_delta_freight?: number | null
          security_delta_market?: number | null
          stop_loss?: number | null
          updated_at?: string
          volatility?: number | null
        }
        Update: {
          basis_by_port?: Json | null
          campaign_id?: string
          commodity?: Database["public"]["Enums"]["commodity_type"]
          contract?: string
          exchange?: string
          exchange_price?: number
          exchange_rate_bolsa?: number
          exchange_rate_option?: number | null
          id?: string
          option_cost?: number | null
          security_delta_freight?: number | null
          security_delta_market?: number | null
          stop_loss?: number | null
          updated_at?: string
          volatility?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "commodity_pricing_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      freight_reducers: {
        Row: {
          adjustment: number | null
          campaign_id: string | null
          cost_per_km: number
          destination: string
          distance_km: number
          id: string
          origin: string
          total_reducer: number
        }
        Insert: {
          adjustment?: number | null
          campaign_id?: string | null
          cost_per_km?: number
          destination: string
          distance_km?: number
          id?: string
          origin: string
          total_reducer?: number
        }
        Update: {
          adjustment?: number | null
          campaign_id?: string | null
          cost_per_km?: number
          destination?: string
          distance_km?: number
          id?: string
          origin?: string
          total_reducer?: number
        }
        Relationships: [
          {
            foreignKeyName: "freight_reducers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_documents: {
        Row: {
          created_at: string
          data: Json | null
          doc_type: Database["public"]["Enums"]["document_type"]
          generated_at: string | null
          id: string
          operation_id: string
          signed_at: string | null
          status: Database["public"]["Enums"]["document_status"]
        }
        Insert: {
          created_at?: string
          data?: Json | null
          doc_type: Database["public"]["Enums"]["document_type"]
          generated_at?: string | null
          id?: string
          operation_id: string
          signed_at?: string | null
          status?: Database["public"]["Enums"]["document_status"]
        }
        Update: {
          created_at?: string
          data?: Json | null
          doc_type?: Database["public"]["Enums"]["document_type"]
          generated_at?: string | null
          id?: string
          operation_id?: string
          signed_at?: string | null
          status?: Database["public"]["Enums"]["document_status"]
        }
        Relationships: [
          {
            foreignKeyName: "operation_documents_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_items: {
        Row: {
          base_price: number | null
          boxes: number | null
          dose_per_hectare: number
          id: string
          interest_component: number | null
          margin_component: number | null
          normalized_price: number | null
          operation_id: string
          pallets: number | null
          product_id: string
          raw_quantity: number | null
          rounded_quantity: number | null
          subtotal: number | null
        }
        Insert: {
          base_price?: number | null
          boxes?: number | null
          dose_per_hectare?: number
          id?: string
          interest_component?: number | null
          margin_component?: number | null
          normalized_price?: number | null
          operation_id: string
          pallets?: number | null
          product_id: string
          raw_quantity?: number | null
          rounded_quantity?: number | null
          subtotal?: number | null
        }
        Update: {
          base_price?: number | null
          boxes?: number | null
          dose_per_hectare?: number
          id?: string
          interest_component?: number | null
          margin_component?: number | null
          normalized_price?: number | null
          operation_id?: string
          pallets?: number | null
          product_id?: string
          raw_quantity?: number | null
          rounded_quantity?: number | null
          subtotal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "operation_items_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          operation_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          operation_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          operation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_logs_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
        ]
      }
      operations: {
        Row: {
          area_hectares: number | null
          barter_discount: number | null
          campaign_id: string
          channel: Database["public"]["Enums"]["channel_segment"]
          city: string | null
          client_document: string | null
          client_name: string
          combo_discount: number | null
          commodity: Database["public"]["Enums"]["commodity_type"] | null
          commodity_price: number | null
          counterparty: string | null
          created_at: string
          distributor_id: string | null
          distributor_margin: number | null
          due_date: string | null
          due_months: number | null
          financial_revenue: number | null
          gross_revenue: number | null
          has_existing_contract: boolean | null
          id: string
          insurance_premium_sacas: number | null
          net_revenue: number | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          reference_price: number | null
          state: string | null
          status: Database["public"]["Enums"]["operation_status"]
          total_sacas: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          area_hectares?: number | null
          barter_discount?: number | null
          campaign_id: string
          channel?: Database["public"]["Enums"]["channel_segment"]
          city?: string | null
          client_document?: string | null
          client_name?: string
          combo_discount?: number | null
          commodity?: Database["public"]["Enums"]["commodity_type"] | null
          commodity_price?: number | null
          counterparty?: string | null
          created_at?: string
          distributor_id?: string | null
          distributor_margin?: number | null
          due_date?: string | null
          due_months?: number | null
          financial_revenue?: number | null
          gross_revenue?: number | null
          has_existing_contract?: boolean | null
          id?: string
          insurance_premium_sacas?: number | null
          net_revenue?: number | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          reference_price?: number | null
          state?: string | null
          status?: Database["public"]["Enums"]["operation_status"]
          total_sacas?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          area_hectares?: number | null
          barter_discount?: number | null
          campaign_id?: string
          channel?: Database["public"]["Enums"]["channel_segment"]
          city?: string | null
          client_document?: string | null
          client_name?: string
          combo_discount?: number | null
          commodity?: Database["public"]["Enums"]["commodity_type"] | null
          commodity_price?: number | null
          counterparty?: string | null
          created_at?: string
          distributor_id?: string | null
          distributor_margin?: number | null
          due_date?: string | null
          due_months?: number | null
          financial_revenue?: number | null
          gross_revenue?: number | null
          has_existing_contract?: boolean | null
          id?: string
          insurance_premium_sacas?: number | null
          net_revenue?: number | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          reference_price?: number | null
          state?: string | null
          status?: Database["public"]["Enums"]["operation_status"]
          total_sacas?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active_ingredient: string | null
          boxes_per_pallet: number
          category: string
          created_at: string
          currency: string
          dose_per_hectare: number
          id: string
          includes_margin: boolean
          max_dose: number
          min_dose: number
          name: string
          package_sizes: number[] | null
          pallets_per_truck: number
          price_per_unit: number
          price_type: string
          unit_type: string
          units_per_box: number
        }
        Insert: {
          active_ingredient?: string | null
          boxes_per_pallet?: number
          category: string
          created_at?: string
          currency?: string
          dose_per_hectare?: number
          id?: string
          includes_margin?: boolean
          max_dose?: number
          min_dose?: number
          name: string
          package_sizes?: number[] | null
          pallets_per_truck?: number
          price_per_unit?: number
          price_type?: string
          unit_type?: string
          units_per_box?: number
        }
        Update: {
          active_ingredient?: string | null
          boxes_per_pallet?: number
          category?: string
          created_at?: string
          currency?: string
          dose_per_hectare?: number
          id?: string
          includes_margin?: boolean
          max_dose?: number
          min_dose?: number
          name?: string
          package_sizes?: number[] | null
          pallets_per_truck?: number
          price_per_unit?: number
          price_type?: string
          unit_type?: string
          units_per_box?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          channel_segment: Database["public"]["Enums"]["channel_segment"] | null
          city: string | null
          company: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          position: string | null
          state: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_segment?:
            | Database["public"]["Enums"]["channel_segment"]
            | null
          city?: string | null
          company?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          position?: string | null
          state?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_segment?:
            | Database["public"]["Enums"]["channel_segment"]
            | null
          city?: string | null
          company?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          position?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "sales" | "distributor" | "client"
      campaign_target: "produtor" | "distribuidor" | "venda_direta"
      channel_segment: "direto" | "distribuidor" | "cooperativa"
      commodity_type: "soja" | "milho" | "cafe" | "algodao"
      document_status: "pendente" | "emitido" | "assinado" | "validado"
      document_type:
        | "termo_adesao"
        | "pedido"
        | "termo_barter"
        | "ccv"
        | "cessao_credito"
        | "cpr"
        | "duplicata"
        | "nota_comercial"
        | "hipoteca"
        | "alienacao_fiduciaria"
        | "certificado_aceite"
      operation_status:
        | "simulacao"
        | "pedido"
        | "formalizado"
        | "garantido"
        | "faturado"
        | "monitorando"
        | "liquidado"
      payment_method: "brl" | "usd" | "barter"
      price_list_format:
        | "brl_vista"
        | "brl_prazo"
        | "usd_vista"
        | "usd_prazo"
        | "brl_vista_com_margem"
        | "brl_prazo_com_margem"
        | "usd_vista_com_margem"
        | "usd_prazo_com_margem"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "sales", "distributor", "client"],
      campaign_target: ["produtor", "distribuidor", "venda_direta"],
      channel_segment: ["direto", "distribuidor", "cooperativa"],
      commodity_type: ["soja", "milho", "cafe", "algodao"],
      document_status: ["pendente", "emitido", "assinado", "validado"],
      document_type: [
        "termo_adesao",
        "pedido",
        "termo_barter",
        "ccv",
        "cessao_credito",
        "cpr",
        "duplicata",
        "nota_comercial",
        "hipoteca",
        "alienacao_fiduciaria",
        "certificado_aceite",
      ],
      operation_status: [
        "simulacao",
        "pedido",
        "formalizado",
        "garantido",
        "faturado",
        "monitorando",
        "liquidado",
      ],
      payment_method: ["brl", "usd", "barter"],
      price_list_format: [
        "brl_vista",
        "brl_prazo",
        "usd_vista",
        "usd_prazo",
        "brl_vista_com_margem",
        "brl_prazo_com_margem",
        "usd_vista_com_margem",
        "usd_prazo_com_margem",
      ],
    },
  },
} as const
