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
          account_name: string | null
          allowed_offer_types: string[]
          allowed_product_categories: string[]
          audience: Json
          banned_topics: string[]
          claim_policy: Database["public"]["Enums"]["claim_policy_level"]
          content_pillars: string[]
          content_style: string | null
          created_at: string
          cta_destination: string | null
          cta_phrases: string[]
          cta_style: Database["public"]["Enums"]["cta_style"]
          disclaimer_rules: Json
          handle: string | null
          id: string
          max_daily_posts: number
          monetization_mode: Database["public"]["Enums"]["monetization_mode"]
          persona: Json
          platform: Database["public"]["Enums"]["account_platform"]
          posting_frequency_target: number
          priority_score: number
          promise: string
          status: Database["public"]["Enums"]["account_status"]
          style_rules: Json
          uniqueness_salt: string | null
          updated_at: string
          vertical: Database["public"]["Enums"]["content_vertical"]
          voice_id: string | null
          voice_provider: string | null
        }
        Insert: {
          account_id: string
          account_name?: string | null
          allowed_offer_types?: string[]
          allowed_product_categories?: string[]
          audience?: Json
          banned_topics?: string[]
          claim_policy?: Database["public"]["Enums"]["claim_policy_level"]
          content_pillars?: string[]
          content_style?: string | null
          created_at?: string
          cta_destination?: string | null
          cta_phrases?: string[]
          cta_style?: Database["public"]["Enums"]["cta_style"]
          disclaimer_rules?: Json
          handle?: string | null
          id?: string
          max_daily_posts?: number
          monetization_mode?: Database["public"]["Enums"]["monetization_mode"]
          persona?: Json
          platform?: Database["public"]["Enums"]["account_platform"]
          posting_frequency_target?: number
          priority_score?: number
          promise: string
          status?: Database["public"]["Enums"]["account_status"]
          style_rules?: Json
          uniqueness_salt?: string | null
          updated_at?: string
          vertical: Database["public"]["Enums"]["content_vertical"]
          voice_id?: string | null
          voice_provider?: string | null
        }
        Update: {
          account_id?: string
          account_name?: string | null
          allowed_offer_types?: string[]
          allowed_product_categories?: string[]
          audience?: Json
          banned_topics?: string[]
          claim_policy?: Database["public"]["Enums"]["claim_policy_level"]
          content_pillars?: string[]
          content_style?: string | null
          created_at?: string
          cta_destination?: string | null
          cta_phrases?: string[]
          cta_style?: Database["public"]["Enums"]["cta_style"]
          disclaimer_rules?: Json
          handle?: string | null
          id?: string
          max_daily_posts?: number
          monetization_mode?: Database["public"]["Enums"]["monetization_mode"]
          persona?: Json
          platform?: Database["public"]["Enums"]["account_platform"]
          posting_frequency_target?: number
          priority_score?: number
          promise?: string
          status?: Database["public"]["Enums"]["account_status"]
          style_rules?: Json
          uniqueness_salt?: string | null
          updated_at?: string
          vertical?: Database["public"]["Enums"]["content_vertical"]
          voice_id?: string | null
          voice_provider?: string | null
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
      content_ideas: {
        Row: {
          account_id: string
          angle: string | null
          created_at: string
          cta_type: string | null
          cta_url: string | null
          emotional_triggers: string[]
          generated_by: string
          id: string
          opportunity_score: number | null
          product_id: string | null
          reasoning: string | null
          status: string
          story_job_id: string | null
          subject: string
          suggested_format: string | null
          suggested_hook_type: string | null
          title: string
          trend_source_ids: string[]
          updated_at: string
          vertical: string | null
        }
        Insert: {
          account_id: string
          angle?: string | null
          created_at?: string
          cta_type?: string | null
          cta_url?: string | null
          emotional_triggers?: string[]
          generated_by?: string
          id?: string
          opportunity_score?: number | null
          product_id?: string | null
          reasoning?: string | null
          status?: string
          story_job_id?: string | null
          subject: string
          suggested_format?: string | null
          suggested_hook_type?: string | null
          title: string
          trend_source_ids?: string[]
          updated_at?: string
          vertical?: string | null
        }
        Update: {
          account_id?: string
          angle?: string | null
          created_at?: string
          cta_type?: string | null
          cta_url?: string | null
          emotional_triggers?: string[]
          generated_by?: string
          id?: string
          opportunity_score?: number | null
          product_id?: string | null
          reasoning?: string | null
          status?: string
          story_job_id?: string | null
          subject?: string
          suggested_format?: string | null
          suggested_hook_type?: string | null
          title?: string
          trend_source_ids?: string[]
          updated_at?: string
          vertical?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_ideas_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_ideas_story_job_id_fkey"
            columns: ["story_job_id"]
            isOneToOne: false
            referencedRelation: "story_jobs"
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
      insight_performance: {
        Row: {
          created_at: string
          id: string
          outcome_score: number | null
          scraped_insight_id: string
          story_job_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          outcome_score?: number | null
          scraped_insight_id: string
          story_job_id: string
        }
        Update: {
          created_at?: string
          id?: string
          outcome_score?: number | null
          scraped_insight_id?: string
          story_job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insight_performance_scraped_insight_id_fkey"
            columns: ["scraped_insight_id"]
            isOneToOne: false
            referencedRelation: "scraped_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insight_performance_story_job_id_fkey"
            columns: ["story_job_id"]
            isOneToOne: false
            referencedRelation: "story_jobs"
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
      product_analysis: {
        Row: {
          analyzed_at: string | null
          analyzed_by: string | null
          competition_level: number | null
          created_at: string
          demonstrability_score: number | null
          emotional_triggers: string[] | null
          id: string
          impulse_buy_appeal: number | null
          overall_score: number | null
          price_sweet_spot: boolean | null
          product_id: string
          social_media_potential: number | null
          trending_status: string | null
          updated_at: string
          wow_factor: number | null
        }
        Insert: {
          analyzed_at?: string | null
          analyzed_by?: string | null
          competition_level?: number | null
          created_at?: string
          demonstrability_score?: number | null
          emotional_triggers?: string[] | null
          id?: string
          impulse_buy_appeal?: number | null
          overall_score?: number | null
          price_sweet_spot?: boolean | null
          product_id: string
          social_media_potential?: number | null
          trending_status?: string | null
          updated_at?: string
          wow_factor?: number | null
        }
        Update: {
          analyzed_at?: string | null
          analyzed_by?: string | null
          competition_level?: number | null
          created_at?: string
          demonstrability_score?: number | null
          emotional_triggers?: string[] | null
          id?: string
          impulse_buy_appeal?: number | null
          overall_score?: number | null
          price_sweet_spot?: boolean | null
          product_id?: string
          social_media_potential?: number | null
          trending_status?: string | null
          updated_at?: string
          wow_factor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_analysis_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_conversions: {
        Row: {
          ad_spend_cents: number | null
          add_to_carts: number | null
          clicks: number | null
          cogs_cents: number | null
          conversion_rate: number | null
          cost_per_acquisition_cents: number | null
          created_at: string
          date: string
          gross_profit_cents: number | null
          id: string
          impressions: number | null
          net_profit_cents: number | null
          product_id: string
          purchases: number | null
          refund_amount_cents: number | null
          refunds: number | null
          revenue_cents: number | null
          roas: number | null
          source: string
          updated_at: string
        }
        Insert: {
          ad_spend_cents?: number | null
          add_to_carts?: number | null
          clicks?: number | null
          cogs_cents?: number | null
          conversion_rate?: number | null
          cost_per_acquisition_cents?: number | null
          created_at?: string
          date: string
          gross_profit_cents?: number | null
          id?: string
          impressions?: number | null
          net_profit_cents?: number | null
          product_id: string
          purchases?: number | null
          refund_amount_cents?: number | null
          refunds?: number | null
          revenue_cents?: number | null
          roas?: number | null
          source?: string
          updated_at?: string
        }
        Update: {
          ad_spend_cents?: number | null
          add_to_carts?: number | null
          clicks?: number | null
          cogs_cents?: number | null
          conversion_rate?: number | null
          cost_per_acquisition_cents?: number | null
          created_at?: string
          date?: string
          gross_profit_cents?: number | null
          id?: string
          impressions?: number | null
          net_profit_cents?: number | null
          product_id?: string
          purchases?: number | null
          refund_amount_cents?: number | null
          refunds?: number | null
          revenue_cents?: number | null
          roas?: number | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_conversions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_decisions: {
        Row: {
          created_at: string | null
          decision_type: string
          decision_value: string | null
          id: string
          made_by: string | null
          product_id: string
          reason: string | null
        }
        Insert: {
          created_at?: string | null
          decision_type: string
          decision_value?: string | null
          id?: string
          made_by?: string | null
          product_id: string
          reason?: string | null
        }
        Update: {
          created_at?: string | null
          decision_type?: string
          decision_value?: string | null
          id?: string
          made_by?: string | null
          product_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_decisions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          ad_readiness_score: number | null
          created_at: string
          id: string
          is_primary: boolean
          label: string | null
          low_resolution: boolean | null
          manually_approved: boolean | null
          product_id: string
          source: string
          source_domain: string | null
          url: string
          verified: boolean
          watermarked: boolean | null
        }
        Insert: {
          ad_readiness_score?: number | null
          created_at?: string
          id?: string
          is_primary?: boolean
          label?: string | null
          low_resolution?: boolean | null
          manually_approved?: boolean | null
          product_id: string
          source?: string
          source_domain?: string | null
          url: string
          verified?: boolean
          watermarked?: boolean | null
        }
        Update: {
          ad_readiness_score?: number | null
          created_at?: string
          id?: string
          is_primary?: boolean
          label?: string | null
          low_resolution?: boolean | null
          manually_approved?: boolean | null
          product_id?: string
          source?: string
          source_domain?: string | null
          url?: string
          verified?: boolean
          watermarked?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_links: {
        Row: {
          ai_confidence: number | null
          ai_verdict: boolean | null
          canonical_url: string | null
          content_quality_score: number | null
          created_at: string
          distinctive_tokens_matched: string[] | null
          evidence_summary: Json | null
          extracted_brand: string | null
          extracted_currency: string | null
          extracted_product_name: string | null
          fetch_method: string | null
          first_seen_at: string | null
          id: string
          last_checked_at: string | null
          link_type: string
          manually_overridden: boolean | null
          match_confidence: number | null
          matched_tokens: string[] | null
          override_action: string | null
          platform: string
          price_cents: number | null
          product_id: string
          schema_type: string | null
          structured_price_cents: number | null
          title: string | null
          url: string
          validation_reasons: string[] | null
          validation_status: string | null
          verified: boolean
        }
        Insert: {
          ai_confidence?: number | null
          ai_verdict?: boolean | null
          canonical_url?: string | null
          content_quality_score?: number | null
          created_at?: string
          distinctive_tokens_matched?: string[] | null
          evidence_summary?: Json | null
          extracted_brand?: string | null
          extracted_currency?: string | null
          extracted_product_name?: string | null
          fetch_method?: string | null
          first_seen_at?: string | null
          id?: string
          last_checked_at?: string | null
          link_type?: string
          manually_overridden?: boolean | null
          match_confidence?: number | null
          matched_tokens?: string[] | null
          override_action?: string | null
          platform?: string
          price_cents?: number | null
          product_id: string
          schema_type?: string | null
          structured_price_cents?: number | null
          title?: string | null
          url: string
          validation_reasons?: string[] | null
          validation_status?: string | null
          verified?: boolean
        }
        Update: {
          ai_confidence?: number | null
          ai_verdict?: boolean | null
          canonical_url?: string | null
          content_quality_score?: number | null
          created_at?: string
          distinctive_tokens_matched?: string[] | null
          evidence_summary?: Json | null
          extracted_brand?: string | null
          extracted_currency?: string | null
          extracted_product_name?: string | null
          fetch_method?: string | null
          first_seen_at?: string | null
          id?: string
          last_checked_at?: string | null
          link_type?: string
          manually_overridden?: boolean | null
          match_confidence?: number | null
          matched_tokens?: string[] | null
          override_action?: string | null
          platform?: string
          price_cents?: number | null
          product_id?: string
          schema_type?: string | null
          structured_price_cents?: number | null
          title?: string | null
          url?: string
          validation_reasons?: string[] | null
          validation_status?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "product_links_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_market_snapshots: {
        Row: {
          created_at: string | null
          highest_verified_retail_cents: number | null
          id: string
          lowest_verified_retail_cents: number | null
          median_verified_retail_cents: number | null
          preferred_supplier_cost_cents: number | null
          preferred_supplier_delivered_cents: number | null
          product_id: string
          snapshot_at: string | null
          source_diversity_count: number | null
          spread_cents: number | null
          spread_pct: number | null
          updated_at: string | null
          verified_retail_count: number | null
          verified_wholesale_count: number | null
        }
        Insert: {
          created_at?: string | null
          highest_verified_retail_cents?: number | null
          id?: string
          lowest_verified_retail_cents?: number | null
          median_verified_retail_cents?: number | null
          preferred_supplier_cost_cents?: number | null
          preferred_supplier_delivered_cents?: number | null
          product_id: string
          snapshot_at?: string | null
          source_diversity_count?: number | null
          spread_cents?: number | null
          spread_pct?: number | null
          updated_at?: string | null
          verified_retail_count?: number | null
          verified_wholesale_count?: number | null
        }
        Update: {
          created_at?: string | null
          highest_verified_retail_cents?: number | null
          id?: string
          lowest_verified_retail_cents?: number | null
          median_verified_retail_cents?: number | null
          preferred_supplier_cost_cents?: number | null
          preferred_supplier_delivered_cents?: number | null
          product_id?: string
          snapshot_at?: string | null
          source_diversity_count?: number | null
          spread_cents?: number | null
          spread_pct?: number | null
          updated_at?: string | null
          verified_retail_count?: number | null
          verified_wholesale_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_market_snapshots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_suppliers: {
        Row: {
          communication_score: number | null
          created_at: string
          defect_risk: number | null
          delivery_days: number | null
          expected_return_rate_pct: number | null
          id: string
          is_preferred: boolean
          moq: number | null
          notes: string | null
          overall_supplier_score: number | null
          platform: string
          processing_days: number | null
          product_id: string
          reliability_score: number | null
          return_policy: string | null
          shipping_cost_cents: number | null
          shipping_country: string | null
          stock_status: string
          supplier_name: string
          supplier_url: string | null
          target_market: string | null
          unit_cost_cents: number | null
          updated_at: string
          verification_status: string
          verified_at: string | null
        }
        Insert: {
          communication_score?: number | null
          created_at?: string
          defect_risk?: number | null
          delivery_days?: number | null
          expected_return_rate_pct?: number | null
          id?: string
          is_preferred?: boolean
          moq?: number | null
          notes?: string | null
          overall_supplier_score?: number | null
          platform?: string
          processing_days?: number | null
          product_id: string
          reliability_score?: number | null
          return_policy?: string | null
          shipping_cost_cents?: number | null
          shipping_country?: string | null
          stock_status?: string
          supplier_name: string
          supplier_url?: string | null
          target_market?: string | null
          unit_cost_cents?: number | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
        }
        Update: {
          communication_score?: number | null
          created_at?: string
          defect_risk?: number | null
          delivery_days?: number | null
          expected_return_rate_pct?: number | null
          id?: string
          is_preferred?: boolean
          moq?: number | null
          notes?: string | null
          overall_supplier_score?: number | null
          platform?: string
          processing_days?: number | null
          product_id?: string
          reliability_score?: number | null
          return_policy?: string | null
          shipping_cost_cents?: number | null
          shipping_country?: string | null
          stock_status?: string
          supplier_name?: string
          supplier_url?: string | null
          target_market?: string | null
          unit_cost_cents?: number | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_suppliers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_unit_economics: {
        Row: {
          break_even_cpa_cents: number | null
          break_even_roas: number | null
          break_even_units: number | null
          calculated_at: string
          calculator_version: string
          content_cost_per_sale_cents: number
          created_at: string
          expected_return_rate_pct: number
          gross_margin_cents: number | null
          gross_margin_pct: number | null
          id: string
          net_margin_cents: number | null
          net_margin_pct: number | null
          packaging_cost_cents: number
          payment_fee_pct: number
          platform_fee_pct: number
          product_id: string
          retail_price_cents: number
          shipping_cost_cents: number
          supplier_cost_cents: number
          updated_at: string
          viability_grade: string | null
        }
        Insert: {
          break_even_cpa_cents?: number | null
          break_even_roas?: number | null
          break_even_units?: number | null
          calculated_at?: string
          calculator_version?: string
          content_cost_per_sale_cents?: number
          created_at?: string
          expected_return_rate_pct?: number
          gross_margin_cents?: number | null
          gross_margin_pct?: number | null
          id?: string
          net_margin_cents?: number | null
          net_margin_pct?: number | null
          packaging_cost_cents?: number
          payment_fee_pct?: number
          platform_fee_pct?: number
          product_id: string
          retail_price_cents: number
          shipping_cost_cents?: number
          supplier_cost_cents: number
          updated_at?: string
          viability_grade?: string | null
        }
        Update: {
          break_even_cpa_cents?: number | null
          break_even_roas?: number | null
          break_even_units?: number | null
          calculated_at?: string
          calculator_version?: string
          content_cost_per_sale_cents?: number
          created_at?: string
          expected_return_rate_pct?: number
          gross_margin_cents?: number | null
          gross_margin_pct?: number | null
          id?: string
          net_margin_cents?: number | null
          net_margin_pct?: number | null
          packaging_cost_cents?: number
          payment_fee_pct?: number
          platform_fee_pct?: number
          product_id?: string
          retail_price_cents?: number
          shipping_cost_cents?: number
          supplier_cost_cents?: number
          updated_at?: string
          viability_grade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_unit_economics_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          canonical_name: string | null
          category: string | null
          created_at: string
          discovered_via: string
          distinctive_attributes: string[] | null
          estimated_margin_pct: number | null
          excluded_variants: string[] | null
          id: string
          identity_confidence: number | null
          image_url: string | null
          marketing_plan: Json | null
          name: string
          notes: string | null
          plan_generated_at: string | null
          plan_status: string
          plan_version: number
          preferred_supplier_id: string | null
          price_cents: number | null
          readiness_score: number | null
          readiness_state: string | null
          retail_anchor_price_cents: number | null
          shipping_days: number | null
          short_description: string | null
          source_url: string | null
          status: string
          subcategory: string | null
          supplier_price_cents: number | null
          supplier_url: string | null
          synonyms: string[] | null
          updated_at: string
        }
        Insert: {
          canonical_name?: string | null
          category?: string | null
          created_at?: string
          discovered_via?: string
          distinctive_attributes?: string[] | null
          estimated_margin_pct?: number | null
          excluded_variants?: string[] | null
          id?: string
          identity_confidence?: number | null
          image_url?: string | null
          marketing_plan?: Json | null
          name: string
          notes?: string | null
          plan_generated_at?: string | null
          plan_status?: string
          plan_version?: number
          preferred_supplier_id?: string | null
          price_cents?: number | null
          readiness_score?: number | null
          readiness_state?: string | null
          retail_anchor_price_cents?: number | null
          shipping_days?: number | null
          short_description?: string | null
          source_url?: string | null
          status?: string
          subcategory?: string | null
          supplier_price_cents?: number | null
          supplier_url?: string | null
          synonyms?: string[] | null
          updated_at?: string
        }
        Update: {
          canonical_name?: string | null
          category?: string | null
          created_at?: string
          discovered_via?: string
          distinctive_attributes?: string[] | null
          estimated_margin_pct?: number | null
          excluded_variants?: string[] | null
          id?: string
          identity_confidence?: number | null
          image_url?: string | null
          marketing_plan?: Json | null
          name?: string
          notes?: string | null
          plan_generated_at?: string | null
          plan_status?: string
          plan_version?: number
          preferred_supplier_id?: string | null
          price_cents?: number | null
          readiness_score?: number | null
          readiness_state?: string | null
          retail_anchor_price_cents?: number | null
          shipping_days?: number | null
          short_description?: string | null
          source_url?: string | null
          status?: string
          subcategory?: string | null
          supplier_price_cents?: number | null
          supplier_url?: string | null
          synonyms?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_products_preferred_supplier"
            columns: ["preferred_supplier_id"]
            isOneToOne: false
            referencedRelation: "product_suppliers"
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
      prompt_experiments: {
        Row: {
          account_id: string | null
          created_at: string
          family: string
          generation_round: number
          id: string
          input_context: Json
          model: string | null
          output_summary: Json
          parent_experiment_id: string | null
          platform: string | null
          prompt_text: string
          prompt_variables: Json
          provider: string | null
          script_run_id: string | null
          stage: string
          status: string
          story_job_id: string | null
          template_id: string | null
          updated_at: string
          vertical: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          family: string
          generation_round?: number
          id?: string
          input_context?: Json
          model?: string | null
          output_summary?: Json
          parent_experiment_id?: string | null
          platform?: string | null
          prompt_text: string
          prompt_variables?: Json
          provider?: string | null
          script_run_id?: string | null
          stage: string
          status?: string
          story_job_id?: string | null
          template_id?: string | null
          updated_at?: string
          vertical?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string
          family?: string
          generation_round?: number
          id?: string
          input_context?: Json
          model?: string | null
          output_summary?: Json
          parent_experiment_id?: string | null
          platform?: string | null
          prompt_text?: string
          prompt_variables?: Json
          provider?: string | null
          script_run_id?: string | null
          stage?: string
          status?: string
          story_job_id?: string | null
          template_id?: string | null
          updated_at?: string
          vertical?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prompt_experiments_parent_experiment_id_fkey"
            columns: ["parent_experiment_id"]
            isOneToOne: false
            referencedRelation: "prompt_experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_experiments_script_run_id_fkey"
            columns: ["script_run_id"]
            isOneToOne: false
            referencedRelation: "script_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_experiments_story_job_id_fkey"
            columns: ["story_job_id"]
            isOneToOne: false
            referencedRelation: "story_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_experiments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "prompt_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_family_stats: {
        Row: {
          approval_rate: number | null
          avg_human_score: number | null
          avg_output_score: number | null
          avg_performance_score: number | null
          avg_preflight_score: number | null
          created_at: string
          family: string
          fatigue_score: number | null
          hard_fail_rate: number | null
          id: string
          last_used_at: string | null
          platform: string | null
          promoted: boolean
          provider: string | null
          rejection_rate: number | null
          retired: boolean
          sample_size: number
          stage: string
          updated_at: string
          vertical: string | null
        }
        Insert: {
          approval_rate?: number | null
          avg_human_score?: number | null
          avg_output_score?: number | null
          avg_performance_score?: number | null
          avg_preflight_score?: number | null
          created_at?: string
          family: string
          fatigue_score?: number | null
          hard_fail_rate?: number | null
          id?: string
          last_used_at?: string | null
          platform?: string | null
          promoted?: boolean
          provider?: string | null
          rejection_rate?: number | null
          retired?: boolean
          sample_size?: number
          stage: string
          updated_at?: string
          vertical?: string | null
        }
        Update: {
          approval_rate?: number | null
          avg_human_score?: number | null
          avg_output_score?: number | null
          avg_performance_score?: number | null
          avg_preflight_score?: number | null
          created_at?: string
          family?: string
          fatigue_score?: number | null
          hard_fail_rate?: number | null
          id?: string
          last_used_at?: string | null
          platform?: string | null
          promoted?: boolean
          provider?: string | null
          rejection_rate?: number | null
          retired?: boolean
          sample_size?: number
          stage?: string
          updated_at?: string
          vertical?: string | null
        }
        Relationships: []
      }
      prompt_learnings: {
        Row: {
          average_rating: number | null
          avoid_pattern: boolean
          created_at: string
          example_prompts: string[] | null
          failed_uses: number
          id: string
          last_failure_at: string | null
          last_success_at: string | null
          learning_source: string | null
          pattern_type: string
          pattern_value: string
          provider: string
          successful_uses: number
          total_uses: number
          updated_at: string
        }
        Insert: {
          average_rating?: number | null
          avoid_pattern?: boolean
          created_at?: string
          example_prompts?: string[] | null
          failed_uses?: number
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          learning_source?: string | null
          pattern_type: string
          pattern_value: string
          provider: string
          successful_uses?: number
          total_uses?: number
          updated_at?: string
        }
        Update: {
          average_rating?: number | null
          avoid_pattern?: boolean
          created_at?: string
          example_prompts?: string[] | null
          failed_uses?: number
          id?: string
          last_failure_at?: string | null
          last_success_at?: string | null
          learning_source?: string | null
          pattern_type?: string
          pattern_value?: string
          provider?: string
          successful_uses?: number
          total_uses?: number
          updated_at?: string
        }
        Relationships: []
      }
      prompt_outcomes: {
        Row: {
          avg_watch_time: number | null
          comments: number | null
          conversions: number | null
          created_at: string
          ctr: number | null
          experiment_id: string
          external_post_id: string | null
          id: string
          impressions: number | null
          likes: number | null
          outcome_score: number | null
          platform: string | null
          revenue: number | null
          saves: number | null
          shares: number | null
          story_job_id: string | null
          updated_at: string
          views: number | null
          watch_15s_rate: number | null
          watch_3s_rate: number | null
        }
        Insert: {
          avg_watch_time?: number | null
          comments?: number | null
          conversions?: number | null
          created_at?: string
          ctr?: number | null
          experiment_id: string
          external_post_id?: string | null
          id?: string
          impressions?: number | null
          likes?: number | null
          outcome_score?: number | null
          platform?: string | null
          revenue?: number | null
          saves?: number | null
          shares?: number | null
          story_job_id?: string | null
          updated_at?: string
          views?: number | null
          watch_15s_rate?: number | null
          watch_3s_rate?: number | null
        }
        Update: {
          avg_watch_time?: number | null
          comments?: number | null
          conversions?: number | null
          created_at?: string
          ctr?: number | null
          experiment_id?: string
          external_post_id?: string | null
          id?: string
          impressions?: number | null
          likes?: number | null
          outcome_score?: number | null
          platform?: string | null
          revenue?: number | null
          saves?: number | null
          shares?: number | null
          story_job_id?: string | null
          updated_at?: string
          views?: number | null
          watch_15s_rate?: number | null
          watch_3s_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prompt_outcomes_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "prompt_experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_outcomes_story_job_id_fkey"
            columns: ["story_job_id"]
            isOneToOne: false
            referencedRelation: "story_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_scores: {
        Row: {
          clarity: number | null
          coherence: number | null
          confidence: number | null
          continuity: number | null
          created_at: string
          experiment_id: string
          hard_fail: boolean
          hook_strength: number | null
          id: string
          notes: string | null
          novelty: number | null
          overall_score: number | null
          pacing: number | null
          postability: number | null
          risk_score: number | null
          score_layer: string
          score_payload: Json
          scored_by: string
          specificity: number | null
          visuality: number | null
        }
        Insert: {
          clarity?: number | null
          coherence?: number | null
          confidence?: number | null
          continuity?: number | null
          created_at?: string
          experiment_id: string
          hard_fail?: boolean
          hook_strength?: number | null
          id?: string
          notes?: string | null
          novelty?: number | null
          overall_score?: number | null
          pacing?: number | null
          postability?: number | null
          risk_score?: number | null
          score_layer: string
          score_payload?: Json
          scored_by?: string
          specificity?: number | null
          visuality?: number | null
        }
        Update: {
          clarity?: number | null
          coherence?: number | null
          confidence?: number | null
          continuity?: number | null
          created_at?: string
          experiment_id?: string
          hard_fail?: boolean
          hook_strength?: number | null
          id?: string
          notes?: string | null
          novelty?: number | null
          overall_score?: number | null
          pacing?: number | null
          postability?: number | null
          risk_score?: number | null
          score_layer?: string
          score_payload?: Json
          scored_by?: string
          specificity?: number | null
          visuality?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prompt_scores_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "prompt_experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_templates: {
        Row: {
          created_at: string
          description: string | null
          family: string
          id: string
          is_active: boolean
          name: string
          platforms: string[]
          scoring_weights: Json
          stage: string
          system_instructions: string | null
          template_text: string
          updated_at: string
          variables_schema: Json
          version: number
          verticals: string[]
        }
        Insert: {
          created_at?: string
          description?: string | null
          family: string
          id?: string
          is_active?: boolean
          name: string
          platforms?: string[]
          scoring_weights?: Json
          stage: string
          system_instructions?: string | null
          template_text: string
          updated_at?: string
          variables_schema?: Json
          version?: number
          verticals?: string[]
        }
        Update: {
          created_at?: string
          description?: string | null
          family?: string
          id?: string
          is_active?: boolean
          name?: string
          platforms?: string[]
          scoring_weights?: Json
          stage?: string
          system_instructions?: string | null
          template_text?: string
          updated_at?: string
          variables_schema?: Json
          version?: number
          verticals?: string[]
        }
        Relationships: []
      }
      provider_cluster_stats: {
        Row: {
          avg_confidence: number | null
          avg_win_delta: number | null
          cluster_key: string
          created_at: string
          id: string
          last_updated_at: string
          losses: number
          provider: string
          ties: number
          total_comparisons: number
          wins: number
        }
        Insert: {
          avg_confidence?: number | null
          avg_win_delta?: number | null
          cluster_key: string
          created_at?: string
          id?: string
          last_updated_at?: string
          losses?: number
          provider: string
          ties?: number
          total_comparisons?: number
          wins?: number
        }
        Update: {
          avg_confidence?: number | null
          avg_win_delta?: number | null
          cluster_key?: string
          created_at?: string
          id?: string
          last_updated_at?: string
          losses?: number
          provider?: string
          ties?: number
          total_comparisons?: number
          wins?: number
        }
        Relationships: []
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
      routing_tag_allowlist: {
        Row: {
          added_at: string
          added_by: string | null
          note: string | null
          source: string
          tag: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          note?: string | null
          source?: string
          tag: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          note?: string | null
          source?: string
          tag?: string
        }
        Relationships: []
      }
      scrape_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error: string | null
          extracted_json: Json | null
          extraction_duration_ms: number | null
          fetch_duration_ms: number | null
          fetch_method: string | null
          id: string
          raw_html: string | null
          raw_text: string | null
          source_type: string
          status: string
          url: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          extracted_json?: Json | null
          extraction_duration_ms?: number | null
          fetch_duration_ms?: number | null
          fetch_method?: string | null
          id?: string
          raw_html?: string | null
          raw_text?: string | null
          source_type?: string
          status?: string
          url: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error?: string | null
          extracted_json?: Json | null
          extraction_duration_ms?: number | null
          fetch_duration_ms?: number | null
          fetch_method?: string | null
          id?: string
          raw_html?: string | null
          raw_text?: string | null
          source_type?: string
          status?: string
          url?: string
        }
        Relationships: []
      }
      scraped_insights: {
        Row: {
          content_format: string | null
          created_at: string
          emotional_triggers: string[] | null
          hook_patterns: string[] | null
          id: string
          key_points: string[] | null
          raw_extraction: Json | null
          relevance_tags: string[] | null
          scrape_job_id: string
          source_type: string
          source_url: string
          title: string | null
          topics: string[] | null
          viral_score: number | null
          visual_style: string | null
        }
        Insert: {
          content_format?: string | null
          created_at?: string
          emotional_triggers?: string[] | null
          hook_patterns?: string[] | null
          id?: string
          key_points?: string[] | null
          raw_extraction?: Json | null
          relevance_tags?: string[] | null
          scrape_job_id: string
          source_type: string
          source_url: string
          title?: string | null
          topics?: string[] | null
          viral_score?: number | null
          visual_style?: string | null
        }
        Update: {
          content_format?: string | null
          created_at?: string
          emotional_triggers?: string[] | null
          hook_patterns?: string[] | null
          id?: string
          key_points?: string[] | null
          raw_extraction?: Json | null
          relevance_tags?: string[] | null
          scrape_job_id?: string
          source_type?: string
          source_url?: string
          title?: string | null
          topics?: string[] | null
          viral_score?: number | null
          visual_style?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scraped_insights_scrape_job_id_fkey"
            columns: ["scrape_job_id"]
            isOneToOne: false
            referencedRelation: "scrape_jobs"
            referencedColumns: ["id"]
          },
        ]
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
          assembled_at: string | null
          assembled_meta: Json | null
          assembled_status: string | null
          assembled_video_url: string | null
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
          voiceover_audio_format: string | null
          voiceover_audio_url: string | null
          voiceover_generated_at: string | null
          voiceover_hash: string | null
          voiceover_instructions: string | null
          voiceover_voice: string | null
        }
        Insert: {
          account_id: string
          assembled_at?: string | null
          assembled_meta?: Json | null
          assembled_status?: string | null
          assembled_video_url?: string | null
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
          voiceover_audio_format?: string | null
          voiceover_audio_url?: string | null
          voiceover_generated_at?: string | null
          voiceover_hash?: string | null
          voiceover_instructions?: string | null
          voiceover_voice?: string | null
        }
        Update: {
          account_id?: string
          assembled_at?: string | null
          assembled_meta?: Json | null
          assembled_status?: string | null
          assembled_video_url?: string | null
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
          voiceover_audio_format?: string | null
          voiceover_audio_url?: string | null
          voiceover_generated_at?: string | null
          voiceover_hash?: string | null
          voiceover_instructions?: string | null
          voiceover_voice?: string | null
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
      story_analysis: {
        Row: {
          analyzed_at: string
          analyzer_version: string
          character_continuity: number | null
          created_at: string
          environment_consistency: number | null
          failure_patterns: string[] | null
          id: string
          motion_logic: number | null
          overall_flow_score: number | null
          prompt_execution: number | null
          raw: Json | null
          recommendations: string[] | null
          story_job_id: string
          vlm_raw_text: string | null
          weak_scenes: number[] | null
        }
        Insert: {
          analyzed_at?: string
          analyzer_version?: string
          character_continuity?: number | null
          created_at?: string
          environment_consistency?: number | null
          failure_patterns?: string[] | null
          id?: string
          motion_logic?: number | null
          overall_flow_score?: number | null
          prompt_execution?: number | null
          raw?: Json | null
          recommendations?: string[] | null
          story_job_id: string
          vlm_raw_text?: string | null
          weak_scenes?: number[] | null
        }
        Update: {
          analyzed_at?: string
          analyzer_version?: string
          character_continuity?: number | null
          created_at?: string
          environment_consistency?: number | null
          failure_patterns?: string[] | null
          id?: string
          motion_logic?: number | null
          overall_flow_score?: number | null
          prompt_execution?: number | null
          raw?: Json | null
          recommendations?: string[] | null
          story_job_id?: string
          vlm_raw_text?: string | null
          weak_scenes?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "story_analysis_story_job_id_fkey"
            columns: ["story_job_id"]
            isOneToOne: true
            referencedRelation: "story_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      story_engine_debug_runs: {
        Row: {
          account_id: string | null
          created_at: string
          debug_tag: string | null
          id: string
          job_id: string | null
          payload: Json
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          debug_tag?: string | null
          id?: string
          job_id?: string | null
          payload?: Json
        }
        Update: {
          account_id?: string | null
          created_at?: string
          debug_tag?: string | null
          id?: string
          job_id?: string | null
          payload?: Json
        }
        Relationships: []
      }
      story_jobs: {
        Row: {
          account_id: string
          active_voiceover_id: string | null
          assembled_at: string | null
          assembled_meta: Json | null
          assembled_status: string | null
          assembled_video_url: string | null
          completed_clips: number | null
          continuity_anchors: Json | null
          continuity_score: number | null
          created_at: string
          hook_experiment_id: string | null
          id: string
          product_id: string | null
          review_status: string
          script_experiment_id: string | null
          status: string
          story_type: string
          storyboard_json: Json | null
          title: string | null
          topic_experiment_id: string | null
          total_clips: number | null
          updated_at: string
          visual_experiment_id: string | null
          weakest_clip_id: string | null
        }
        Insert: {
          account_id: string
          active_voiceover_id?: string | null
          assembled_at?: string | null
          assembled_meta?: Json | null
          assembled_status?: string | null
          assembled_video_url?: string | null
          completed_clips?: number | null
          continuity_anchors?: Json | null
          continuity_score?: number | null
          created_at?: string
          hook_experiment_id?: string | null
          id?: string
          product_id?: string | null
          review_status?: string
          script_experiment_id?: string | null
          status?: string
          story_type?: string
          storyboard_json?: Json | null
          title?: string | null
          topic_experiment_id?: string | null
          total_clips?: number | null
          updated_at?: string
          visual_experiment_id?: string | null
          weakest_clip_id?: string | null
        }
        Update: {
          account_id?: string
          active_voiceover_id?: string | null
          assembled_at?: string | null
          assembled_meta?: Json | null
          assembled_status?: string | null
          assembled_video_url?: string | null
          completed_clips?: number | null
          continuity_anchors?: Json | null
          continuity_score?: number | null
          created_at?: string
          hook_experiment_id?: string | null
          id?: string
          product_id?: string | null
          review_status?: string
          script_experiment_id?: string | null
          status?: string
          story_type?: string
          storyboard_json?: Json | null
          title?: string | null
          topic_experiment_id?: string | null
          total_clips?: number | null
          updated_at?: string
          visual_experiment_id?: string | null
          weakest_clip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "story_jobs_active_voiceover_id_fkey"
            columns: ["active_voiceover_id"]
            isOneToOne: false
            referencedRelation: "story_voiceovers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_jobs_hook_experiment_id_fkey"
            columns: ["hook_experiment_id"]
            isOneToOne: false
            referencedRelation: "prompt_experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_jobs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_jobs_script_experiment_id_fkey"
            columns: ["script_experiment_id"]
            isOneToOne: false
            referencedRelation: "prompt_experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_jobs_topic_experiment_id_fkey"
            columns: ["topic_experiment_id"]
            isOneToOne: false
            referencedRelation: "prompt_experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_jobs_visual_experiment_id_fkey"
            columns: ["visual_experiment_id"]
            isOneToOne: false
            referencedRelation: "prompt_experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      story_voiceovers: {
        Row: {
          actual_timing: Json | null
          alignment_debug: Json | null
          alignment_ok: boolean | null
          audio_format: string | null
          audio_url: string | null
          compiled_script: string | null
          created_at: string
          error: string | null
          has_word_timestamps: boolean | null
          id: string
          is_active: boolean
          predicted_timing: Json | null
          provider: string
          provider_request_id: string | null
          raw_narration: string
          scene_segments: Json | null
          ssml_content: string | null
          status: string
          story_job_id: string
          total_duration_ms: number | null
          updated_at: string
          version: number
          voice_id: string
          voice_name: string | null
          voice_settings: Json | null
        }
        Insert: {
          actual_timing?: Json | null
          alignment_debug?: Json | null
          alignment_ok?: boolean | null
          audio_format?: string | null
          audio_url?: string | null
          compiled_script?: string | null
          created_at?: string
          error?: string | null
          has_word_timestamps?: boolean | null
          id?: string
          is_active?: boolean
          predicted_timing?: Json | null
          provider?: string
          provider_request_id?: string | null
          raw_narration: string
          scene_segments?: Json | null
          ssml_content?: string | null
          status?: string
          story_job_id: string
          total_duration_ms?: number | null
          updated_at?: string
          version?: number
          voice_id: string
          voice_name?: string | null
          voice_settings?: Json | null
        }
        Update: {
          actual_timing?: Json | null
          alignment_debug?: Json | null
          alignment_ok?: boolean | null
          audio_format?: string | null
          audio_url?: string | null
          compiled_script?: string | null
          created_at?: string
          error?: string | null
          has_word_timestamps?: boolean | null
          id?: string
          is_active?: boolean
          predicted_timing?: Json | null
          provider?: string
          provider_request_id?: string | null
          raw_narration?: string
          scene_segments?: Json | null
          ssml_content?: string | null
          status?: string
          story_job_id?: string
          total_duration_ms?: number | null
          updated_at?: string
          version?: number
          voice_id?: string
          voice_name?: string | null
          voice_settings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "story_voiceovers_story_job_id_fkey"
            columns: ["story_job_id"]
            isOneToOne: false
            referencedRelation: "story_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_timelines: {
        Row: {
          created_at: string
          id: string
          label: string | null
          published_at: string | null
          script_run_id: string
          timeline_json: Json
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          published_at?: string | null
          script_run_id: string
          timeline_json?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          published_at?: string | null
          script_run_id?: string
          timeline_json?: Json
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "studio_timelines_script_run_id_fkey"
            columns: ["script_run_id"]
            isOneToOne: false
            referencedRelation: "script_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      system_task_runs: {
        Row: {
          created_at: string
          detail: Json | null
          id: string
          status: string
          task: string
        }
        Insert: {
          created_at?: string
          detail?: Json | null
          id?: string
          status: string
          task: string
        }
        Update: {
          created_at?: string
          detail?: Json | null
          id?: string
          status?: string
          task?: string
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
      video_compare_queue: {
        Row: {
          cluster_key: string
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          job_a: string
          job_b: string
          priority: number
          prompt_hash: string | null
          reason: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          cluster_key: string
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          job_a: string
          job_b: string
          priority?: number
          prompt_hash?: string | null
          reason?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          cluster_key?: string
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          job_a?: string
          job_b?: string
          priority?: number
          prompt_hash?: string | null
          reason?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_compare_queue_job_a_fkey"
            columns: ["job_a"]
            isOneToOne: false
            referencedRelation: "video_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_compare_queue_job_b_fkey"
            columns: ["job_b"]
            isOneToOne: false
            referencedRelation: "video_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      video_comparisons: {
        Row: {
          confidence: number
          created_at: string
          deltas: Json
          id: string
          job_a: string
          job_b: string
          job_max: string
          job_min: string
          key_defects_a: string[] | null
          key_defects_b: string[] | null
          prompt_hash: string | null
          provider_a: string
          provider_b: string
          reasons: string[]
          winner: string
          winner_job: string | null
        }
        Insert: {
          confidence: number
          created_at?: string
          deltas?: Json
          id?: string
          job_a: string
          job_b: string
          job_max: string
          job_min: string
          key_defects_a?: string[] | null
          key_defects_b?: string[] | null
          prompt_hash?: string | null
          provider_a: string
          provider_b: string
          reasons?: string[]
          winner: string
          winner_job?: string | null
        }
        Update: {
          confidence?: number
          created_at?: string
          deltas?: Json
          id?: string
          job_a?: string
          job_b?: string
          job_max?: string
          job_min?: string
          key_defects_a?: string[] | null
          key_defects_b?: string[] | null
          prompt_hash?: string | null
          provider_a?: string
          provider_b?: string
          reasons?: string[]
          winner?: string
          winner_job?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_comparisons_job_a_fkey"
            columns: ["job_a"]
            isOneToOne: false
            referencedRelation: "video_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_comparisons_job_b_fkey"
            columns: ["job_b"]
            isOneToOne: false
            referencedRelation: "video_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      video_conversions: {
        Row: {
          ad_spend_cents: number | null
          add_to_carts: number | null
          clicks: number | null
          conversion_rate: number | null
          created_at: string
          ctr: number | null
          date: string
          external_post_id: string | null
          id: string
          impressions: number | null
          platform: string
          product_id: string | null
          purchases: number | null
          revenue_cents: number | null
          roas: number | null
          story_job_id: string | null
          updated_at: string
        }
        Insert: {
          ad_spend_cents?: number | null
          add_to_carts?: number | null
          clicks?: number | null
          conversion_rate?: number | null
          created_at?: string
          ctr?: number | null
          date: string
          external_post_id?: string | null
          id?: string
          impressions?: number | null
          platform?: string
          product_id?: string | null
          purchases?: number | null
          revenue_cents?: number | null
          roas?: number | null
          story_job_id?: string | null
          updated_at?: string
        }
        Update: {
          ad_spend_cents?: number | null
          add_to_carts?: number | null
          clicks?: number | null
          conversion_rate?: number | null
          created_at?: string
          ctr?: number | null
          date?: string
          external_post_id?: string | null
          id?: string
          impressions?: number | null
          platform?: string
          product_id?: string | null
          purchases?: number | null
          revenue_cents?: number | null
          roas?: number | null
          story_job_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_conversions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_conversions_story_job_id_fkey"
            columns: ["story_job_id"]
            isOneToOne: false
            referencedRelation: "story_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      video_jobs: {
        Row: {
          accuracy_notes: string | null
          accuracy_rating: number | null
          auto_artifact_flags: string[] | null
          auto_best_use: string | null
          auto_cinematic_score: number | null
          auto_confidence: number | null
          auto_defects: Json | null
          auto_hard_fail: boolean | null
          auto_match_score: number | null
          auto_motion_score: number | null
          auto_overall_score: number | null
          auto_quality_score: number | null
          auto_rated_at: string | null
          auto_rater_version: string | null
          auto_reasons: string[] | null
          auto_regen_recommended: boolean | null
          auto_routing_tags: string[] | null
          continuity_notes: string[] | null
          continuity_score: number | null
          created_at: string
          enriched_prompt: string | null
          error: string | null
          human_match_rating: number | null
          human_preference_rating: number | null
          human_rating_override: boolean | null
          id: string
          is_primary: boolean
          is_serendipity: boolean
          openai_status: string | null
          openai_video_id: string | null
          original_prompt: string | null
          output_url: string | null
          progress: number | null
          provider: string
          rated_at: string | null
          rated_by: string | null
          raw_routing_tags: string[] | null
          request_id: string | null
          routed_provider: string | null
          routing_cluster_key: string | null
          routing_confidence: number | null
          routing_reason: string | null
          routing_source: string | null
          scene_id: string | null
          script_run_id: string
          sequence_index: number | null
          settings: Json | null
          spritesheet_url: string | null
          status: string
          story_job_id: string | null
          style_hints: string | null
          thumbnail_height: number | null
          thumbnail_url: string | null
          thumbnail_width: number | null
          updated_at: string
          visual_experiment_id: string | null
        }
        Insert: {
          accuracy_notes?: string | null
          accuracy_rating?: number | null
          auto_artifact_flags?: string[] | null
          auto_best_use?: string | null
          auto_cinematic_score?: number | null
          auto_confidence?: number | null
          auto_defects?: Json | null
          auto_hard_fail?: boolean | null
          auto_match_score?: number | null
          auto_motion_score?: number | null
          auto_overall_score?: number | null
          auto_quality_score?: number | null
          auto_rated_at?: string | null
          auto_rater_version?: string | null
          auto_reasons?: string[] | null
          auto_regen_recommended?: boolean | null
          auto_routing_tags?: string[] | null
          continuity_notes?: string[] | null
          continuity_score?: number | null
          created_at?: string
          enriched_prompt?: string | null
          error?: string | null
          human_match_rating?: number | null
          human_preference_rating?: number | null
          human_rating_override?: boolean | null
          id?: string
          is_primary?: boolean
          is_serendipity?: boolean
          openai_status?: string | null
          openai_video_id?: string | null
          original_prompt?: string | null
          output_url?: string | null
          progress?: number | null
          provider?: string
          rated_at?: string | null
          rated_by?: string | null
          raw_routing_tags?: string[] | null
          request_id?: string | null
          routed_provider?: string | null
          routing_cluster_key?: string | null
          routing_confidence?: number | null
          routing_reason?: string | null
          routing_source?: string | null
          scene_id?: string | null
          script_run_id: string
          sequence_index?: number | null
          settings?: Json | null
          spritesheet_url?: string | null
          status?: string
          story_job_id?: string | null
          style_hints?: string | null
          thumbnail_height?: number | null
          thumbnail_url?: string | null
          thumbnail_width?: number | null
          updated_at?: string
          visual_experiment_id?: string | null
        }
        Update: {
          accuracy_notes?: string | null
          accuracy_rating?: number | null
          auto_artifact_flags?: string[] | null
          auto_best_use?: string | null
          auto_cinematic_score?: number | null
          auto_confidence?: number | null
          auto_defects?: Json | null
          auto_hard_fail?: boolean | null
          auto_match_score?: number | null
          auto_motion_score?: number | null
          auto_overall_score?: number | null
          auto_quality_score?: number | null
          auto_rated_at?: string | null
          auto_rater_version?: string | null
          auto_reasons?: string[] | null
          auto_regen_recommended?: boolean | null
          auto_routing_tags?: string[] | null
          continuity_notes?: string[] | null
          continuity_score?: number | null
          created_at?: string
          enriched_prompt?: string | null
          error?: string | null
          human_match_rating?: number | null
          human_preference_rating?: number | null
          human_rating_override?: boolean | null
          id?: string
          is_primary?: boolean
          is_serendipity?: boolean
          openai_status?: string | null
          openai_video_id?: string | null
          original_prompt?: string | null
          output_url?: string | null
          progress?: number | null
          provider?: string
          rated_at?: string | null
          rated_by?: string | null
          raw_routing_tags?: string[] | null
          request_id?: string | null
          routed_provider?: string | null
          routing_cluster_key?: string | null
          routing_confidence?: number | null
          routing_reason?: string | null
          routing_source?: string | null
          scene_id?: string | null
          script_run_id?: string
          sequence_index?: number | null
          settings?: Json | null
          spritesheet_url?: string | null
          status?: string
          story_job_id?: string | null
          style_hints?: string | null
          thumbnail_height?: number | null
          thumbnail_url?: string | null
          thumbnail_width?: number | null
          updated_at?: string
          visual_experiment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_jobs_script_run_id_fkey"
            columns: ["script_run_id"]
            isOneToOne: false
            referencedRelation: "script_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_jobs_story_job_id_fkey"
            columns: ["story_job_id"]
            isOneToOne: false
            referencedRelation: "story_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_jobs_visual_experiment_id_fkey"
            columns: ["visual_experiment_id"]
            isOneToOne: false
            referencedRelation: "prompt_experiments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_compare_queue: {
        Args: { p_limit: number }
        Returns: {
          cluster_key: string
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          job_a: string
          job_b: string
          priority: number
          prompt_hash: string | null
          reason: string | null
          started_at: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "video_compare_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_auto_promote_candidates_from_raw: {
        Args: {
          p_days?: number
          p_max_candidates?: number
          p_max_rows?: number
          p_min_count?: number
          p_min_providers?: number
        }
        Returns: {
          n: number
          providers: number
          raw_tag: string
        }[]
      }
      get_compare_queue_health: {
        Args: never
        Returns: {
          done_count: number
          failed_count: number
          oldest_pending_age_seconds: number
          pending_count: number
          running_count: number
          stale_running_count: number
        }[]
      }
      get_cron_auth_failures: { Args: never; Returns: Json }
      get_cron_status: {
        Args: never
        Returns: {
          active: boolean
          jobname: string
          last_end: string
          last_return_message: string
          last_start: string
          last_status: string
          schedule: string
        }[]
      }
      get_raw_routing_tag_coverage: {
        Args: { p_days?: number; p_max_rows?: number }
        Returns: Json
      }
      get_routing_allowlist_health: { Args: never; Returns: Json }
      get_routing_tag_coverage: {
        Args: { p_days?: number; p_max_rows?: number }
        Returns: Json
      }
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
      normalize_routing_tag: { Args: { p_tag: string }; Returns: string }
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
      update_provider_stats: {
        Args: {
          p_cluster_key: string
          p_confidence: number
          p_delta?: number
          p_provider_a: string
          p_provider_b: string
          p_winner: string
        }
        Returns: undefined
      }
    }
    Enums: {
      account_platform: "tiktok" | "instagram" | "youtube_shorts"
      account_status: "active" | "paused" | "warmup" | "flagged"
      app_role: "admin" | "qa" | "viewer"
      claim_policy_level: "standard" | "moderate" | "strict" | "medical"
      content_vertical:
        | "privacy"
        | "education"
        | "health"
        | "hyperlocal"
        | "ecommerce"
        | "gadgets"
        | "home"
        | "toys"
      cta_style: "soft" | "direct" | "hard_offer"
      delivery_format: "online" | "in_person" | "hybrid" | "self_paced"
      export_format: "pdf" | "json" | "docx"
      learning_style: "video" | "project" | "reading"
      monetization_mode: "app_first" | "product_first" | "hybrid"
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
      account_platform: ["tiktok", "instagram", "youtube_shorts"],
      account_status: ["active", "paused", "warmup", "flagged"],
      app_role: ["admin", "qa", "viewer"],
      claim_policy_level: ["standard", "moderate", "strict", "medical"],
      content_vertical: [
        "privacy",
        "education",
        "health",
        "hyperlocal",
        "ecommerce",
        "gadgets",
        "home",
        "toys",
      ],
      cta_style: ["soft", "direct", "hard_offer"],
      delivery_format: ["online", "in_person", "hybrid", "self_paced"],
      export_format: ["pdf", "json", "docx"],
      learning_style: ["video", "project", "reading"],
      monetization_mode: ["app_first", "product_first", "hybrid"],
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
