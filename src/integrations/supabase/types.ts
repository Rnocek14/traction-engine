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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      account_configs: {
        Row: {
          account_id: string
          audience: Json
          banned_topics: string[]
          claim_policy: Database["public"]["Enums"]["claim_policy_level"]
          content_pillars: string[]
          created_at: string
          cta_destination: string | null
          cta_phrases: string[]
          cta_style: Database["public"]["Enums"]["cta_style"]
          disclaimer_rules: Json
          id: string
          persona: Json
          promise: string
          style_rules: Json
          uniqueness_salt: string | null
          updated_at: string
          vertical: Database["public"]["Enums"]["content_vertical"]
        }
        Insert: {
          account_id: string
          audience?: Json
          banned_topics?: string[]
          claim_policy?: Database["public"]["Enums"]["claim_policy_level"]
          content_pillars?: string[]
          created_at?: string
          cta_destination?: string | null
          cta_phrases?: string[]
          cta_style?: Database["public"]["Enums"]["cta_style"]
          disclaimer_rules?: Json
          id?: string
          persona?: Json
          promise: string
          style_rules?: Json
          uniqueness_salt?: string | null
          updated_at?: string
          vertical: Database["public"]["Enums"]["content_vertical"]
        }
        Update: {
          account_id?: string
          audience?: Json
          banned_topics?: string[]
          claim_policy?: Database["public"]["Enums"]["claim_policy_level"]
          content_pillars?: string[]
          created_at?: string
          cta_destination?: string | null
          cta_phrases?: string[]
          cta_style?: Database["public"]["Enums"]["cta_style"]
          disclaimer_rules?: Json
          id?: string
          persona?: Json
          promise?: string
          style_rules?: Json
          uniqueness_salt?: string | null
          updated_at?: string
          vertical?: Database["public"]["Enums"]["content_vertical"]
        }
        Relationships: []
      }
      career_profiles: {
        Row: {
          alt_pathways: string[] | null
          alternate_titles: string[] | null
          certifications: string[] | null
          classification_codes: string[] | null
          created_at: string | null
          cri_floor: number | null
          description: string | null
          entry_salary: number | null
          growth_outlook: string | null
          holland_code: string | null
          id: string
          industry: string | null
          key_skills: string[] | null
          last_updated: string | null
          licenses: string[] | null
          mid_salary: number | null
          outlook_percent: number | null
          related_career_ids: string[] | null
          required_education: string[] | null
          required_experience: string | null
          roi_score: number | null
          salary_range: string | null
          summary: string | null
          time_to_entry: string | null
          title: string | null
          total_cost: number | null
          version: number | null
        }
        Insert: {
          alt_pathways?: string[] | null
          alternate_titles?: string[] | null
          certifications?: string[] | null
          classification_codes?: string[] | null
          created_at?: string | null
          cri_floor?: number | null
          description?: string | null
          entry_salary?: number | null
          growth_outlook?: string | null
          holland_code?: string | null
          id?: string
          industry?: string | null
          key_skills?: string[] | null
          last_updated?: string | null
          licenses?: string[] | null
          mid_salary?: number | null
          outlook_percent?: number | null
          related_career_ids?: string[] | null
          required_education?: string[] | null
          required_experience?: string | null
          roi_score?: number | null
          salary_range?: string | null
          summary?: string | null
          time_to_entry?: string | null
          title?: string | null
          total_cost?: number | null
          version?: number | null
        }
        Update: {
          alt_pathways?: string[] | null
          alternate_titles?: string[] | null
          certifications?: string[] | null
          classification_codes?: string[] | null
          created_at?: string | null
          cri_floor?: number | null
          description?: string | null
          entry_salary?: number | null
          growth_outlook?: string | null
          holland_code?: string | null
          id?: string
          industry?: string | null
          key_skills?: string[] | null
          last_updated?: string | null
          licenses?: string[] | null
          mid_salary?: number | null
          outlook_percent?: number | null
          related_career_ids?: string[] | null
          required_education?: string[] | null
          required_experience?: string | null
          roi_score?: number | null
          salary_range?: string | null
          summary?: string | null
          time_to_entry?: string | null
          title?: string | null
          total_cost?: number | null
          version?: number | null
        }
        Relationships: []
      }
      career_steps: {
        Row: {
          career_id: string
          created_at: string | null
          grouping: string | null
          id: string
          milestone_order: number | null
          outcome_description: string | null
          recommended_courses: string[] | null
          required_skills: string[] | null
          step_notes: string | null
          step_type: Database["public"]["Enums"]["step_type"]
          title: string
        }
        Insert: {
          career_id: string
          created_at?: string | null
          grouping?: string | null
          id?: string
          milestone_order?: number | null
          outcome_description?: string | null
          recommended_courses?: string[] | null
          required_skills?: string[] | null
          step_notes?: string | null
          step_type: Database["public"]["Enums"]["step_type"]
          title: string
        }
        Update: {
          career_id?: string
          created_at?: string | null
          grouping?: string | null
          id?: string
          milestone_order?: number | null
          outcome_description?: string | null
          recommended_courses?: string[] | null
          required_skills?: string[] | null
          step_notes?: string | null
          step_type?: Database["public"]["Enums"]["step_type"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_steps_career_id_fkey"
            columns: ["career_id"]
            isOneToOne: false
            referencedRelation: "career_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_policies: {
        Row: {
          banned_phrases: string[]
          created_at: string
          fact_check_required: boolean
          id: string
          prohibited_claim_types: string[]
          required_disclaimers: string[]
          safety_rules: Json
          updated_at: string
          vertical: Database["public"]["Enums"]["content_vertical"]
        }
        Insert: {
          banned_phrases?: string[]
          created_at?: string
          fact_check_required?: boolean
          id?: string
          prohibited_claim_types?: string[]
          required_disclaimers?: string[]
          safety_rules?: Json
          updated_at?: string
          vertical: Database["public"]["Enums"]["content_vertical"]
        }
        Update: {
          banned_phrases?: string[]
          created_at?: string
          fact_check_required?: boolean
          id?: string
          prohibited_claim_types?: string[]
          required_disclaimers?: string[]
          safety_rules?: Json
          updated_at?: string
          vertical?: Database["public"]["Enums"]["content_vertical"]
        }
        Relationships: []
      }
      course_cri_scores: {
        Row: {
          calculated_at: string | null
          course_id: string
          difficulty_component: number | null
          final_cri_score: number | null
          id: string
          instructor_modifier: number | null
          outcome_component: number | null
          skill_coverage_component: number | null
          time_effort_component: number | null
        }
        Insert: {
          calculated_at?: string | null
          course_id: string
          difficulty_component?: number | null
          final_cri_score?: number | null
          id?: string
          instructor_modifier?: number | null
          outcome_component?: number | null
          skill_coverage_component?: number | null
          time_effort_component?: number | null
        }
        Update: {
          calculated_at?: string | null
          course_id?: string
          difficulty_component?: number | null
          final_cri_score?: number | null
          id?: string
          instructor_modifier?: number | null
          outcome_component?: number | null
          skill_coverage_component?: number | null
          time_effort_component?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "course_cri_scores_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          cost: number | null
          created_at: string | null
          cri_score: number | null
          delivery_format: Database["public"]["Enums"]["delivery_format"] | null
          description: string | null
          difficulty_rating: number | null
          duration_hours: number | null
          id: string
          instructor_id: string | null
          provider: string | null
          skill_tags: string[] | null
          title: string
          verified_outcomes: string[] | null
        }
        Insert: {
          cost?: number | null
          created_at?: string | null
          cri_score?: number | null
          delivery_format?:
            | Database["public"]["Enums"]["delivery_format"]
            | null
          description?: string | null
          difficulty_rating?: number | null
          duration_hours?: number | null
          id?: string
          instructor_id?: string | null
          provider?: string | null
          skill_tags?: string[] | null
          title: string
          verified_outcomes?: string[] | null
        }
        Update: {
          cost?: number | null
          created_at?: string | null
          cri_score?: number | null
          delivery_format?:
            | Database["public"]["Enums"]["delivery_format"]
            | null
          description?: string | null
          difficulty_rating?: number | null
          duration_hours?: number | null
          id?: string
          instructor_id?: string | null
          provider?: string | null
          skill_tags?: string[] | null
          title?: string
          verified_outcomes?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      instructor_profiles: {
        Row: {
          bio: string | null
          created_at: string | null
          id: string
          linkedin_url: string | null
          name: string
          portfolio_url: string | null
          prestige_tier: number | null
          rating: number | null
          specialties: string[] | null
        }
        Insert: {
          bio?: string | null
          created_at?: string | null
          id?: string
          linkedin_url?: string | null
          name: string
          portfolio_url?: string | null
          prestige_tier?: number | null
          rating?: number | null
          specialties?: string[] | null
        }
        Update: {
          bio?: string | null
          created_at?: string | null
          id?: string
          linkedin_url?: string | null
          name?: string
          portfolio_url?: string | null
          prestige_tier?: number | null
          rating?: number | null
          specialties?: string[] | null
        }
        Relationships: []
      }
      instructor_ratings: {
        Row: {
          course_id: string | null
          created_at: string | null
          id: string
          instructor_id: string
          is_verified: boolean | null
          rating: number | null
          review_text: string | null
          user_id: string
          verification_proof: string | null
        }
        Insert: {
          course_id?: string | null
          created_at?: string | null
          id?: string
          instructor_id: string
          is_verified?: boolean | null
          rating?: number | null
          review_text?: string | null
          user_id: string
          verification_proof?: string | null
        }
        Update: {
          course_id?: string | null
          created_at?: string | null
          id?: string
          instructor_id?: string
          is_verified?: boolean | null
          rating?: number | null
          review_text?: string | null
          user_id?: string
          verification_proof?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instructor_ratings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instructor_ratings_instructor_id_fkey"
            columns: ["instructor_id"]
            isOneToOne: false
            referencedRelation: "instructor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          career_goal_id: string | null
          created_at: string | null
          email: string | null
          id: string
          known_skills: string[] | null
          learning_style: Database["public"]["Enums"]["learning_style"] | null
          profile_resume_input: string | null
          updated_at: string | null
        }
        Insert: {
          career_goal_id?: string | null
          created_at?: string | null
          email?: string | null
          id: string
          known_skills?: string[] | null
          learning_style?: Database["public"]["Enums"]["learning_style"] | null
          profile_resume_input?: string | null
          updated_at?: string | null
        }
        Update: {
          career_goal_id?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          known_skills?: string[] | null
          learning_style?: Database["public"]["Enums"]["learning_style"] | null
          profile_resume_input?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_career_goal_fk"
            columns: ["career_goal_id"]
            isOneToOne: false
            referencedRelation: "career_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      resume_exports: {
        Row: {
          export_format: Database["public"]["Enums"]["export_format"] | null
          formatted_output: string | null
          generated_at: string | null
          id: string
          included_steps: string[] | null
          title: string | null
          user_id: string
        }
        Insert: {
          export_format?: Database["public"]["Enums"]["export_format"] | null
          formatted_output?: string | null
          generated_at?: string | null
          id?: string
          included_steps?: string[] | null
          title?: string | null
          user_id: string
        }
        Update: {
          export_format?: Database["public"]["Enums"]["export_format"] | null
          formatted_output?: string | null
          generated_at?: string | null
          id?: string
          included_steps?: string[] | null
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      script_fingerprints: {
        Row: {
          account_id: string
          created_at: string
          hook_hash: string
          id: string
          script_id: string
          similarity_score: number | null
          topic_id: string | null
          voiceover_hash: string
        }
        Insert: {
          account_id: string
          created_at?: string
          hook_hash: string
          id?: string
          script_id: string
          similarity_score?: number | null
          topic_id?: string | null
          voiceover_hash: string
        }
        Update: {
          account_id?: string
          created_at?: string
          hook_hash?: string
          id?: string
          script_id?: string
          similarity_score?: number | null
          topic_id?: string | null
          voiceover_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_fingerprints_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "script_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      script_runs: {
        Row: {
          account_id: string
          created_at: string
          draft_edits: Json | null
          fact_claims: string[]
          generation_cost_cents: number
          hard_block_flags: string[]
          hook_hash: string | null
          id: string
          published_at: string | null
          qa_failed_reason: string | null
          qa_override_at: string | null
          qa_override_by: string | null
          qa_override_reason: string | null
          qa_passed_at: string | null
          qa_results: Json | null
          regenerated_from_id: string | null
          safety_flags: string[]
          scene_hash: string | null
          script_content: Json
          status: Database["public"]["Enums"]["script_status"]
          topic_id: string | null
          voiceover_hash: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          draft_edits?: Json | null
          fact_claims?: string[]
          generation_cost_cents?: number
          hard_block_flags?: string[]
          hook_hash?: string | null
          id?: string
          published_at?: string | null
          qa_failed_reason?: string | null
          qa_override_at?: string | null
          qa_override_by?: string | null
          qa_override_reason?: string | null
          qa_passed_at?: string | null
          qa_results?: Json | null
          regenerated_from_id?: string | null
          safety_flags?: string[]
          scene_hash?: string | null
          script_content?: Json
          status?: Database["public"]["Enums"]["script_status"]
          topic_id?: string | null
          voiceover_hash?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          draft_edits?: Json | null
          fact_claims?: string[]
          generation_cost_cents?: number
          hard_block_flags?: string[]
          hook_hash?: string | null
          id?: string
          published_at?: string | null
          qa_failed_reason?: string | null
          qa_override_at?: string | null
          qa_override_by?: string | null
          qa_override_reason?: string | null
          qa_passed_at?: string | null
          qa_results?: Json | null
          regenerated_from_id?: string | null
          safety_flags?: string[]
          scene_hash?: string | null
          script_content?: Json
          status?: Database["public"]["Enums"]["script_status"]
          topic_id?: string | null
          voiceover_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "script_runs_regenerated_from_id_fkey"
            columns: ["regenerated_from_id"]
            isOneToOne: false
            referencedRelation: "script_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_runs_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topic_bank"
            referencedColumns: ["id"]
          },
        ]
      }
      script_variants: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          parent_script_id: string
          selected: boolean
          variant_content: string
          variant_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          parent_script_id: string
          selected?: boolean
          variant_content: string
          variant_type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          parent_script_id?: string
          selected?: boolean
          variant_content?: string
          variant_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_variants_parent_script_id_fkey"
            columns: ["parent_script_id"]
            isOneToOne: false
            referencedRelation: "script_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_graph: {
        Row: {
          category: string | null
          course_ids_that_teach_this_skill: string[] | null
          created_at: string | null
          id: string
          is_core_to_goal: boolean | null
          level_tier: number | null
          name: string
          related_jobs: string[] | null
        }
        Insert: {
          category?: string | null
          course_ids_that_teach_this_skill?: string[] | null
          created_at?: string | null
          id?: string
          is_core_to_goal?: boolean | null
          level_tier?: number | null
          name: string
          related_jobs?: string[] | null
        }
        Update: {
          category?: string | null
          course_ids_that_teach_this_skill?: string[] | null
          created_at?: string | null
          id?: string
          is_core_to_goal?: boolean | null
          level_tier?: number | null
          name?: string
          related_jobs?: string[] | null
        }
        Relationships: []
      }
      topic_bank: {
        Row: {
          claim_sensitivity: number
          cooldown_days: number
          created_at: string
          hook_variants: string[]
          id: string
          is_evergreen: boolean
          last_used_at: string | null
          motif_hints: string[]
          pillar: string
          seasonal_tags: string[]
          suggested_cta: string | null
          times_used: number
          topic_prompt: string
          trend_keywords: string[]
          vertical: Database["public"]["Enums"]["content_vertical"]
        }
        Insert: {
          claim_sensitivity?: number
          cooldown_days?: number
          created_at?: string
          hook_variants?: string[]
          id?: string
          is_evergreen?: boolean
          last_used_at?: string | null
          motif_hints?: string[]
          pillar: string
          seasonal_tags?: string[]
          suggested_cta?: string | null
          times_used?: number
          topic_prompt: string
          trend_keywords?: string[]
          vertical: Database["public"]["Enums"]["content_vertical"]
        }
        Update: {
          claim_sensitivity?: number
          cooldown_days?: number
          created_at?: string
          hook_variants?: string[]
          id?: string
          is_evergreen?: boolean
          last_used_at?: string | null
          motif_hints?: string[]
          pillar?: string
          seasonal_tags?: string[]
          suggested_cta?: string | null
          times_used?: number
          topic_prompt?: string
          trend_keywords?: string[]
          vertical?: Database["public"]["Enums"]["content_vertical"]
        }
        Relationships: []
      }
      user_progress: {
        Row: {
          created_at: string | null
          date_completed: string | null
          id: string
          proof_url: string | null
          skill_tags_verified: string[] | null
          status: Database["public"]["Enums"]["progress_status"] | null
          step_id: string
          updated_at: string | null
          used_in_resume: boolean | null
          user_id: string
          verification_type:
            | Database["public"]["Enums"]["verification_type"]
            | null
        }
        Insert: {
          created_at?: string | null
          date_completed?: string | null
          id?: string
          proof_url?: string | null
          skill_tags_verified?: string[] | null
          status?: Database["public"]["Enums"]["progress_status"] | null
          step_id: string
          updated_at?: string | null
          used_in_resume?: boolean | null
          user_id: string
          verification_type?:
            | Database["public"]["Enums"]["verification_type"]
            | null
        }
        Update: {
          created_at?: string | null
          date_completed?: string | null
          id?: string
          proof_url?: string | null
          skill_tags_verified?: string[] | null
          status?: Database["public"]["Enums"]["progress_status"] | null
          step_id?: string
          updated_at?: string | null
          used_in_resume?: boolean | null
          user_id?: string
          verification_type?:
            | Database["public"]["Enums"]["verification_type"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "user_progress_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "career_steps"
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
      video_jobs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          output_url: string | null
          provider: string
          request_id: string | null
          script_run_id: string
          settings: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          output_url?: string | null
          provider?: string
          request_id?: string | null
          script_run_id: string
          settings?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          output_url?: string | null
          provider?: string
          request_id?: string | null
          script_run_id?: string
          settings?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_jobs_script_run_id_fkey"
            columns: ["script_run_id"]
            isOneToOne: false
            referencedRelation: "script_runs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      select_topic: {
        Args: { p_pillar?: string; p_vertical: string }
        Returns: {
          claim_sensitivity: number
          cooldown_days: number
          created_at: string
          hook_variants: string[]
          id: string
          is_evergreen: boolean
          last_used_at: string | null
          motif_hints: string[]
          pillar: string
          seasonal_tags: string[]
          suggested_cta: string | null
          times_used: number
          topic_prompt: string
          trend_keywords: string[]
          vertical: Database["public"]["Enums"]["content_vertical"]
        }[]
        SetofOptions: {
          from: "*"
          to: "topic_bank"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      app_role: "admin" | "qa" | "viewer"
      claim_policy_level: "standard" | "moderate" | "strict" | "medical"
      content_vertical: "privacy" | "education" | "health" | "hyperlocal"
      cta_style: "soft" | "direct" | "hard_offer"
      delivery_format: "online" | "in_person" | "hybrid" | "self_paced"
      export_format: "pdf" | "json" | "docx"
      learning_style: "video" | "project" | "reading"
      progress_status: "not_started" | "in_progress" | "completed"
      script_status:
        | "draft"
        | "qa_passed"
        | "qa_failed"
        | "generating"
        | "published"
        | "rejected"
      step_type:
        | "education"
        | "certification"
        | "job"
        | "experience"
        | "skill"
        | "project"
      verification_type:
        | "project"
        | "certification"
        | "mentor"
        | "transcript"
        | "portfolio"
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
      app_role: ["admin", "qa", "viewer"],
      claim_policy_level: ["standard", "moderate", "strict", "medical"],
      content_vertical: ["privacy", "education", "health", "hyperlocal"],
      cta_style: ["soft", "direct", "hard_offer"],
      delivery_format: ["online", "in_person", "hybrid", "self_paced"],
      export_format: ["pdf", "json", "docx"],
      learning_style: ["video", "project", "reading"],
      progress_status: ["not_started", "in_progress", "completed"],
      script_status: [
        "draft",
        "qa_passed",
        "qa_failed",
        "generating",
        "published",
        "rejected",
      ],
      step_type: [
        "education",
        "certification",
        "job",
        "experience",
        "skill",
        "project",
      ],
      verification_type: [
        "project",
        "certification",
        "mentor",
        "transcript",
        "portfolio",
      ],
    },
  },
} as const
