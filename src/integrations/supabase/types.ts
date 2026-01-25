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
          ai_feedback: Json | null
          answer_given: string | null
          answer_image_url: string | null
          answer_text: string | null
          confidence: string | null
          created_at: string
          guide_used: boolean
          hint_used: boolean
          id: string
          is_correct: boolean
          max_points: number | null
          points_earned: number | null
          question_id: string
          selected_choice_id: string | null
          subpart_id: string | null
          time_spent_ms: number | null
          user_id: string
        }
        Insert: {
          ai_feedback?: Json | null
          answer_given?: string | null
          answer_image_url?: string | null
          answer_text?: string | null
          confidence?: string | null
          created_at?: string
          guide_used?: boolean
          hint_used?: boolean
          id?: string
          is_correct: boolean
          max_points?: number | null
          points_earned?: number | null
          question_id: string
          selected_choice_id?: string | null
          subpart_id?: string | null
          time_spent_ms?: number | null
          user_id: string
        }
        Update: {
          ai_feedback?: Json | null
          answer_given?: string | null
          answer_image_url?: string | null
          answer_text?: string | null
          confidence?: string | null
          created_at?: string
          guide_used?: boolean
          hint_used?: boolean
          id?: string
          is_correct?: boolean
          max_points?: number | null
          points_earned?: number | null
          question_id?: string
          selected_choice_id?: string | null
          subpart_id?: string | null
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
      course_editions: {
        Row: {
          course_pack_id: string
          created_at: string
          created_by: string | null
          id: string
          instructor: string | null
          is_active: boolean
          section: string | null
          term: string | null
          updated_at: string
        }
        Insert: {
          course_pack_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          instructor?: string | null
          is_active?: boolean
          section?: string | null
          term?: string | null
          updated_at?: string
        }
        Update: {
          course_pack_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          instructor?: string | null
          is_active?: boolean
          section?: string | null
          term?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_editions_course_pack_id_fkey"
            columns: ["course_pack_id"]
            isOneToOne: false
            referencedRelation: "course_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      course_materials: {
        Row: {
          analysis_json: Json | null
          content_fingerprint: string | null
          course_pack_id: string
          created_at: string
          created_by: string | null
          edition_id: string | null
          error_message: string | null
          file_name: string
          id: string
          material_type: string
          questions_generated_count: number | null
          sha256: string
          status: string
          storage_path: string
          title: string
          topics_extracted_count: number | null
          updated_at: string
        }
        Insert: {
          analysis_json?: Json | null
          content_fingerprint?: string | null
          course_pack_id: string
          created_at?: string
          created_by?: string | null
          edition_id?: string | null
          error_message?: string | null
          file_name: string
          id?: string
          material_type: string
          questions_generated_count?: number | null
          sha256: string
          status?: string
          storage_path: string
          title: string
          topics_extracted_count?: number | null
          updated_at?: string
        }
        Update: {
          analysis_json?: Json | null
          content_fingerprint?: string | null
          course_pack_id?: string
          created_at?: string
          created_by?: string | null
          edition_id?: string | null
          error_message?: string | null
          file_name?: string
          id?: string
          material_type?: string
          questions_generated_count?: number | null
          sha256?: string
          status?: string
          storage_path?: string
          title?: string
          topics_extracted_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_materials_course_pack_id_fkey"
            columns: ["course_pack_id"]
            isOneToOne: false
            referencedRelation: "course_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_materials_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "course_editions"
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
          answer_key_file_name: string | null
          answer_key_path: string | null
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
          has_answer_key: boolean | null
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
          answer_key_file_name?: string | null
          answer_key_path?: string | null
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
          has_answer_key?: boolean | null
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
          answer_key_file_name?: string | null
          answer_key_path?: string | null
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
          has_answer_key?: boolean | null
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
      material_chunks: {
        Row: {
          chunk_index: number
          chunk_type: string
          created_at: string
          id: string
          material_id: string
          text: string
          title_hint: string | null
        }
        Insert: {
          chunk_index: number
          chunk_type: string
          created_at?: string
          id?: string
          material_id: string
          text: string
          title_hint?: string | null
        }
        Update: {
          chunk_index?: number
          chunk_type?: string
          created_at?: string
          id?: string
          material_id?: string
          text?: string
          title_hint?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_chunks_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "course_materials"
            referencedColumns: ["id"]
          },
        ]
      }
      objectives: {
        Row: {
          created_at: string
          id: string
          objective_text: string
          source_material_id: string | null
          topic_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          objective_text: string
          source_material_id?: string | null
          topic_id: string
        }
        Update: {
          created_at?: string
          id?: string
          objective_text?: string
          source_material_id?: string | null
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "objectives_source_material_id_fkey"
            columns: ["source_material_id"]
            isOneToOne: false
            referencedRelation: "course_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "objectives_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
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
          answer_format_enum: string | null
          answer_key_answer: string | null
          answer_mismatch: boolean | null
          answer_spec: Json | null
          choices: Json | null
          common_mistakes: Json | null
          correct_answer: string | null
          corresponds_to_exam: string | null
          course_pack_id: string | null
          created_at: string
          difficulty: number | null
          edit_reason: string | null
          edited_at: string | null
          edited_by: string | null
          extracted_raw_text: string | null
          full_solution: string | null
          grading_spec: Json | null
          guide_me_steps: Json | null
          hint: string | null
          id: string
          image_url: string | null
          is_published: boolean | null
          midterm_number: number | null
          needs_review: boolean
          objective_id: string | null
          parent_question_id: string | null
          prompt: string
          quality_flags: Json | null
          quality_score: number | null
          question_format: string | null
          question_order: number | null
          question_type_id: string | null
          render_blocks: Json | null
          solution_steps: Json | null
          source: string | null
          source_exam: string | null
          source_locator: Json | null
          source_material_id: string | null
          status: string | null
          subparts: Json | null
          tags: Json | null
          topic_ids: string[]
          unmapped_topic_suggestions: string[] | null
          updated_at: string
          version: number | null
        }
        Insert: {
          answer_format_enum?: string | null
          answer_key_answer?: string | null
          answer_mismatch?: boolean | null
          answer_spec?: Json | null
          choices?: Json | null
          common_mistakes?: Json | null
          correct_answer?: string | null
          corresponds_to_exam?: string | null
          course_pack_id?: string | null
          created_at?: string
          difficulty?: number | null
          edit_reason?: string | null
          edited_at?: string | null
          edited_by?: string | null
          extracted_raw_text?: string | null
          full_solution?: string | null
          grading_spec?: Json | null
          guide_me_steps?: Json | null
          hint?: string | null
          id?: string
          image_url?: string | null
          is_published?: boolean | null
          midterm_number?: number | null
          needs_review?: boolean
          objective_id?: string | null
          parent_question_id?: string | null
          prompt: string
          quality_flags?: Json | null
          quality_score?: number | null
          question_format?: string | null
          question_order?: number | null
          question_type_id?: string | null
          render_blocks?: Json | null
          solution_steps?: Json | null
          source?: string | null
          source_exam?: string | null
          source_locator?: Json | null
          source_material_id?: string | null
          status?: string | null
          subparts?: Json | null
          tags?: Json | null
          topic_ids?: string[]
          unmapped_topic_suggestions?: string[] | null
          updated_at?: string
          version?: number | null
        }
        Update: {
          answer_format_enum?: string | null
          answer_key_answer?: string | null
          answer_mismatch?: boolean | null
          answer_spec?: Json | null
          choices?: Json | null
          common_mistakes?: Json | null
          correct_answer?: string | null
          corresponds_to_exam?: string | null
          course_pack_id?: string | null
          created_at?: string
          difficulty?: number | null
          edit_reason?: string | null
          edited_at?: string | null
          edited_by?: string | null
          extracted_raw_text?: string | null
          full_solution?: string | null
          grading_spec?: Json | null
          guide_me_steps?: Json | null
          hint?: string | null
          id?: string
          image_url?: string | null
          is_published?: boolean | null
          midterm_number?: number | null
          needs_review?: boolean
          objective_id?: string | null
          parent_question_id?: string | null
          prompt?: string
          quality_flags?: Json | null
          quality_score?: number | null
          question_format?: string | null
          question_order?: number | null
          question_type_id?: string | null
          render_blocks?: Json | null
          solution_steps?: Json | null
          source?: string | null
          source_exam?: string | null
          source_locator?: Json | null
          source_material_id?: string | null
          status?: string | null
          subparts?: Json | null
          tags?: Json | null
          topic_ids?: string[]
          unmapped_topic_suggestions?: string[] | null
          updated_at?: string
          version?: number | null
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
            foreignKeyName: "questions_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_parent_question_id_fkey"
            columns: ["parent_question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_question_type_id_fkey"
            columns: ["question_type_id"]
            isOneToOne: false
            referencedRelation: "question_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_source_material_id_fkey"
            columns: ["source_material_id"]
            isOneToOne: false
            referencedRelation: "course_materials"
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
          consecutive_correct: number
          consecutive_incorrect: number
          created_at: string
          effective_difficulty_level: number
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
          consecutive_correct?: number
          consecutive_incorrect?: number
          created_at?: string
          effective_difficulty_level?: number
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
          consecutive_correct?: number
          consecutive_incorrect?: number
          created_at?: string
          effective_difficulty_level?: number
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
          edition_id: string | null
          id: string
          midterm_coverage: number | null
          prerequisite_topic_ids: string[] | null
          scheduled_week: number | null
          source: string | null
          title: string
          topic_code: string | null
          updated_at: string
        }
        Insert: {
          course_pack_id?: string | null
          created_at?: string
          description?: string | null
          edition_id?: string | null
          id?: string
          midterm_coverage?: number | null
          prerequisite_topic_ids?: string[] | null
          scheduled_week?: number | null
          source?: string | null
          title: string
          topic_code?: string | null
          updated_at?: string
        }
        Update: {
          course_pack_id?: string | null
          created_at?: string
          description?: string | null
          edition_id?: string | null
          id?: string
          midterm_coverage?: number | null
          prerequisite_topic_ids?: string[] | null
          scheduled_week?: number | null
          source?: string | null
          title?: string
          topic_code?: string | null
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
          {
            foreignKeyName: "topics_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "course_editions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_enrollments: {
        Row: {
          course_pack_id: string
          enrolled_at: string
          id: string
          user_id: string
        }
        Insert: {
          course_pack_id: string
          enrolled_at?: string
          id?: string
          user_id: string
        }
        Update: {
          course_pack_id?: string
          enrolled_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_enrollments_course_pack_id_fkey"
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
          daily_plan_mode: string
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
          daily_plan_mode?: string
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
          daily_plan_mode?: string
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
      build_daily_plan: {
        Args: {
          p_course_id?: string
          p_current_week?: number
          p_limit?: number
          p_pace_offset?: number
          p_user_id: string
        }
        Returns: Database["public"]["CompositeTypes"]["daily_plan_question"][]
        SetofOptions: {
          from: "*"
          to: "daily_plan_question"
          isOneToOne: false
          isSetofReturn: true
        }
      }
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
          p_course_id?: string
          p_current_week?: number
          p_exam_name?: string
          p_limit?: number
          p_pace_offset?: number
          p_question_type_id?: string
          p_target_difficulty?: number
          p_topic_ids?: string[]
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
      answer_format:
        | "mcq"
        | "multi_select"
        | "numeric"
        | "expression"
        | "short_text"
        | "free_response"
        | "matching"
        | "ordering"
      app_role: "admin" | "student"
    }
    CompositeTypes: {
      daily_plan_question: {
        question_id: string | null
        prompt: string | null
        choices: Json | null
        correct_answer: string | null
        hint: string | null
        solution_steps: Json | null
        difficulty: number | null
        source_exam: string | null
        topic_ids: string[] | null
        question_type_id: string | null
        category: string | null
        why_selected: string | null
        priority_score: number | null
      }
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
      answer_format: [
        "mcq",
        "multi_select",
        "numeric",
        "expression",
        "short_text",
        "free_response",
        "matching",
        "ordering",
      ],
      app_role: ["admin", "student"],
    },
  },
} as const
