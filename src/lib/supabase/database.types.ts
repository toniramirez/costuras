// ⚠️ ARCHIVO GENERADO — no editar a mano.
// Regenerar con:  npm run db:types
// (Con el proyecto Supabase ya conectado también sirve:
//   supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts)

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      academy_settings: {
        Row: {
          id: number;
          academy_name: string;
          logo_path: string | null;
          isotype_path: string | null;
          primary_color: string;
          secondary_color: string;
          accent_color: string;
          phone: string | null;
          email: string | null;
          address: string | null;
          receipt_prefix: string;
          receipt_next_number: number;
          receipt_footer: string | null;
          receipt_legal: string;
          registration_fee_cents: number;
          registration_mode: Database["public"]["Enums"]["registration_mode"];
          registration_due_days: number;
          fee_due_day: number;
          default_charge_mode: Database["public"]["Enums"]["charge_mode"];
          bill_january: boolean;
          bill_february: boolean;
          jan_feb_charge_mode: Database["public"]["Enums"]["charge_mode"];
          recovery_min_notice_hours: number;
          recovery_validity_days: number;
          max_image_mb: number;
          max_document_mb: number;
          max_video_mb: number;
          mp_enabled: boolean;
          mp_public_key: string | null;
          timezone: string;
          currency: string;
          locale: string;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          academy_name?: string;
          logo_path?: string | null;
          isotype_path?: string | null;
          primary_color?: string;
          secondary_color?: string;
          accent_color?: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          receipt_prefix?: string;
          receipt_next_number?: number;
          receipt_footer?: string | null;
          receipt_legal?: string;
          registration_fee_cents?: number;
          registration_mode?: Database["public"]["Enums"]["registration_mode"];
          registration_due_days?: number;
          fee_due_day?: number;
          default_charge_mode?: Database["public"]["Enums"]["charge_mode"];
          bill_january?: boolean;
          bill_february?: boolean;
          jan_feb_charge_mode?: Database["public"]["Enums"]["charge_mode"];
          recovery_min_notice_hours?: number;
          recovery_validity_days?: number;
          max_image_mb?: number;
          max_document_mb?: number;
          max_video_mb?: number;
          mp_enabled?: boolean;
          mp_public_key?: string | null;
          timezone?: string;
          currency?: string;
          locale?: string;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          academy_name?: string;
          logo_path?: string | null;
          isotype_path?: string | null;
          primary_color?: string;
          secondary_color?: string;
          accent_color?: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          receipt_prefix?: string;
          receipt_next_number?: number;
          receipt_footer?: string | null;
          receipt_legal?: string;
          registration_fee_cents?: number;
          registration_mode?: Database["public"]["Enums"]["registration_mode"];
          registration_due_days?: number;
          fee_due_day?: number;
          default_charge_mode?: Database["public"]["Enums"]["charge_mode"];
          bill_january?: boolean;
          bill_february?: boolean;
          jan_feb_charge_mode?: Database["public"]["Enums"]["charge_mode"];
          recovery_min_notice_hours?: number;
          recovery_validity_days?: number;
          max_image_mb?: number;
          max_document_mb?: number;
          max_video_mb?: number;
          mp_enabled?: boolean;
          mp_public_key?: string | null;
          timezone?: string;
          currency?: string;
          locale?: string;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "academy_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      announcement_recipients: {
        Row: {
          id: string;
          announcement_id: string;
          student_id: string;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          announcement_id: string;
          student_id: string;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          announcement_id?: string;
          student_id?: string;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "announcement_recipients_announcement_id_fkey";
            columns: ["announcement_id"];
            isOneToOne: false;
            referencedRelation: "announcements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "announcement_recipients_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      announcements: {
        Row: {
          id: string;
          title: string;
          content: string;
          image_path: string | null;
          attachments: Json;
          published_at: string | null;
          expires_at: string | null;
          priority: Database["public"]["Enums"]["priority_level"];
          is_pinned: boolean;
          status: Database["public"]["Enums"]["publish_status"];
          scope: Database["public"]["Enums"]["recipient_scope"];
          scope_label: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          content: string;
          image_path?: string | null;
          attachments?: Json;
          published_at?: string | null;
          expires_at?: string | null;
          priority?: Database["public"]["Enums"]["priority_level"];
          is_pinned?: boolean;
          status?: Database["public"]["Enums"]["publish_status"];
          scope?: Database["public"]["Enums"]["recipient_scope"];
          scope_label?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          content?: string;
          image_path?: string | null;
          attachments?: Json;
          published_at?: string | null;
          expires_at?: string | null;
          priority?: Database["public"]["Enums"]["priority_level"];
          is_pinned?: boolean;
          status?: Database["public"]["Enums"]["publish_status"];
          scope?: Database["public"]["Enums"]["recipient_scope"];
          scope_label?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      attendance: {
        Row: {
          id: string;
          class_session_id: string;
          student_id: string;
          group_id: string | null;
          status: Database["public"]["Enums"]["attendance_status"];
          recorded_at: string;
          observation: string | null;
          recorded_by: string | null;
          is_recovery: boolean;
          recovery_credit_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          class_session_id: string;
          student_id: string;
          group_id?: string | null;
          status: Database["public"]["Enums"]["attendance_status"];
          recorded_at?: string;
          observation?: string | null;
          recorded_by?: string | null;
          is_recovery?: boolean;
          recovery_credit_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          class_session_id?: string;
          student_id?: string;
          group_id?: string | null;
          status?: Database["public"]["Enums"]["attendance_status"];
          recorded_at?: string;
          observation?: string | null;
          recorded_by?: string | null;
          is_recovery?: boolean;
          recovery_credit_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attendance_class_session_id_fkey";
            columns: ["class_session_id"];
            isOneToOne: false;
            referencedRelation: "class_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_recorded_by_fkey";
            columns: ["recorded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_recovery_credit_fk";
            columns: ["recovery_credit_id"];
            isOneToOne: false;
            referencedRelation: "recovery_credits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "attendance_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_profile_id: string | null;
          actor_email: string | null;
          actor_role: Database["public"]["Enums"]["app_role"] | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          old_values: Json | null;
          new_values: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_profile_id?: string | null;
          actor_email?: string | null;
          actor_role?: Database["public"]["Enums"]["app_role"] | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          old_values?: Json | null;
          new_values?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_profile_id?: string | null;
          actor_email?: string | null;
          actor_role?: Database["public"]["Enums"]["app_role"] | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          old_values?: Json | null;
          new_values?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_profile_id_fkey";
            columns: ["actor_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      cash_accounts: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          type: Database["public"]["Enums"]["cash_account_type"];
          initial_balance_cents: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          type?: Database["public"]["Enums"]["cash_account_type"];
          initial_balance_cents?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          type?: Database["public"]["Enums"]["cash_account_type"];
          initial_balance_cents?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      class_sessions: {
        Row: {
          id: string;
          group_id: string;
          session_date: string;
          start_time: string | null;
          end_time: string | null;
          status: Database["public"]["Enums"]["class_session_status"];
          canceled_reason: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          session_date: string;
          start_time?: string | null;
          end_time?: string | null;
          status?: Database["public"]["Enums"]["class_session_status"];
          canceled_reason?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          session_date?: string;
          start_time?: string | null;
          end_time?: string | null;
          status?: Database["public"]["Enums"]["class_session_status"];
          canceled_reason?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "class_sessions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "class_sessions_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
        ];
      };
      communication_recipients: {
        Row: {
          id: string;
          communication_id: string;
          student_id: string;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          communication_id: string;
          student_id: string;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          communication_id?: string;
          student_id?: string;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "communication_recipients_communication_id_fkey";
            columns: ["communication_id"];
            isOneToOne: false;
            referencedRelation: "communications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "communication_recipients_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      communications: {
        Row: {
          id: string;
          subject: string;
          body: string;
          attachments: Json;
          priority: Database["public"]["Enums"]["priority_level"];
          status: Database["public"]["Enums"]["publish_status"];
          sent_at: string | null;
          expires_at: string | null;
          scope: Database["public"]["Enums"]["recipient_scope"];
          scope_label: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          subject: string;
          body: string;
          attachments?: Json;
          priority?: Database["public"]["Enums"]["priority_level"];
          status?: Database["public"]["Enums"]["publish_status"];
          sent_at?: string | null;
          expires_at?: string | null;
          scope?: Database["public"]["Enums"]["recipient_scope"];
          scope_label?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          subject?: string;
          body?: string;
          attachments?: Json;
          priority?: Database["public"]["Enums"]["priority_level"];
          status?: Database["public"]["Enums"]["publish_status"];
          sent_at?: string | null;
          expires_at?: string | null;
          scope?: Database["public"]["Enums"]["recipient_scope"];
          scope_label?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "communications_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      enrollments: {
        Row: {
          id: string;
          student_id: string;
          enrolled_at: string;
          start_date: string | null;
          plan_id: string | null;
          rate_id: string | null;
          charge_mode: Database["public"]["Enums"]["charge_mode"];
          first_period_year: number | null;
          first_period_month: number | null;
          prorated_amount_cents: number | null;
          manual_amount_cents: number | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          enrolled_at?: string;
          start_date?: string | null;
          plan_id?: string | null;
          rate_id?: string | null;
          charge_mode?: Database["public"]["Enums"]["charge_mode"];
          first_period_year?: number | null;
          first_period_month?: number | null;
          prorated_amount_cents?: number | null;
          manual_amount_cents?: number | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          enrolled_at?: string;
          start_date?: string | null;
          plan_id?: string | null;
          rate_id?: string | null;
          charge_mode?: Database["public"]["Enums"]["charge_mode"];
          first_period_year?: number | null;
          first_period_month?: number | null;
          prorated_amount_cents?: number | null;
          manual_amount_cents?: number | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "enrollments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enrollments_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enrollments_rate_id_fkey";
            columns: ["rate_id"];
            isOneToOne: false;
            referencedRelation: "rates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "enrollments_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      financial_categories: {
        Row: {
          id: string;
          name: string;
          kind: Database["public"]["Enums"]["category_kind"];
          is_system: boolean;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          kind: Database["public"]["Enums"]["category_kind"];
          is_system?: boolean;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          kind?: Database["public"]["Enums"]["category_kind"];
          is_system?: boolean;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      financial_movements: {
        Row: {
          id: string;
          type: Database["public"]["Enums"]["movement_type"];
          movement_date: string;
          category_id: string | null;
          description: string | null;
          amount_cents: number;
          cash_account_id: string;
          payment_method_id: string | null;
          student_id: string | null;
          monthly_fee_id: string | null;
          registration_fee_id: string | null;
          payment_id: string | null;
          workshop_id: string | null;
          proof_path: string | null;
          notes: string | null;
          is_reversal: boolean;
          reverses_movement_id: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          type: Database["public"]["Enums"]["movement_type"];
          movement_date?: string;
          category_id?: string | null;
          description?: string | null;
          amount_cents: number;
          cash_account_id: string;
          payment_method_id?: string | null;
          student_id?: string | null;
          monthly_fee_id?: string | null;
          registration_fee_id?: string | null;
          payment_id?: string | null;
          workshop_id?: string | null;
          proof_path?: string | null;
          notes?: string | null;
          is_reversal?: boolean;
          reverses_movement_id?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          type?: Database["public"]["Enums"]["movement_type"];
          movement_date?: string;
          category_id?: string | null;
          description?: string | null;
          amount_cents?: number;
          cash_account_id?: string;
          payment_method_id?: string | null;
          student_id?: string | null;
          monthly_fee_id?: string | null;
          registration_fee_id?: string | null;
          payment_id?: string | null;
          workshop_id?: string | null;
          proof_path?: string | null;
          notes?: string | null;
          is_reversal?: boolean;
          reverses_movement_id?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "financial_movements_cash_account_id_fkey";
            columns: ["cash_account_id"];
            isOneToOne: false;
            referencedRelation: "cash_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_movements_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "financial_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_movements_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_movements_monthly_fee_id_fkey";
            columns: ["monthly_fee_id"];
            isOneToOne: false;
            referencedRelation: "monthly_fees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_movements_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_movements_payment_method_id_fkey";
            columns: ["payment_method_id"];
            isOneToOne: false;
            referencedRelation: "payment_methods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_movements_registration_fee_id_fkey";
            columns: ["registration_fee_id"];
            isOneToOne: false;
            referencedRelation: "registration_fees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_movements_reverses_movement_id_fkey";
            columns: ["reverses_movement_id"];
            isOneToOne: false;
            referencedRelation: "financial_movements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_movements_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "financial_movements_workshop_fk";
            columns: ["workshop_id"];
            isOneToOne: false;
            referencedRelation: "workshops";
            referencedColumns: ["id"];
          },
        ];
      };
      groups: {
        Row: {
          id: string;
          name: string;
          weekday: number;
          start_time: string;
          end_time: string;
          capacity: number;
          plan_id: string | null;
          professor_id: string | null;
          is_active: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          weekday: number;
          start_time: string;
          end_time: string;
          capacity?: number;
          plan_id?: string | null;
          professor_id?: string | null;
          is_active?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          weekday?: number;
          start_time?: string;
          end_time?: string;
          capacity?: number;
          plan_id?: string | null;
          professor_id?: string | null;
          is_active?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "groups_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "groups_professor_id_fkey";
            columns: ["professor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      monthly_fees: {
        Row: {
          id: string;
          student_id: string;
          period_year: number;
          period_month: number;
          rate_id: string | null;
          base_amount_cents: number;
          manual_adjustment_cents: number;
          final_amount_cents: number;
          issued_date: string;
          due_date: string | null;
          status: Database["public"]["Enums"]["fee_status"];
          paid_date: string | null;
          payment_method_id: string | null;
          cash_account_id: string | null;
          payment_id: string | null;
          receipt_id: string | null;
          receipt_number: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          period_year: number;
          period_month: number;
          rate_id?: string | null;
          base_amount_cents: number;
          manual_adjustment_cents?: number;
          final_amount_cents: number;
          issued_date?: string;
          due_date?: string | null;
          status?: Database["public"]["Enums"]["fee_status"];
          paid_date?: string | null;
          payment_method_id?: string | null;
          cash_account_id?: string | null;
          payment_id?: string | null;
          receipt_id?: string | null;
          receipt_number?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          period_year?: number;
          period_month?: number;
          rate_id?: string | null;
          base_amount_cents?: number;
          manual_adjustment_cents?: number;
          final_amount_cents?: number;
          issued_date?: string;
          due_date?: string | null;
          status?: Database["public"]["Enums"]["fee_status"];
          paid_date?: string | null;
          payment_method_id?: string | null;
          cash_account_id?: string | null;
          payment_id?: string | null;
          receipt_id?: string | null;
          receipt_number?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "monthly_fees_cash_account_id_fkey";
            columns: ["cash_account_id"];
            isOneToOne: false;
            referencedRelation: "cash_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "monthly_fees_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "monthly_fees_payment_method_id_fkey";
            columns: ["payment_method_id"];
            isOneToOne: false;
            referencedRelation: "payment_methods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "monthly_fees_rate_id_fkey";
            columns: ["rate_id"];
            isOneToOne: false;
            referencedRelation: "rates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "monthly_fees_receipt_id_fkey";
            columns: ["receipt_id"];
            isOneToOne: false;
            referencedRelation: "payment_receipts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "monthly_fees_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          id: string;
          profile_id: string | null;
          audience: Database["public"]["Enums"]["notification_audience"];
          type: string;
          title: string;
          body: string | null;
          link: string | null;
          entity_type: string | null;
          entity_id: string | null;
          is_read: boolean;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id?: string | null;
          audience: Database["public"]["Enums"]["notification_audience"];
          type: string;
          title: string;
          body?: string | null;
          link?: string | null;
          entity_type?: string | null;
          entity_id?: string | null;
          is_read?: boolean;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string | null;
          audience?: Database["public"]["Enums"]["notification_audience"];
          type?: string;
          title?: string;
          body?: string | null;
          link?: string | null;
          entity_type?: string | null;
          entity_id?: string | null;
          is_read?: boolean;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_methods: {
        Row: {
          id: string;
          name: string;
          code: string;
          is_active: boolean;
          requires_proof: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          code: string;
          is_active?: boolean;
          requires_proof?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          code?: string;
          is_active?: boolean;
          requires_proof?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      payment_proofs: {
        Row: {
          id: string;
          student_id: string;
          monthly_fee_id: string | null;
          registration_fee_id: string | null;
          file_path: string;
          uploaded_at: string;
          informed_amount_cents: number | null;
          reference: string | null;
          note: string | null;
          status: Database["public"]["Enums"]["proof_status"];
          reviewed_by: string | null;
          reviewed_at: string | null;
          rejection_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          monthly_fee_id?: string | null;
          registration_fee_id?: string | null;
          file_path: string;
          uploaded_at?: string;
          informed_amount_cents?: number | null;
          reference?: string | null;
          note?: string | null;
          status?: Database["public"]["Enums"]["proof_status"];
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          rejection_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          monthly_fee_id?: string | null;
          registration_fee_id?: string | null;
          file_path?: string;
          uploaded_at?: string;
          informed_amount_cents?: number | null;
          reference?: string | null;
          note?: string | null;
          status?: Database["public"]["Enums"]["proof_status"];
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          rejection_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_proofs_monthly_fee_id_fkey";
            columns: ["monthly_fee_id"];
            isOneToOne: false;
            referencedRelation: "monthly_fees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_proofs_registration_fee_id_fkey";
            columns: ["registration_fee_id"];
            isOneToOne: false;
            referencedRelation: "registration_fees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_proofs_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_proofs_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      payment_receipts: {
        Row: {
          id: string;
          receipt_number: number;
          payment_id: string | null;
          student_id: string | null;
          concept: string;
          period_label: string | null;
          amount_cents: number;
          method_name: string | null;
          external_reference: string | null;
          issued_at: string;
          pdf_path: string | null;
          academy_snapshot: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          receipt_number: number;
          payment_id?: string | null;
          student_id?: string | null;
          concept: string;
          period_label?: string | null;
          amount_cents: number;
          method_name?: string | null;
          external_reference?: string | null;
          issued_at?: string;
          pdf_path?: string | null;
          academy_snapshot?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          receipt_number?: number;
          payment_id?: string | null;
          student_id?: string | null;
          concept?: string;
          period_label?: string | null;
          amount_cents?: number;
          method_name?: string | null;
          external_reference?: string | null;
          issued_at?: string;
          pdf_path?: string | null;
          academy_snapshot?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payment_receipts_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payment_receipts_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          id: string;
          student_id: string | null;
          amount_cents: number;
          method_id: string | null;
          cash_account_id: string | null;
          status: Database["public"]["Enums"]["payment_status"];
          paid_at: string;
          external_reference: string | null;
          mp_payment_id: string | null;
          mp_status: string | null;
          mp_fee_cents: number | null;
          net_amount_cents: number | null;
          receipt_id: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id?: string | null;
          amount_cents: number;
          method_id?: string | null;
          cash_account_id?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
          paid_at?: string;
          external_reference?: string | null;
          mp_payment_id?: string | null;
          mp_status?: string | null;
          mp_fee_cents?: number | null;
          net_amount_cents?: number | null;
          receipt_id?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string | null;
          amount_cents?: number;
          method_id?: string | null;
          cash_account_id?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
          paid_at?: string;
          external_reference?: string | null;
          mp_payment_id?: string | null;
          mp_status?: string | null;
          mp_fee_cents?: number | null;
          net_amount_cents?: number | null;
          receipt_id?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_cash_account_id_fkey";
            columns: ["cash_account_id"];
            isOneToOne: false;
            referencedRelation: "cash_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_method_id_fkey";
            columns: ["method_id"];
            isOneToOne: false;
            referencedRelation: "payment_methods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_receipt_fk";
            columns: ["receipt_id"];
            isOneToOne: false;
            referencedRelation: "payment_receipts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      plans: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          classes_included: number;
          frequency: Database["public"]["Enums"]["plan_frequency"];
          price_cents: number;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          classes_included?: number;
          frequency?: Database["public"]["Enums"]["plan_frequency"];
          price_cents?: number;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          classes_included?: number;
          frequency?: Database["public"]["Enums"]["plan_frequency"];
          price_cents?: number;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
        ];
      };
      profiles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          full_name: string;
          email: string | null;
          phone: string | null;
          avatar_url: string | null;
          must_change_password: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          role?: Database["public"]["Enums"]["app_role"];
          full_name?: string;
          email?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          must_change_password?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          full_name?: string;
          email?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          must_change_password?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      project_entries: {
        Row: {
          id: string;
          project_id: string;
          title: string | null;
          body: string | null;
          step_notes: string | null;
          entry_date: string;
          materials_used: string | null;
          measurements: string | null;
          sort_order: number;
          is_draft: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          title?: string | null;
          body?: string | null;
          step_notes?: string | null;
          entry_date?: string;
          materials_used?: string | null;
          measurements?: string | null;
          sort_order?: number;
          is_draft?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          title?: string | null;
          body?: string | null;
          step_notes?: string | null;
          entry_date?: string;
          materials_used?: string | null;
          measurements?: string | null;
          sort_order?: number;
          is_draft?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_entries_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_files: {
        Row: {
          id: string;
          project_id: string;
          entry_id: string | null;
          kind: Database["public"]["Enums"]["project_file_kind"];
          storage_path: string | null;
          external_url: string | null;
          file_name: string | null;
          mime_type: string | null;
          size_bytes: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          entry_id?: string | null;
          kind?: Database["public"]["Enums"]["project_file_kind"];
          storage_path?: string | null;
          external_url?: string | null;
          file_name?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          entry_id?: string | null;
          kind?: Database["public"]["Enums"]["project_file_kind"];
          storage_path?: string | null;
          external_url?: string | null;
          file_name?: string | null;
          mime_type?: string | null;
          size_bytes?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_files_entry_id_fkey";
            columns: ["entry_id"];
            isOneToOne: false;
            referencedRelation: "project_entries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_files_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          id: string;
          student_id: string;
          title: string;
          description: string | null;
          garment_type: string | null;
          fabric_type: string | null;
          measurements: string | null;
          materials: string | null;
          difficulty: Database["public"]["Enums"]["project_difficulty"];
          start_date: string | null;
          end_date: string | null;
          status: Database["public"]["Enums"]["project_status"];
          cover_image_path: string | null;
          notes: string | null;
          is_featured: boolean;
          archived_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          title: string;
          description?: string | null;
          garment_type?: string | null;
          fabric_type?: string | null;
          measurements?: string | null;
          materials?: string | null;
          difficulty?: Database["public"]["Enums"]["project_difficulty"];
          start_date?: string | null;
          end_date?: string | null;
          status?: Database["public"]["Enums"]["project_status"];
          cover_image_path?: string | null;
          notes?: string | null;
          is_featured?: boolean;
          archived_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          title?: string;
          description?: string | null;
          garment_type?: string | null;
          fabric_type?: string | null;
          measurements?: string | null;
          materials?: string | null;
          difficulty?: Database["public"]["Enums"]["project_difficulty"];
          start_date?: string | null;
          end_date?: string | null;
          status?: Database["public"]["Enums"]["project_status"];
          cover_image_path?: string | null;
          notes?: string | null;
          is_featured?: boolean;
          archived_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projects_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      rates: {
        Row: {
          id: string;
          name: string;
          plan_id: string | null;
          valid_from: string | null;
          valid_until: string | null;
          amount_cents: number;
          is_active: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          plan_id?: string | null;
          valid_from?: string | null;
          valid_until?: string | null;
          amount_cents: number;
          is_active?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          plan_id?: string | null;
          valid_from?: string | null;
          valid_until?: string | null;
          amount_cents?: number;
          is_active?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rates_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      recovery_credits: {
        Row: {
          id: string;
          student_id: string;
          origin_attendance_id: string | null;
          origin_session_id: string | null;
          reason: string | null;
          status: Database["public"]["Enums"]["recovery_status"];
          issued_at: string;
          expires_at: string;
          reserved_group_id: string | null;
          reserved_date: string | null;
          used_attendance_id: string | null;
          used_at: string | null;
          canceled_at: string | null;
          cancel_reason: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          origin_attendance_id?: string | null;
          origin_session_id?: string | null;
          reason?: string | null;
          status?: Database["public"]["Enums"]["recovery_status"];
          issued_at?: string;
          expires_at: string;
          reserved_group_id?: string | null;
          reserved_date?: string | null;
          used_attendance_id?: string | null;
          used_at?: string | null;
          canceled_at?: string | null;
          cancel_reason?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          origin_attendance_id?: string | null;
          origin_session_id?: string | null;
          reason?: string | null;
          status?: Database["public"]["Enums"]["recovery_status"];
          issued_at?: string;
          expires_at?: string;
          reserved_group_id?: string | null;
          reserved_date?: string | null;
          used_attendance_id?: string | null;
          used_at?: string | null;
          canceled_at?: string | null;
          cancel_reason?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recovery_credits_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recovery_credits_origin_attendance_id_fkey";
            columns: ["origin_attendance_id"];
            isOneToOne: false;
            referencedRelation: "attendance";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recovery_credits_origin_session_id_fkey";
            columns: ["origin_session_id"];
            isOneToOne: false;
            referencedRelation: "class_sessions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recovery_credits_reserved_group_id_fkey";
            columns: ["reserved_group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recovery_credits_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recovery_credits_used_attendance_id_fkey";
            columns: ["used_attendance_id"];
            isOneToOne: true;
            referencedRelation: "attendance";
            referencedColumns: ["id"];
          },
        ];
      };
      registration_fees: {
        Row: {
          id: string;
          student_id: string;
          enrollment_id: string | null;
          amount_cents: number;
          issued_date: string;
          due_date: string | null;
          status: Database["public"]["Enums"]["fee_status"];
          paid_date: string | null;
          payment_method_id: string | null;
          cash_account_id: string | null;
          payment_id: string | null;
          receipt_id: string | null;
          receipt_number: number | null;
          is_exempt: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          enrollment_id?: string | null;
          amount_cents: number;
          issued_date?: string;
          due_date?: string | null;
          status?: Database["public"]["Enums"]["fee_status"];
          paid_date?: string | null;
          payment_method_id?: string | null;
          cash_account_id?: string | null;
          payment_id?: string | null;
          receipt_id?: string | null;
          receipt_number?: number | null;
          is_exempt?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          enrollment_id?: string | null;
          amount_cents?: number;
          issued_date?: string;
          due_date?: string | null;
          status?: Database["public"]["Enums"]["fee_status"];
          paid_date?: string | null;
          payment_method_id?: string | null;
          cash_account_id?: string | null;
          payment_id?: string | null;
          receipt_id?: string | null;
          receipt_number?: number | null;
          is_exempt?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "registration_fees_cash_account_id_fkey";
            columns: ["cash_account_id"];
            isOneToOne: false;
            referencedRelation: "cash_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "registration_fees_enrollment_id_fkey";
            columns: ["enrollment_id"];
            isOneToOne: false;
            referencedRelation: "enrollments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "registration_fees_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "registration_fees_payment_method_id_fkey";
            columns: ["payment_method_id"];
            isOneToOne: false;
            referencedRelation: "payment_methods";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "registration_fees_receipt_id_fkey";
            columns: ["receipt_id"];
            isOneToOne: false;
            referencedRelation: "payment_receipts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "registration_fees_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      student_groups: {
        Row: {
          id: string;
          student_id: string;
          group_id: string;
          from_date: string;
          to_date: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          group_id: string;
          from_date?: string;
          to_date?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          group_id?: string;
          from_date?: string;
          to_date?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_groups_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_groups_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      student_rates: {
        Row: {
          id: string;
          student_id: string;
          rate_id: string | null;
          amount_cents: number;
          from_date: string;
          to_date: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          student_id: string;
          rate_id?: string | null;
          amount_cents: number;
          from_date?: string;
          to_date?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          student_id?: string;
          rate_id?: string | null;
          amount_cents?: number;
          from_date?: string;
          to_date?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "student_rates_rate_id_fkey";
            columns: ["rate_id"];
            isOneToOne: false;
            referencedRelation: "rates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "student_rates_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
        ];
      };
      students: {
        Row: {
          id: string;
          profile_id: string | null;
          first_name: string;
          last_name: string;
          dni: string | null;
          email: string | null;
          phone: string | null;
          birth_date: string | null;
          address: string | null;
          emergency_contact: string | null;
          emergency_phone: string | null;
          enrollment_date: string;
          start_date: string | null;
          fixed_weekday: number | null;
          fixed_time: string | null;
          group_id: string | null;
          plan_id: string | null;
          rate_id: string | null;
          status: Database["public"]["Enums"]["student_status"];
          registration_fee_exempt: boolean;
          admin_notes: string | null;
          avatar_url: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id?: string | null;
          first_name: string;
          last_name: string;
          dni?: string | null;
          email?: string | null;
          phone?: string | null;
          birth_date?: string | null;
          address?: string | null;
          emergency_contact?: string | null;
          emergency_phone?: string | null;
          enrollment_date?: string;
          start_date?: string | null;
          fixed_weekday?: number | null;
          fixed_time?: string | null;
          group_id?: string | null;
          plan_id?: string | null;
          rate_id?: string | null;
          status?: Database["public"]["Enums"]["student_status"];
          registration_fee_exempt?: boolean;
          admin_notes?: string | null;
          avatar_url?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string | null;
          first_name?: string;
          last_name?: string;
          dni?: string | null;
          email?: string | null;
          phone?: string | null;
          birth_date?: string | null;
          address?: string | null;
          emergency_contact?: string | null;
          emergency_phone?: string | null;
          enrollment_date?: string;
          start_date?: string | null;
          fixed_weekday?: number | null;
          fixed_time?: string | null;
          group_id?: string | null;
          plan_id?: string | null;
          rate_id?: string | null;
          status?: Database["public"]["Enums"]["student_status"];
          registration_fee_exempt?: boolean;
          admin_notes?: string | null;
          avatar_url?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "students_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "groups";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "students_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "students_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "students_rate_id_fkey";
            columns: ["rate_id"];
            isOneToOne: false;
            referencedRelation: "rates";
            referencedColumns: ["id"];
          },
        ];
      };
      workshop_registrations: {
        Row: {
          id: string;
          workshop_id: string;
          student_id: string | null;
          external_first_name: string | null;
          external_last_name: string | null;
          external_phone: string | null;
          external_email: string | null;
          notes: string | null;
          status: Database["public"]["Enums"]["workshop_reg_status"];
          waitlist_position: number | null;
          amount_cents: number;
          payment_id: string | null;
          registered_at: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workshop_id: string;
          student_id?: string | null;
          external_first_name?: string | null;
          external_last_name?: string | null;
          external_phone?: string | null;
          external_email?: string | null;
          notes?: string | null;
          status?: Database["public"]["Enums"]["workshop_reg_status"];
          waitlist_position?: number | null;
          amount_cents?: number;
          payment_id?: string | null;
          registered_at?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workshop_id?: string;
          student_id?: string | null;
          external_first_name?: string | null;
          external_last_name?: string | null;
          external_phone?: string | null;
          external_email?: string | null;
          notes?: string | null;
          status?: Database["public"]["Enums"]["workshop_reg_status"];
          waitlist_position?: number | null;
          amount_cents?: number;
          payment_id?: string | null;
          registered_at?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workshop_registrations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workshop_registrations_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workshop_registrations_student_id_fkey";
            columns: ["student_id"];
            isOneToOne: false;
            referencedRelation: "students";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workshop_registrations_workshop_id_fkey";
            columns: ["workshop_id"];
            isOneToOne: false;
            referencedRelation: "workshops";
            referencedColumns: ["id"];
          },
        ];
      };
      workshops: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          category: string | null;
          responsible_name: string | null;
          event_date: string | null;
          start_time: string | null;
          end_time: string | null;
          capacity: number;
          price_cents: number;
          image_path: string | null;
          materials_included: string | null;
          materials_to_bring: string | null;
          location: string | null;
          status: Database["public"]["Enums"]["workshop_status"];
          cash_account_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          category?: string | null;
          responsible_name?: string | null;
          event_date?: string | null;
          start_time?: string | null;
          end_time?: string | null;
          capacity?: number;
          price_cents?: number;
          image_path?: string | null;
          materials_included?: string | null;
          materials_to_bring?: string | null;
          location?: string | null;
          status?: Database["public"]["Enums"]["workshop_status"];
          cash_account_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          category?: string | null;
          responsible_name?: string | null;
          event_date?: string | null;
          start_time?: string | null;
          end_time?: string | null;
          capacity?: number;
          price_cents?: number;
          image_path?: string | null;
          materials_included?: string | null;
          materials_to_bring?: string | null;
          location?: string | null;
          status?: Database["public"]["Enums"]["workshop_status"];
          cash_account_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "workshops_cash_account_id_fkey";
            columns: ["cash_account_id"];
            isOneToOne: false;
            referencedRelation: "cash_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "workshops_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      cash_account_balances: {
        Row: {
          cash_account_id: string | null;
          name: string | null;
          type: Database["public"]["Enums"]["cash_account_type"] | null;
          is_active: boolean | null;
          initial_balance_cents: number | null;
          balance_cents: number | null;
        };
        Relationships: [];
      };
      group_occupancy: {
        Row: {
          group_id: string | null;
          name: string | null;
          capacity: number | null;
          current_students: number | null;
          available_slots: number | null;
          is_full: boolean | null;
        };
        Relationships: [];
      };
    };
    Enums: {
      app_role: "admin" | "profesor" | "alumno";
      attendance_status: "presente" | "ausente_justificada" | "ausente_sin_justificar" | "recuperacion" | "cancelada_academia";
      cash_account_type: "efectivo" | "banco" | "billetera_virtual" | "tarjetas" | "otra";
      category_kind: "ingreso" | "gasto";
      charge_mode: "mes_completo" | "proporcional" | "manual" | "mes_siguiente";
      class_session_status: "programada" | "realizada" | "cancelada";
      fee_status: "pendiente" | "comprobante_pendiente" | "pagada" | "vencida" | "anulada" | "bonificada";
      movement_type: "ingreso" | "gasto" | "ajuste";
      notification_audience: "admin" | "alumno";
      payment_status: "pendiente" | "confirmado" | "anulado" | "rechazado";
      plan_frequency: "semanal" | "quincenal" | "mensual" | "unica" | "personalizada";
      priority_level: "baja" | "normal" | "alta" | "urgente";
      project_difficulty: "inicial" | "intermedio" | "avanzado" | "personalizado";
      project_file_kind: "imagen" | "video" | "documento" | "molde" | "otro";
      project_status: "idea" | "en_proceso" | "pausado" | "terminado" | "archivado";
      proof_status: "pendiente" | "aprobado" | "rechazado";
      publish_status: "borrador" | "publicada" | "archivada";
      recipient_scope: "todos" | "grupo" | "alumno" | "cuota_pendiente" | "taller";
      recovery_status: "disponible" | "reservada" | "utilizada" | "vencida" | "cancelada";
      registration_mode: "unica" | "anual";
      student_status: "pendiente" | "activo" | "pausado" | "baja";
      workshop_reg_status: "pendiente" | "pendiente_pago" | "confirmada" | "lista_espera" | "cancelada" | "asistio" | "no_asistio";
      workshop_status: "borrador" | "publicado" | "inscripcion_abierta" | "cupo_completo" | "finalizado" | "cancelado";
    };
    Functions: {
      approve_payment_proof: {
        Args: {
          p_proof_id: string;
          p_cash_account_id: string;
          p_method_id?: string;
        };
        Returns: string;
      };
      assert_admin: {
        Args: {
          p_action?: string;
        };
        Returns: undefined;
      };
      cancel_recovery_credit: {
        Args: {
          p_credit_id: string;
          p_reason: string;
        };
        Returns: undefined;
      };
      confirm_mercadopago_payment: {
        Args: {
          p_fee_id: string;
          p_mp_payment_id: string;
          p_mp_status: string;
          p_amount_cents: number;
          p_mp_fee_cents?: number;
          p_net_amount_cents?: number;
        };
        Returns: string;
      };
      confirm_workshop_registration: {
        Args: {
          p_registration_id: string;
          p_method_id: string;
          p_cash_account_id: string;
          p_paid_at?: string;
          p_reference?: string;
        };
        Returns: string;
      };
      current_app_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["app_role"];
      };
      current_student_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      expire_recovery_credits: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      fee_amount_for_period: {
        Args: {
          p_student_id: string;
          p_year: number;
          p_month: number;
        };
        Returns: number;
      };
      generate_monthly_fees: {
        Args: {
          p_year: number;
          p_month: number;
        };
        Returns: { created_count: number; skipped_count: number }[];
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_staff: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      issue_recovery_credit: {
        Args: {
          p_attendance_id: string;
          p_reason?: string;
          p_force?: boolean;
        };
        Returns: string;
      };
      mark_overdue_fees: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      next_receipt_number: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      notify_upcoming_expirations: {
        Args: {
          p_days_ahead?: number;
        };
        Returns: number;
      };
      promote_from_waitlist: {
        Args: {
          p_workshop_id: string;
        };
        Returns: string;
      };
      record_payment_with_receipt: {
        Args: {
          p_student_id: string;
          p_amount_cents: number;
          p_method_id: string;
          p_cash_account_id: string;
          p_concept: string;
          p_period_label: string;
          p_category_name: string;
          p_paid_at?: string;
          p_external_reference?: string;
          p_mp_payment_id?: string;
          p_mp_status?: string;
          p_mp_fee_cents?: number;
          p_net_amount_cents?: number;
          p_notes?: string;
          p_monthly_fee_id?: string;
          p_registration_fee_id?: string;
          p_workshop_id?: string;
          p_created_by?: string;
        };
        Returns: { payment_id: string; receipt_id: string; receipt_number: number }[];
      };
      register_to_workshop: {
        Args: {
          p_workshop_id: string;
          p_student_id?: string;
          p_first_name?: string;
          p_last_name?: string;
          p_phone?: string;
          p_email?: string;
          p_notes?: string;
        };
        Returns: string;
      };
      reject_payment_proof: {
        Args: {
          p_proof_id: string;
          p_reason: string;
        };
        Returns: undefined;
      };
      request_role: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      reserve_recovery_credit: {
        Args: {
          p_credit_id: string;
          p_group_id: string;
          p_date: string;
        };
        Returns: undefined;
      };
      settle_monthly_fee: {
        Args: {
          p_fee_id: string;
          p_method_id: string;
          p_cash_account_id: string;
          p_paid_at?: string;
          p_external_reference?: string;
          p_notes?: string;
          p_mp_payment_id?: string;
          p_mp_status?: string;
          p_mp_fee_cents?: number;
          p_net_amount_cents?: number;
          p_actor?: string;
        };
        Returns: string;
      };
      settle_registration_fee: {
        Args: {
          p_fee_id: string;
          p_method_id: string;
          p_cash_account_id: string;
          p_paid_at?: string;
          p_external_reference?: string;
          p_notes?: string;
          p_actor?: string;
        };
        Returns: string;
      };
      student_monthly_amount_cents: {
        Args: {
          p_student_id: string;
        };
        Returns: number;
      };
      use_recovery_credit: {
        Args: {
          p_credit_id: string;
          p_group_id: string;
          p_date: string;
        };
        Returns: string;
      };
      void_payment: {
        Args: {
          p_payment_id: string;
          p_reason: string;
        };
        Returns: undefined;
      };
      workshop_confirmed_count: {
        Args: {
          p_workshop_id: string;
        };
        Returns: number;
      };
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Views<T extends keyof PublicSchema["Views"]> =
  PublicSchema["Views"][T]["Row"];
export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T];
