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
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          ip_address: string | null
          resource_id: string | null
          resource_type: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          role: string
          session_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          role: string
          session_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          role?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          created_at: string | null
          id: string
          language: Database["public"]["Enums"]["language_preference"] | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          language?: Database["public"]["Enums"]["language_preference"] | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          language?: Database["public"]["Enums"]["language_preference"] | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      chw_assignments: {
        Row: {
          assigned_at: string | null
          chw_user_id: string
          city: string | null
          coverage_radius_km: number | null
          id: string
          is_active: boolean | null
          last_location_update: string | null
          latitude: number | null
          longitude: number | null
          region: string
        }
        Insert: {
          assigned_at?: string | null
          chw_user_id: string
          city?: string | null
          coverage_radius_km?: number | null
          id?: string
          is_active?: boolean | null
          last_location_update?: string | null
          latitude?: number | null
          longitude?: number | null
          region: string
        }
        Update: {
          assigned_at?: string | null
          chw_user_id?: string
          city?: string | null
          coverage_radius_km?: number | null
          id?: string
          is_active?: boolean | null
          last_location_update?: string | null
          latitude?: number | null
          longitude?: number | null
          region?: string
        }
        Relationships: []
      }
      emergency_cases: {
        Row: {
          assigned_chw_id: string | null
          created_at: string | null
          id: string
          location_address: string | null
          location_lat: number | null
          location_lng: number | null
          notes: string | null
          priority: Database["public"]["Enums"]["case_priority"] | null
          resolution_notes: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["case_status"] | null
          symptoms: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          assigned_chw_id?: string | null
          created_at?: string | null
          id?: string
          location_address?: string | null
          location_lat?: number | null
          location_lng?: number | null
          notes?: string | null
          priority?: Database["public"]["Enums"]["case_priority"] | null
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["case_status"] | null
          symptoms: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_chw_id?: string | null
          created_at?: string | null
          id?: string
          location_address?: string | null
          location_lat?: number | null
          location_lng?: number | null
          notes?: string | null
          priority?: Database["public"]["Enums"]["case_priority"] | null
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["case_status"] | null
          symptoms?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      emergency_contacts: {
        Row: {
          created_at: string | null
          id: string
          is_primary: boolean | null
          name: string
          phone_number: string
          relationship: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          name: string
          phone_number: string
          relationship?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          name?: string
          phone_number?: string
          relationship?: string | null
          user_id?: string
        }
        Relationships: []
      }
      first_aid_protocols: {
        Row: {
          category: string
          content_en: string
          content_sw: string
          created_at: string | null
          id: string
          red_flags: string[] | null
          reference_books: Json | null
          seek_help_when: string[] | null
          severity: string | null
          steps: Json
          title_en: string
          title_sw: string
          updated_at: string | null
          video_url: string | null
        }
        Insert: {
          category: string
          content_en: string
          content_sw: string
          created_at?: string | null
          id?: string
          red_flags?: string[] | null
          reference_books?: Json | null
          seek_help_when?: string[] | null
          severity?: string | null
          steps: Json
          title_en: string
          title_sw: string
          updated_at?: string | null
          video_url?: string | null
        }
        Update: {
          category?: string
          content_en?: string
          content_sw?: string
          created_at?: string | null
          id?: string
          red_flags?: string[] | null
          reference_books?: Json | null
          seek_help_when?: string[] | null
          severity?: string | null
          steps?: Json
          title_en?: string
          title_sw?: string
          updated_at?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      health_facilities: {
        Row: {
          address: string
          city: string
          created_at: string | null
          email: string | null
          facility_type: Database["public"]["Enums"]["facility_type"]
          has_ambulance: boolean | null
          id: string
          is_24_hours: boolean | null
          is_verified: boolean | null
          latitude: number | null
          longitude: number | null
          name: string
          operating_hours: Json | null
          phone_number: string | null
          region: string | null
          services: string[] | null
          updated_at: string | null
        }
        Insert: {
          address: string
          city: string
          created_at?: string | null
          email?: string | null
          facility_type: Database["public"]["Enums"]["facility_type"]
          has_ambulance?: boolean | null
          id?: string
          is_24_hours?: boolean | null
          is_verified?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name: string
          operating_hours?: Json | null
          phone_number?: string | null
          region?: string | null
          services?: string[] | null
          updated_at?: string | null
        }
        Update: {
          address?: string
          city?: string
          created_at?: string | null
          email?: string | null
          facility_type?: Database["public"]["Enums"]["facility_type"]
          has_ambulance?: boolean | null
          id?: string
          is_24_hours?: boolean | null
          is_verified?: boolean | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          operating_hours?: Json | null
          phone_number?: string | null
          region?: string | null
          services?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          allergies: string[] | null
          blood_type: string | null
          created_at: string | null
          date_of_birth: string | null
          full_name: string
          id: string
          medical_conditions: string[] | null
          onboarding_completed: boolean | null
          phone_number: string | null
          preferred_language:
            | Database["public"]["Enums"]["language_preference"]
            | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          allergies?: string[] | null
          blood_type?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          full_name: string
          id?: string
          medical_conditions?: string[] | null
          onboarding_completed?: boolean | null
          phone_number?: string | null
          preferred_language?:
            | Database["public"]["Enums"]["language_preference"]
            | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          allergies?: string[] | null
          blood_type?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          full_name?: string
          id?: string
          medical_conditions?: string[] | null
          onboarding_completed?: boolean | null
          phone_number?: string | null
          preferred_language?:
            | Database["public"]["Enums"]["language_preference"]
            | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      rate_limit_buckets: {
        Row: {
          bucket_key: string
          tokens: number
          updated_at: string
        }
        Insert: {
          bucket_key: string
          tokens: number
          updated_at?: string
        }
        Update: {
          bucket_key?: string
          tokens?: number
          updated_at?: string
        }
        Relationships: []
      }
      security_events: {
        Row: {
          created_at: string
          details: Json | null
          event_type: string
          id: string
          ip_address: string | null
          scope: string | null
          severity: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          ip_address?: string | null
          scope?: string | null
          severity?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          ip_address?: string | null
          scope?: string | null
          severity?: string
          user_id?: string | null
        }
        Relationships: []
      }
      security_events_purge_log: {
        Row: {
          deleted_count: number
          id: string
          ran_at: string
          retention: string
        }
        Insert: {
          deleted_count?: number
          id?: string
          ran_at?: string
          retention: string
        }
        Update: {
          deleted_count?: number
          id?: string
          ran_at?: string
          retention?: string
        }
        Relationships: []
      }
      sms_logs: {
        Row: {
          created_at: string | null
          delivered_at: string | null
          delivery_status: string | null
          direction: string | null
          failure_reason: string | null
          id: string
          last_retry_at: string | null
          message: string
          original_message_id: string | null
          phone_number: string
          provider_message_id: string | null
          retry_count: number | null
          status: string | null
          status_updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          delivered_at?: string | null
          delivery_status?: string | null
          direction?: string | null
          failure_reason?: string | null
          id?: string
          last_retry_at?: string | null
          message: string
          original_message_id?: string | null
          phone_number: string
          provider_message_id?: string | null
          retry_count?: number | null
          status?: string | null
          status_updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          delivered_at?: string | null
          delivery_status?: string | null
          direction?: string | null
          failure_reason?: string | null
          id?: string
          last_retry_at?: string | null
          message?: string
          original_message_id?: string | null
          phone_number?: string
          provider_message_id?: string | null
          retry_count?: number | null
          status?: string | null
          status_updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      ussd_sessions: {
        Row: {
          created_at: string | null
          current_menu: string | null
          id: string
          phone_number: string
          session_data: Json | null
          session_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_menu?: string | null
          id?: string
          phone_number: string
          session_data?: Json | null
          session_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_menu?: string | null
          id?: string
          phone_number?: string
          session_data?: Json | null
          session_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_run_security_events_purge: {
        Args: { _older_than?: string }
        Returns: Json
      }
      calculate_distance_km: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number }
        Returns: number
      }
      consume_rate_limit: {
        Args: {
          _capacity: number
          _cost?: number
          _key: string
          _refill_per_sec: number
        }
        Returns: Json
      }
      find_nearest_chw: {
        Args: {
          emergency_lat: number
          emergency_lng: number
          max_distance_km?: number
        }
        Returns: {
          chw_user_id: string
          city: string
          distance_km: number
          region: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_chw: { Args: { _user_id: string }; Returns: boolean }
      log_admin_action: {
        Args: {
          _action: string
          _details?: Json
          _ip_address?: string
          _resource_id?: string
          _resource_type?: string
        }
        Returns: string
      }
      purge_security_events: { Args: { _older_than?: string }; Returns: number }
      run_security_events_purge: {
        Args: { _older_than?: string }
        Returns: number
      }
      security_events_retention_status: { Args: never; Returns: Json }
      security_events_summary: {
        Args: { _since: string }
        Returns: {
          count: number
          event_type: string
          scope: string
        }[]
      }
      security_top_ips: {
        Args: { _limit?: number; _since: string }
        Returns: {
          ip_address: string
          rate_limit_hits: number
          total: number
          validation_failures: number
        }[]
      }
    }
    Enums: {
      app_role: "user" | "chw" | "admin"
      case_priority: "low" | "medium" | "high" | "critical"
      case_status:
        | "pending"
        | "assigned"
        | "in_progress"
        | "resolved"
        | "escalated"
      facility_type: "hospital" | "clinic" | "pharmacy" | "health_center"
      language_preference: "en" | "sw"
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
      app_role: ["user", "chw", "admin"],
      case_priority: ["low", "medium", "high", "critical"],
      case_status: [
        "pending",
        "assigned",
        "in_progress",
        "resolved",
        "escalated",
      ],
      facility_type: ["hospital", "clinic", "pharmacy", "health_center"],
      language_preference: ["en", "sw"],
    },
  },
} as const
