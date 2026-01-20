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
      analysis_jobs: {
        Row: {
          completed_at: string | null
          completed_questions: number
          course_pack_id: string
          created_at: string
          created_by: string | null
          current_question_id: string | null
          current_question_prompt: string | null
          error_message: string | null
          failed_questions: number
          id: string
          source_exam: string
          started_at: string | null
          status: string
          total_questions: number
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_questions?: number
          course_pack_id: string
          created_at?: string
          created_by?: string | null
          current_question_id?: string | null
          current_question_prompt?: string | null
          error_message?: string | null
          failed_questions?: number
          id?: string
          source_exam: string
          started_at?: string | null
          status?: string
          total_questions?: number
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_questions?: number
          course_pack_id?: string
          created_at?: string
          created_by?: string | null
          current_question_id?: string | null
          current_question_prompt?: string | null
          error_message?: string | null
          failed_questions?: number
          id?: string
          source_exam?: string
          started_at?: string | null
          status?: string
          total_questions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "analysis_jobs_course_pack_id_fkey"
            columns: ["course_pack_id"]
            isOneToOne: false
            referencedRelation: "course_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_jobs_current_question_id_fkey"
            columns: ["current_question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      attempts: {
        Row: {
          answer_given: string | null
          confidence: string | null
          created_at: string
          guide_used: boolean
          hint_used: boolean
          id: string
          is_correct: boolean
          question_id: string
          selected_choice_id: string | null
          time_spent_ms: number | null
          user_id: string
        }
        Insert: {
          answer_given?: string | null
          confidence?: string | null
          created_at?: string
          guide_used?: boolean
          hint_used?: boolean
          id?: string
          is_correct: boolean
          question_id: string
          selected_choice_id?: string | null
          time_spent_ms?: number | null
          user_id: string
        }
        Update: {
          answer_given?: string | null
          confidence?: string | null
          created_at?: string
          guide_used?: boolean
          hint_used?: boolean
          id?: string
          is_correct?: boolean
          question_id?: string
          selected_choice_id?: string | null
          time_spent_ms?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attempts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          course_pack_id: string
          created_at: string
          day_of_week: string | null
          description: string | null
          event_date: string | null
          event_type: string
          homework_assignments: string[] | null
          id: string
          ingestion_job_id: string | null
          location: string | null
          needs_review: boolean
          time_slot: string | null
          title: string
          topics_covered: string[] | null
          updated_at: string
          week_number: number
        }
        Insert: {
          course_pack_id: string
          created_at?: string
          day_of_week?: string | null
          description?: string | null
          event_date?: string | null
          event_type: string
          homework_assignments?: string[] | null
          id?: string
          ingestion_job_id?: string | null
          location?: string | null
          needs_review?: boolean
          time_slot?: string | null
          title: string
          topics_covered?: string[] | null
          updated_at?: string
          week_number: number
        }
        Update: {
          course_pack_id?: string
          created_at?: string
          day_of_week?: string | null
          description?: string | null
          event_date?: string | null
          event_type?: string
          homework_assignments?: string[] | null
          id?: string
          ingestion_job_id?: string | null
          location?: string | null
          needs_review?: boolean
          time_slot?: string | null
          title?: string
          topics_covered?: string[] | null
          updated_at?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_course_pack_id_fkey"
            columns: ["course_pack_id"]
            isOneToOne: false
            referencedRelation: "course_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_ingestion_job_id_fkey"
            columns: ["ingestion_job_id"]
            isOneToOne: false
            referencedRelation: "ingestion_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      course_packs: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_published: boolean
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ingestion_jobs: {
        Row: {
          completed_at: string | null
          course_pack_id: string
          created_at: string
          created_by: string | null
          current_step: string | null
          error_message: string | null
          exam_semester: string | null
          exam_type: string | null
          exam_year: number | null
          file_name: string
          file_path: string
          id: string
          is_final: boolean
          is_published: boolean
          kind: string
          progress_pct: number | null
          questions_extracted: number | null
          questions_mapped: number | null
          questions_pending_review: number | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          course_pack_id: string
          created_at?: string
          created_by?: string | null
          current_step?: string | null
          error_message?: string | null
          exam_semester?: string | null
          exam_type?: string | null
          exam_year?: number | null
          file_name: string
          file_path: string
          id?: string
          is_final?: boolean
          is_published?: boolean
          kind?: string
          progress_pct?: number | null
          questions_extracted?: number | null
          questions_mapped?: number | null
          questions_pending_review?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          course_pack_id?: string
          created_at?: string
          created_by?: string | null
          current_step?: string | null
          error_message?: string | null
          exam_semester?: string | null
          exam_type?: string | null
          exam_year?: number | null
          file_name?: string
          file_path?: string
          id?: string
          is_final?: boolean
          is_published?: boolean
          kind?: string
          progress_pct?: number | null
          questions_extracted?: number | null
          questions_mapped?: number | null
          questions_pending_review?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_jobs_course_pack_id_fkey"
            columns: ["course_pack_id"]
            isOneToOne: false
            referencedRelation: "course_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      question_types: {
        Row: {
          aliases: string[] | null
          course_pack_id: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          status: string
        }
        Insert: {
          aliases?: string[] | null
          course_pack_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          status?: string
        }
        Update: {
          aliases?: string[] | null
          course_pack_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_types_course_pack_id_fkey"
            columns: ["course_pack_id"]
            isOneToOne: false
            referencedRelation: "course_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          choices: Json | null
          correct_answer: string | null
          corresponds_to_exam: string | null
          course_pack_id: string | null
          created_at: string
          difficulty: number | null
          guide_me_steps: Json | null
          hint: string | null
          id: string
          image_url: string | null
          midterm_number: number | null
          needs_review: boolean
          prompt: string
          question_order: number | null
          question_type_id: string | null
          solution_steps: Json | null
          source_exam: string | null
          topic_ids: string[]
          unmapped_topic_suggestions: string[] | null
          updated_at: string
        }
        Insert: {
          choices?: Json | null
          correct_answer?: string | null
          corresponds_to_exam?: string | null
          course_pack_id?: string | null
          created_at?: string
          difficulty?: number | null
          guide_me_steps?: Json | null
          hint?: string | null
          id?: string
          image_url?: string | null
          midterm_number?: number | null
          needs_review?: boolean
          prompt: string
          question_order?: number | null
          question_type_id?: string | null
          solution_steps?: Json | null
          source_exam?: string | null
          topic_ids?: string[]
          unmapped_topic_suggestions?: string[] | null
          updated_at?: string
        }
        Update: {
          choices?: Json | null
          correct_answer?: string | null
          corresponds_to_exam?: string | null
          course_pack_id?: string | null
          created_at?: string
          difficulty?: number | null
          guide_me_steps?: Json | null
          hint?: string | null
          id?: string
          image_url?: string | null
          midterm_number?: number | null
          needs_review?: boolean
          prompt?: string
          question_order?: number | null
          question_type_id?: string | null
          solution_steps?: Json | null
          source_exam?: string | null
          topic_ids?: string[]
          unmapped_topic_suggestions?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_course_pack_id_fkey"
            columns: ["course_pack_id"]
            isOneToOne: false
            referencedRelation: "course_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_question_type_id_fkey"
            columns: ["question_type_id"]
            isOneToOne: false
            referencedRelation: "question_types"
            referencedColumns: ["id"]
          },
        ]
      }
      srs_state: {
        Row: {
          created_at: string
          due_at: string
          ease: number
          id: string
          interval_days: number
          last_reviewed_at: string | null
          question_id: string
          reps: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          due_at?: string
          ease?: number
          id?: string
          interval_days?: number
          last_reviewed_at?: string | null
          question_id: string
          reps?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          due_at?: string
          ease?: number
          id?: string
          interval_days?: number
          last_reviewed_at?: string | null
          question_id?: string
          reps?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "srs_state_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      topic_mastery: {
        Row: {
          created_at: string
          id: string
          last_practiced_at: string | null
          mastery_0_1: number
          questions_attempted: number
          questions_correct: number
          retention_0_1: number
          retention_updated_at: string | null
          topic_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_practiced_at?: string | null
          mastery_0_1?: number
          questions_attempted?: number
          questions_correct?: number
          retention_0_1?: number
          retention_updated_at?: string | null
          topic_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_practiced_at?: string | null
          mastery_0_1?: number
          questions_attempted?: number
          questions_correct?: number
          retention_0_1?: number
          retention_updated_at?: string | null
          topic_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topic_mastery_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          course_pack_id: string | null
          created_at: string
          description: string | null
          id: string
          midterm_coverage: number | null
          prerequisite_topic_ids: string[] | null
          scheduled_week: number | null
          title: string
          updated_at: string
        }
        Insert: {
          course_pack_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          midterm_coverage?: number | null
          prerequisite_topic_ids?: string[] | null
          scheduled_week?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          course_pack_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          midterm_coverage?: number | null
          prerequisite_topic_ids?: string[] | null
          scheduled_week?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "topics_course_pack_id_fkey"
            columns: ["course_pack_id"]
            isOneToOne: false
            referencedRelation: "course_packs"
            referencedColumns: ["id"]
          },
        ]
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
      user_settings: {
        Row: {
          created_at: string
          daily_goal: number
          id: string
          notifications_enabled: boolean
          pace_offset: number
          reduced_motion: boolean
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_goal?: number
          id?: string
          notifications_enabled?: boolean
          pace_offset?: number
          reduced_motion?: boolean
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_goal?: number
          id?: string
          notifications_enabled?: boolean
          pace_offset?: number
          reduced_motion?: boolean
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      compute_quality_score: {
        Args: {
          p_confidence: string
          p_guide_used: boolean
          p_hint_used: boolean
          p_is_correct: boolean
        }
        Returns: number
      }
      get_recommended_questions: {
        Args: {
          p_current_week?: number
          p_limit?: number
          p_pace_offset?: number
          p_target_difficulty?: number
          p_user_id: string
        }
        Returns: {
          choices: Json
          correct_answer: string
          difficulty: number
          difficulty_match: number
          due_urgency: number
          hint: string
          knowledge_gap: number
          prompt: string
          question_id: string
          question_type_id: string
          score: number
          solution_steps: Json
          source_exam: string
          topic_ids: string[]
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "student"
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
      app_role: ["admin", "student"],
    },
  },
} as const
