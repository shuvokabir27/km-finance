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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_credentials: {
        Row: {
          created_at: string
          email: string
          mobile: string
          pin: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          mobile: string
          pin: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          mobile?: string
          pin?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          created_at: string
          date: string
          id: string
          member_id: string
          owner_id: string
          present: boolean
          rate_override: number | null
          shooting_id: string | null
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          member_id: string
          owner_id: string
          present?: boolean
          rate_override?: number | null
          shooting_id?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          member_id?: string
          owner_id?: string
          present?: boolean
          rate_override?: number | null
          shooting_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_shooting_id_fkey"
            columns: ["shooting_id"]
            isOneToOne: false
            referencedRelation: "shootings"
            referencedColumns: ["id"]
          },
        ]
      }
      bonuses: {
        Row: {
          amount: number
          created_at: string
          given_at: string
          id: string
          member_id: string
          note: string | null
          owner_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          given_at?: string
          id?: string
          member_id: string
          note?: string | null
          owner_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          given_at?: string
          id?: string
          member_id?: string
          note?: string | null
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonuses_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_incomes: {
        Row: {
          amount: number
          channel_id: string
          created_at: string
          earned_at: string
          id: string
          note: string | null
          owner_id: string
          shooting_id: string | null
          source: Database["public"]["Enums"]["income_source"]
          updated_at: string
        }
        Insert: {
          amount?: number
          channel_id: string
          created_at?: string
          earned_at?: string
          id?: string
          note?: string | null
          owner_id: string
          shooting_id?: string | null
          source?: Database["public"]["Enums"]["income_source"]
          updated_at?: string
        }
        Update: {
          amount?: number
          channel_id?: string
          created_at?: string
          earned_at?: string
          id?: string
          note?: string | null
          owner_id?: string
          shooting_id?: string | null
          source?: Database["public"]["Enums"]["income_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_incomes_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_incomes_shooting_id_fkey"
            columns: ["shooting_id"]
            isOneToOne: false
            referencedRelation: "shootings"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_partner_members: {
        Row: {
          created_at: string
          id: string
          member_id: string
          owner_id: string
          partner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_id: string
          owner_id: string
          partner_id: string
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string
          owner_id?: string
          partner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_partner_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_partner_members_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "channel_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_partners: {
        Row: {
          channel_id: string
          created_at: string
          id: string
          member_id: string | null
          note: string | null
          owner_id: string
          partner_name: string
          share_percent: number
          updated_at: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          member_id?: string | null
          note?: string | null
          owner_id: string
          partner_name: string
          share_percent?: number
          updated_at?: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          member_id?: string | null
          note?: string | null
          owner_id?: string
          partner_name?: string
          share_percent?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_partners_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_partners_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          created_at: string
          id: string
          is_own: boolean
          is_shared: boolean
          logo_url: string | null
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_own?: boolean
          is_shared?: boolean
          logo_url?: string | null
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_own?: boolean
          is_shared?: boolean
          logo_url?: string | null
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      client_payments: {
        Row: {
          amount: number
          channel: string
          created_at: string
          id: string
          method: string | null
          note: string | null
          owner_id: string
          received_at: string
          shooting_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          channel: string
          created_at?: string
          id?: string
          method?: string | null
          note?: string | null
          owner_id: string
          received_at?: string
          shooting_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          channel?: string
          created_at?: string
          id?: string
          method?: string | null
          note?: string | null
          owner_id?: string
          received_at?: string
          shooting_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_payments_shooting_id_fkey"
            columns: ["shooting_id"]
            isOneToOne: false
            referencedRelation: "shootings"
            referencedColumns: ["id"]
          },
        ]
      }
      directors: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          photo_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          photo_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          photo_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      member_accounts: {
        Row: {
          account_holder: string | null
          account_number: string
          bank_name: string | null
          branch: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["account_kind"]
          member_id: string
          note: string | null
          owner_id: string
        }
        Insert: {
          account_holder?: string | null
          account_number: string
          bank_name?: string | null
          branch?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["account_kind"]
          member_id: string
          note?: string | null
          owner_id: string
        }
        Update: {
          account_holder?: string | null
          account_number?: string
          bank_name?: string | null
          branch?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["account_kind"]
          member_id?: string
          note?: string | null
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_accounts_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          phone: string | null
          photo_url: string | null
          rate: number
          role: string | null
          share_enabled: boolean
          share_from: string | null
          share_to: string | null
          share_token: string | null
          type: Database["public"]["Enums"]["member_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          phone?: string | null
          photo_url?: string | null
          rate?: number
          role?: string | null
          share_enabled?: boolean
          share_from?: string | null
          share_to?: string | null
          share_token?: string | null
          type: Database["public"]["Enums"]["member_type"]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          phone?: string | null
          photo_url?: string | null
          rate?: number
          role?: string | null
          share_enabled?: boolean
          share_from?: string | null
          share_to?: string | null
          share_token?: string | null
          type?: Database["public"]["Enums"]["member_type"]
        }
        Relationships: []
      }
      monthly_salaries: {
        Row: {
          amount: number
          created_at: string
          id: string
          member_id: string
          month: string
          owner_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          member_id: string
          month: string
          owner_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          member_id?: string
          month?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_salaries_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_payouts: {
        Row: {
          amount: number
          bank_account_number: string | null
          created_at: string
          id: string
          method: string
          note: string | null
          owner_id: string
          paid_at: string
          partner_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          bank_account_number?: string | null
          created_at?: string
          id?: string
          method?: string
          note?: string | null
          owner_id: string
          paid_at?: string
          partner_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_number?: string | null
          created_at?: string
          id?: string
          method?: string
          note?: string | null
          owner_id?: string
          paid_at?: string
          partner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_payouts_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "channel_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bank_account_number: string | null
          channel_id: string | null
          created_at: string
          id: string
          member_id: string
          method: string
          note: string | null
          owner_id: string
          paid_at: string
        }
        Insert: {
          amount: number
          bank_account_number?: string | null
          channel_id?: string | null
          created_at?: string
          id?: string
          member_id: string
          method?: string
          note?: string | null
          owner_id: string
          paid_at?: string
        }
        Update: {
          amount?: number
          bank_account_number?: string | null
          channel_id?: string | null
          created_at?: string
          id?: string
          member_id?: string
          method?: string
          note?: string | null
          owner_id?: string
          paid_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_channel_reports: {
        Row: {
          channel_id: string
          created_at: string
          date_from: string | null
          date_to: string | null
          id: string
          owner_id: string
          shooting_id: string | null
          token: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          id?: string
          owner_id: string
          shooting_id?: string | null
          token?: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          id?: string
          owner_id?: string
          shooting_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_channel_reports_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_channel_reports_shooting_id_fkey"
            columns: ["shooting_id"]
            isOneToOne: false
            referencedRelation: "shootings"
            referencedColumns: ["id"]
          },
        ]
      }
      shooting_expenses: {
        Row: {
          amount: number
          created_at: string
          id: string
          note: string | null
          owner_id: string
          shooting_id: string
          spent_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          owner_id: string
          shooting_id: string
          spent_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          owner_id?: string
          shooting_id?: string
          spent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shooting_expenses_shooting_id_fkey"
            columns: ["shooting_id"]
            isOneToOne: false
            referencedRelation: "shootings"
            referencedColumns: ["id"]
          },
        ]
      }
      shootings: {
        Row: {
          channel: string | null
          contract_amount: number | null
          created_at: string
          director: string | null
          id: string
          location: string | null
          name: string
          note: string | null
          owner_id: string
          shoot_date: string
        }
        Insert: {
          channel?: string | null
          contract_amount?: number | null
          created_at?: string
          director?: string | null
          id?: string
          location?: string | null
          name: string
          note?: string | null
          owner_id: string
          shoot_date?: string
        }
        Update: {
          channel?: string | null
          contract_amount?: number | null
          created_at?: string
          director?: string | null
          id?: string
          location?: string | null
          name?: string
          note?: string | null
          owner_id?: string
          shoot_date?: string
        }
        Relationships: []
      }
      sms_otp_codes: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          email: string
          expires_at: string
          id: string
          mobile: string
          used: boolean
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          mobile: string
          used?: boolean
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          mobile?: string
          used?: boolean
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      admin_credentials_safe: {
        Row: {
          created_at: string | null
          email: string | null
          has_pin: boolean | null
          mobile: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          has_pin?: never
          mobile?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          has_pin?: never
          mobile?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_monthly_salaries_for_all: { Args: never; Returns: undefined }
      client_channel_summary: {
        Args: never
        Returns: {
          channel: string
          contract_total: number
          due_total: number
          received_total: number
          shooting_count: number
        }[]
      }
      find_email_by_mobile_pin: {
        Args: { _mobile: string; _pin: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      member_balance: {
        Args: { _channel_id?: string; _member_id: string }
        Returns: number
      }
      partner_ledger: {
        Args: never
        Returns: {
          channel_id: string
          channel_name: string
          due: number
          entitled: number
          net_profit: number
          paid_total: number
          partner_id: string
          partner_name: string
          share_percent: number
        }[]
      }
      shared_channel_summary: {
        Args: never
        Returns: {
          channel_id: string
          channel_name: string
          expense_total: number
          income_total: number
          net_profit: number
          partner_count: number
        }[]
      }
      shooting_summary: {
        Args: { _shooting_id: string }
        Returns: {
          attendance_cost: number
          extra_cost: number
          present_count: number
          total_cost: number
        }[]
      }
    }
    Enums: {
      account_kind: "bkash" | "nagad" | "rocket" | "upay" | "bank"
      app_role: "admin" | "user"
      income_source: "facebook" | "youtube" | "ads" | "other"
      member_type: "daily" | "monthly"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      account_kind: ["bkash", "nagad", "rocket", "upay", "bank"],
      app_role: ["admin", "user"],
      income_source: ["facebook", "youtube", "ads", "other"],
      member_type: ["daily", "monthly"],
    },
  },
} as const
