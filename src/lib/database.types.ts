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
      account_deletion_otps: {
        Row: {
          attempts: number
          code_hash: string
          expires_at: string
          request_id: string
          sent_at: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          expires_at: string
          request_id: string
          sent_at?: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          expires_at?: string
          request_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_deletion_otps_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "account_deletion_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      account_deletion_requests: {
        Row: {
          cancelled_at: string | null
          channel: string
          code_expires_at: string | null
          codes_sent: number
          completed_at: string | null
          confirmed_at: string | null
          id: string
          last_code_sent_at: string | null
          last_error: string | null
          requested_at: string
          scheduled_for: string | null
          status: string
          storage_cleaned_at: string | null
          storage_error: string | null
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          channel?: string
          code_expires_at?: string | null
          codes_sent?: number
          completed_at?: string | null
          confirmed_at?: string | null
          id?: string
          last_code_sent_at?: string | null
          last_error?: string | null
          requested_at?: string
          scheduled_for?: string | null
          status?: string
          storage_cleaned_at?: string | null
          storage_error?: string | null
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          channel?: string
          code_expires_at?: string | null
          codes_sent?: number
          completed_at?: string | null
          confirmed_at?: string | null
          id?: string
          last_code_sent_at?: string | null
          last_error?: string | null
          requested_at?: string
          scheduled_for?: string | null
          status?: string
          storage_cleaned_at?: string | null
          storage_error?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_deletion_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      account_manager_callbacks: {
        Row: {
          created_at: string
          handled_at: string | null
          handled_by: string | null
          id: string
          note: string | null
          preferred_date: string
          status: string
          time_window: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          note?: string | null
          preferred_date: string
          status?: string
          time_window: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          note?: string | null
          preferred_date?: string
          status?: string
          time_window?: string
          vendor_id?: string
        }
        Relationships: []
      }
      account_manager_messages: {
        Row: {
          author_id: string | null
          author_kind: string
          author_label: string
          body: string
          created_at: string
          id: string
          vendor_id: string
        }
        Insert: {
          author_id?: string | null
          author_kind: string
          author_label: string
          body: string
          created_at?: string
          id?: string
          vendor_id: string
        }
        Update: {
          author_id?: string | null
          author_kind?: string
          author_label?: string
          body?: string
          created_at?: string
          id?: string
          vendor_id?: string
        }
        Relationships: []
      }
      account_manager_notes: {
        Row: {
          author_id: string | null
          author_label: string
          body: string
          created_at: string
          id: string
          kind: string
          period: string | null
          rfq_id: string | null
          vendor_id: string
        }
        Insert: {
          author_id?: string | null
          author_label: string
          body: string
          created_at?: string
          id?: string
          kind: string
          period?: string | null
          rfq_id?: string | null
          vendor_id: string
        }
        Update: {
          author_id?: string | null
          author_label?: string
          body?: string
          created_at?: string
          id?: string
          kind?: string
          period?: string | null
          rfq_id?: string | null
          vendor_id?: string
        }
        Relationships: []
      }
      account_manager_threads: {
        Row: {
          created_at: string
          last_message_at: string | null
          last_staff_at: string | null
          last_vendor_at: string | null
          staff_read_at: string | null
          vendor_id: string
          vendor_read_at: string | null
        }
        Insert: {
          created_at?: string
          last_message_at?: string | null
          last_staff_at?: string | null
          last_vendor_at?: string | null
          staff_read_at?: string | null
          vendor_id: string
          vendor_read_at?: string | null
        }
        Update: {
          created_at?: string
          last_message_at?: string | null
          last_staff_at?: string | null
          last_vendor_at?: string | null
          staff_read_at?: string | null
          vendor_id?: string
          vendor_read_at?: string | null
        }
        Relationships: []
      }
      ad_orders: {
        Row: {
          amount: number
          created_at: string
          discount_code: string | null
          discount_paise: number
          discount_redemption_id: string | null
          order_id: string
          paid_at: string | null
          spec: Json
          status: string
          vendor_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          discount_code?: string | null
          discount_paise?: number
          discount_redemption_id?: string | null
          order_id: string
          paid_at?: string | null
          spec: Json
          status?: string
          vendor_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          discount_code?: string | null
          discount_paise?: number
          discount_redemption_id?: string | null
          order_id?: string
          paid_at?: string | null
          spec?: Json
          status?: string
          vendor_id?: string
        }
        Relationships: []
      }
      advertisements: {
        Row: {
          ad_order_id: string | null
          clicks: number
          created_at: string
          daily_budget: number | null
          ends_at: string | null
          id: string
          image_url: string | null
          impressions: number
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          placement: string | null
          product_id: string | null
          starts_at: string | null
          status: string
          target_categories: Json | null
          target_cities: Json | null
          target_countries: string[]
          target_states: string[]
          title: string
          vendor_id: string
        }
        Insert: {
          ad_order_id?: string | null
          clicks?: number
          created_at?: string
          daily_budget?: number | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          impressions?: number
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          placement?: string | null
          product_id?: string | null
          starts_at?: string | null
          status?: string
          target_categories?: Json | null
          target_cities?: Json | null
          target_countries?: string[]
          target_states?: string[]
          title: string
          vendor_id: string
        }
        Update: {
          ad_order_id?: string | null
          clicks?: number
          created_at?: string
          daily_budget?: number | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          impressions?: number
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          placement?: string | null
          product_id?: string | null
          starts_at?: string | null
          status?: string
          target_categories?: Json | null
          target_cities?: Json | null
          target_countries?: string[]
          target_states?: string[]
          title?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "advertisements_ad_order_id_fkey"
            columns: ["ad_order_id"]
            isOneToOne: false
            referencedRelation: "ad_orders"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "advertisements_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advertisements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advertisements_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      authors: {
        Row: {
          avatar_url: string | null
          created_at: string
          description: string | null
          entity_type: string
          id: string
          linkedin_url: string | null
          logo_url: string | null
          name: string
          role: string | null
          slug: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          description?: string | null
          entity_type: string
          id?: string
          linkedin_url?: string | null
          logo_url?: string | null
          name: string
          role?: string | null
          slug: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          description?: string | null
          entity_type?: string
          id?: string
          linkedin_url?: string | null
          logo_url?: string | null
          name?: string
          role?: string | null
          slug?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      blog_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          seo_description: string | null
          seo_title: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          author: string | null
          author_id: string | null
          blocks: Json | null
          body: string | null
          canonical_url: string | null
          category_id: string | null
          created_at: string
          excerpt: string | null
          hero_image: string | null
          hero_image_alt: string | null
          id: string
          is_featured: boolean
          noindex: boolean
          og_image: string | null
          published_at: string | null
          read_time: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          sort_order: number
          status: string
          tags: string[] | null
          thumbnail: string | null
          thumbnail_alt: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author?: string | null
          author_id?: string | null
          blocks?: Json | null
          body?: string | null
          canonical_url?: string | null
          category_id?: string | null
          created_at?: string
          excerpt?: string | null
          hero_image?: string | null
          hero_image_alt?: string | null
          id?: string
          is_featured?: boolean
          noindex?: boolean
          og_image?: string | null
          published_at?: string | null
          read_time?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          sort_order?: number
          status?: string
          tags?: string[] | null
          thumbnail?: string | null
          thumbnail_alt?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author?: string | null
          author_id?: string | null
          blocks?: Json | null
          body?: string | null
          canonical_url?: string | null
          category_id?: string | null
          created_at?: string
          excerpt?: string | null
          hero_image?: string | null
          hero_image_alt?: string | null
          id?: string
          is_featured?: boolean
          noindex?: boolean
          og_image?: string | null
          published_at?: string | null
          read_time?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          sort_order?: number
          status?: string
          tags?: string[] | null
          thumbnail?: string | null
          thumbnail_alt?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "blog_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_settings: {
        Row: {
          hero_cta_href: string | null
          hero_cta_label: string | null
          hero_enabled: boolean
          hero_eyebrow: string | null
          hero_image: string | null
          hero_image_alt: string | null
          hero_subtitle: string | null
          hero_title: string | null
          id: boolean
          updated_at: string
        }
        Insert: {
          hero_cta_href?: string | null
          hero_cta_label?: string | null
          hero_enabled?: boolean
          hero_eyebrow?: string | null
          hero_image?: string | null
          hero_image_alt?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: boolean
          updated_at?: string
        }
        Update: {
          hero_cta_href?: string | null
          hero_cta_label?: string | null
          hero_enabled?: boolean
          hero_eyebrow?: string | null
          hero_image?: string | null
          hero_image_alt?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      buyer_profiles: {
        Row: {
          business_city: string | null
          business_type: string | null
          city: string | null
          company: string | null
          country: string | null
          country_code: string | null
          created_at: string
          department: string | null
          display_name: string | null
          gstin: string | null
          id: string
          industry: string | null
          job_title: string | null
          notifications: Json | null
          pan: string | null
          postal_code: string | null
          preferred_categories: string[]
          regional: Json | null
          social: Json | null
          state: string | null
          state_code: string | null
          street: string | null
          website: string | null
        }
        Insert: {
          business_city?: string | null
          business_type?: string | null
          city?: string | null
          company?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          department?: string | null
          display_name?: string | null
          gstin?: string | null
          id: string
          industry?: string | null
          job_title?: string | null
          notifications?: Json | null
          pan?: string | null
          postal_code?: string | null
          preferred_categories?: string[]
          regional?: Json | null
          social?: Json | null
          state?: string | null
          state_code?: string | null
          street?: string | null
          website?: string | null
        }
        Update: {
          business_city?: string | null
          business_type?: string | null
          city?: string | null
          company?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          department?: string | null
          display_name?: string | null
          gstin?: string | null
          id?: string
          industry?: string | null
          job_title?: string | null
          notifications?: Json | null
          pan?: string | null
          postal_code?: string | null
          preferred_categories?: string[]
          regional?: Json | null
          social?: Json | null
          state?: string | null
          state_code?: string | null
          street?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "buyer_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buyer_profiles_state_code_fkey"
            columns: ["state_code"]
            isOneToOne: false
            referencedRelation: "india_states"
            referencedColumns: ["code"]
          },
        ]
      }
      calls: {
        Row: {
          buyer_id: string
          created_at: string
          direction: string
          id: string
          product_context: string | null
          vendor_id: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          direction?: string
          id?: string
          product_context?: string | null
          vendor_id: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          direction?: string
          id?: string
          product_context?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogues: {
        Row: {
          cover_url: string | null
          created_at: string
          description: string | null
          file_url: string | null
          id: string
          page_count: number | null
          status: Database["public"]["Enums"]["product_status"]
          title: string
          vendor_id: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          file_url?: string | null
          id?: string
          page_count?: number | null
          status?: Database["public"]["Enums"]["product_status"]
          title: string
          vendor_id: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          file_url?: string | null
          id?: string
          page_count?: number | null
          status?: Database["public"]["Enums"]["product_status"]
          title?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalogues_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          grp: string | null
          id: string
          name: string
          parent_id: string | null
        }
        Insert: {
          created_at?: string
          grp?: string | null
          id?: string
          name: string
          parent_id?: string | null
        }
        Update: {
          created_at?: string
          grp?: string | null
          id?: string
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_orders: {
        Row: {
          ad_id: string | null
          ad_order_id: string | null
          address_line: string | null
          area: string | null
          city: string | null
          contact_name: string | null
          contact_phone: string | null
          courier: string | null
          created_at: string
          delivered_at: string | null
          dispatched_at: string | null
          id: string
          postal_code: string | null
          printed_at: string | null
          purchased_at: string
          reference: string
          return_reason: string | null
          state: string | null
          status: string
          tracking_number: string | null
          updated_at: string
          vendor_id: string
          vendor_name: string | null
        }
        Insert: {
          ad_id?: string | null
          ad_order_id?: string | null
          address_line?: string | null
          area?: string | null
          city?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          courier?: string | null
          created_at?: string
          delivered_at?: string | null
          dispatched_at?: string | null
          id?: string
          postal_code?: string | null
          printed_at?: string | null
          purchased_at?: string
          reference: string
          return_reason?: string | null
          state?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string
          vendor_id: string
          vendor_name?: string | null
        }
        Update: {
          ad_id?: string | null
          ad_order_id?: string | null
          address_line?: string | null
          area?: string | null
          city?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          courier?: string | null
          created_at?: string
          delivered_at?: string | null
          dispatched_at?: string | null
          id?: string
          postal_code?: string | null
          printed_at?: string | null
          purchased_at?: string
          reference?: string
          return_reason?: string | null
          state?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string
          vendor_id?: string
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificate_orders_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "advertisements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_consent: {
        Row: {
          changed_at: string
          channel: string
          opted_in: boolean
          profile_id: string
          source: string
        }
        Insert: {
          changed_at?: string
          channel: string
          opted_in: boolean
          profile_id: string
          source: string
        }
        Update: {
          changed_at?: string
          channel?: string
          opted_in?: boolean
          profile_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_consent_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          last_message: string | null
          last_message_at: string
          status: string
          user_a: string
          user_b: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message?: string | null
          last_message_at?: string
          status?: string
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message?: string | null
          last_message_at?: string
          status?: string
          user_a?: string
          user_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          aliases: string[]
          code: string
          name: string
          name_gu: string
          name_hi: string
        }
        Insert: {
          aliases?: string[]
          code: string
          name: string
          name_gu: string
          name_hi: string
        }
        Update: {
          aliases?: string[]
          code?: string
          name?: string
          name_gu?: string
          name_hi?: string
        }
        Relationships: []
      }
      csp_violations: {
        Row: {
          blocked: string
          directive: string
          disposition: string
          document_path: string
          first_seen: string
          hits: number
          id: number
          last_seen: string
          sample: string | null
          source: string
        }
        Insert: {
          blocked: string
          directive: string
          disposition?: string
          document_path: string
          first_seen?: string
          hits?: number
          id?: never
          last_seen?: string
          sample?: string | null
          source?: string
        }
        Update: {
          blocked?: string
          directive?: string
          disposition?: string
          document_path?: string
          first_seen?: string
          hits?: number
          id?: never
          last_seen?: string
          sample?: string | null
          source?: string
        }
        Relationships: []
      }
      embed_query_rate_limit: {
        Row: {
          caller: string
          count: number
          window_start: string
        }
        Insert: {
          caller: string
          count?: number
          window_start?: string
        }
        Update: {
          caller?: string
          count?: number
          window_start?: string
        }
        Relationships: []
      }
      embedding_pipeline_health_log: {
        Row: {
          checked_at: string
          products_missing: number | null
          queue_depth: number | null
          reason: string | null
          rfqs_missing: number | null
          status: string
          vault_secret_ok: boolean | null
          videos_missing: number | null
        }
        Insert: {
          checked_at?: string
          products_missing?: number | null
          queue_depth?: number | null
          reason?: string | null
          rfqs_missing?: number | null
          status: string
          vault_secret_ok?: boolean | null
          videos_missing?: number | null
        }
        Update: {
          checked_at?: string
          products_missing?: number | null
          queue_depth?: number | null
          reason?: string | null
          rfqs_missing?: number | null
          status?: string
          vault_secret_ok?: boolean | null
          videos_missing?: number | null
        }
        Relationships: []
      }
      engagement_events: {
        Row: {
          ad_id: string | null
          created_at: string
          cta_name: string | null
          event_type: string
          id: string
          product_id: string | null
          query_text: string | null
          session_id: string | null
          source: string | null
          vendor_id: string
          viewer_id: string | null
        }
        Insert: {
          ad_id?: string | null
          created_at?: string
          cta_name?: string | null
          event_type: string
          id?: string
          product_id?: string | null
          query_text?: string | null
          session_id?: string | null
          source?: string | null
          vendor_id: string
          viewer_id?: string | null
        }
        Update: {
          ad_id?: string | null
          created_at?: string
          cta_name?: string | null
          event_type?: string
          id?: string
          product_id?: string | null
          query_text?: string | null
          session_id?: string | null
          source?: string | null
          vendor_id?: string
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_events_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "advertisements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_events_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_events_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      faqs: {
        Row: {
          active: boolean
          answer: string
          category_label: string | null
          created_at: string
          created_by: string | null
          id: string
          position: number
          question: string
          surface: string
          translations: Json
          updated_at: string
        }
        Insert: {
          active?: boolean
          answer: string
          category_label?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          position?: number
          question: string
          surface: string
          translations?: Json
          updated_at?: string
        }
        Update: {
          active?: boolean
          answer?: string
          category_label?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          position?: number
          question?: string
          surface?: string
          translations?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "faqs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          base_currency: string
          rates: Json
          rates_date: string
          source: string
          updated_at: string
        }
        Insert: {
          base_currency?: string
          rates: Json
          rates_date: string
          source: string
          updated_at?: string
        }
        Update: {
          base_currency?: string
          rates?: Json
          rates_date?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      help_guides: {
        Row: {
          active: boolean
          audience: string
          body: Json
          created_at: string
          id: string
          position: number
          slug: string
          title: Json
          updated_at: string
          updated_by: string | null
          verified_at: string | null
        }
        Insert: {
          active?: boolean
          audience: string
          body: Json
          created_at?: string
          id?: string
          position?: number
          slug: string
          title: Json
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
        }
        Update: {
          active?: boolean
          audience?: string
          body?: Json
          created_at?: string
          id?: string
          position?: number
          slug?: string
          title?: Json
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      india_states: {
        Row: {
          aliases: string[]
          code: string
          gst_code: string
          name: string
          name_gu: string
          name_hi: string
        }
        Insert: {
          aliases?: string[]
          code: string
          gst_code: string
          name: string
          name_gu: string
          name_hi: string
        }
        Update: {
          aliases?: string[]
          code?: string
          gst_code?: string
          name?: string
          name_gu?: string
          name_hi?: string
        }
        Relationships: []
      }
      lead_alert_settings: {
        Row: {
          category_ids: string[] | null
          digest: boolean
          instant: boolean
          quiet_end: string | null
          quiet_start: string | null
          updated_at: string
          vendor_id: string
        }
        Insert: {
          category_ids?: string[] | null
          digest?: boolean
          instant?: boolean
          quiet_end?: string | null
          quiet_start?: string | null
          updated_at?: string
          vendor_id: string
        }
        Update: {
          category_ids?: string[] | null
          digest?: boolean
          instant?: boolean
          quiet_end?: string | null
          quiet_start?: string | null
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_alert_settings_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          id: string
          kind: string
          quote_id: string | null
          rfq_id: string | null
          sender_id: string
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          kind?: string
          quote_id?: string | null
          rfq_id?: string | null
          sender_id: string
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          kind?: string
          quote_id?: string | null
          rfq_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          conversation_id: string | null
          created_at: string
          id: string
          kind: string
          profile_id: string
          read: boolean
          title: string
        }
        Insert: {
          body?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind: string
          profile_id: string
          read?: boolean
          title: string
        }
        Update: {
          body?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          profile_id?: string
          read?: boolean
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pref_category_map: {
        Row: {
          category_id: string
          pref_id: string
        }
        Insert: {
          category_id: string
          pref_id: string
        }
        Update: {
          category_id?: string
          pref_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pref_category_map_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          created_at: string
          id: string
          position: number
          product_id: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number
          product_id: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          product_id?: string
          url?: string
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
      product_import_batches: {
        Row: {
          as_draft: boolean
          created: number
          created_at: string
          errors: Json
          failed: number
          file_name: string | null
          id: string
          total: number
          vendor_id: string
        }
        Insert: {
          as_draft?: boolean
          created?: number
          created_at?: string
          errors?: Json
          failed?: number
          file_name?: string | null
          id?: string
          total: number
          vendor_id: string
        }
        Update: {
          as_draft?: boolean
          created?: number
          created_at?: string
          errors?: Json
          failed?: number
          file_name?: string | null
          id?: string
          total?: number
          vendor_id?: string
        }
        Relationships: []
      }
      product_reviews: {
        Row: {
          body: string | null
          buyer_id: string
          created_at: string
          id: string
          photos: string[]
          product_id: string
          rating: number
          replied_at: string | null
          reply_body: string | null
          reviewer_name: string | null
          size_bought: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          buyer_id: string
          created_at?: string
          id?: string
          photos?: string[]
          product_id: string
          rating: number
          replied_at?: string | null
          reply_body?: string | null
          reviewer_name?: string | null
          size_bought?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          buyer_id?: string
          created_at?: string
          id?: string
          photos?: string[]
          product_id?: string
          rating?: number
          replied_at?: string | null
          reply_body?: string | null
          reviewer_name?: string | null
          size_bought?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_videos: {
        Row: {
          brand_line: string
          bunny_video_id: string | null
          category: string
          created_at: string
          duration_seconds: number | null
          embedding: unknown
          id: string
          likes_count: number
          moq: string | null
          price: string | null
          product_id: string | null
          provider: string
          rating: number
          rejection_reason: string | null
          reviews: string | null
          status: Database["public"]["Enums"]["product_status"]
          thumbnail_url: string | null
          vendor_id: string
          video_height: number | null
          video_url: string | null
          video_width: number | null
          views_count: number
        }
        Insert: {
          brand_line?: string
          bunny_video_id?: string | null
          category?: string
          created_at?: string
          duration_seconds?: number | null
          embedding?: unknown
          id?: string
          likes_count?: number
          moq?: string | null
          price?: string | null
          product_id?: string | null
          provider?: string
          rating?: number
          rejection_reason?: string | null
          reviews?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          thumbnail_url?: string | null
          vendor_id: string
          video_height?: number | null
          video_url?: string | null
          video_width?: number | null
          views_count?: number
        }
        Update: {
          brand_line?: string
          bunny_video_id?: string | null
          category?: string
          created_at?: string
          duration_seconds?: number | null
          embedding?: unknown
          id?: string
          likes_count?: number
          moq?: string | null
          price?: string | null
          product_id?: string | null
          provider?: string
          rating?: number
          rejection_reason?: string | null
          reviews?: string | null
          status?: Database["public"]["Enums"]["product_status"]
          thumbnail_url?: string | null
          vendor_id?: string
          video_height?: number | null
          video_url?: string | null
          video_width?: number | null
          views_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_videos_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_videos_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_videos_vendor_profile_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          attributes: Json
          category_id: string | null
          category_name: string | null
          collar_type: string | null
          colour: string | null
          compare_at_price: number | null
          country_of_origin: string | null
          created_at: string
          currency: string
          customization_available: boolean
          description: string | null
          embedding: unknown
          enquiries_count: number
          fabric: string | null
          fit_type: string | null
          fts: unknown
          gender: string | null
          gsm: string | null
          id: string
          lengths: string[] | null
          location: string | null
          moq: string | null
          name: string
          neck_type: string | null
          occasion: string[] | null
          pattern: string[] | null
          paused_at: string | null
          paused_from: string | null
          price_value: number | null
          rating_avg: number
          rejection_reason: string | null
          reviews_count: number
          search_text: string | null
          sizes: string[] | null
          sleeve_type: string | null
          sold_count: number
          status: Database["public"]["Enums"]["product_status"]
          unit: string | null
          vendor_id: string
          views_count: number
          waist_sizes: string[] | null
        }
        Insert: {
          attributes?: Json
          category_id?: string | null
          category_name?: string | null
          collar_type?: string | null
          colour?: string | null
          compare_at_price?: number | null
          country_of_origin?: string | null
          created_at?: string
          currency?: string
          customization_available?: boolean
          description?: string | null
          embedding?: unknown
          enquiries_count?: number
          fabric?: string | null
          fit_type?: string | null
          fts?: unknown
          gender?: string | null
          gsm?: string | null
          id?: string
          lengths?: string[] | null
          location?: string | null
          moq?: string | null
          name: string
          neck_type?: string | null
          occasion?: string[] | null
          pattern?: string[] | null
          paused_at?: string | null
          paused_from?: string | null
          price_value?: number | null
          rating_avg?: number
          rejection_reason?: string | null
          reviews_count?: number
          search_text?: string | null
          sizes?: string[] | null
          sleeve_type?: string | null
          sold_count?: number
          status?: Database["public"]["Enums"]["product_status"]
          unit?: string | null
          vendor_id: string
          views_count?: number
          waist_sizes?: string[] | null
        }
        Update: {
          attributes?: Json
          category_id?: string | null
          category_name?: string | null
          collar_type?: string | null
          colour?: string | null
          compare_at_price?: number | null
          country_of_origin?: string | null
          created_at?: string
          currency?: string
          customization_available?: boolean
          description?: string | null
          embedding?: unknown
          enquiries_count?: number
          fabric?: string | null
          fit_type?: string | null
          fts?: unknown
          gender?: string | null
          gsm?: string | null
          id?: string
          lengths?: string[] | null
          location?: string | null
          moq?: string | null
          name?: string
          neck_type?: string | null
          occasion?: string[] | null
          pattern?: string[] | null
          paused_at?: string | null
          paused_from?: string | null
          price_value?: number | null
          rating_avg?: number
          rejection_reason?: string | null
          reviews_count?: number
          search_text?: string | null
          sizes?: string[] | null
          sleeve_type?: string | null
          sold_count?: number
          status?: Database["public"]["Enums"]["product_status"]
          unit?: string | null
          vendor_id?: string
          views_count?: number
          waist_sizes?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status_type"]
          active_role: string
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          onboarded: boolean
          phone: string | null
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status_type"]
          active_role?: string
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          onboarded?: boolean
          phone?: string | null
        }
        Update: {
          account_status?: Database["public"]["Enums"]["account_status_type"]
          active_role?: string
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          onboarded?: boolean
          phone?: string | null
        }
        Relationships: []
      }
      quotes: {
        Row: {
          comment: string | null
          created_at: string
          currency: string
          fabric: string | null
          id: string
          lead_time: string | null
          moq: number | null
          price_inr: number | null
          price_per_unit: number | null
          rfq_id: string
          sample_timeline: string | null
          sampling_cost: number | null
          status: Database["public"]["Enums"]["quote_status"]
          vendor_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          currency?: string
          fabric?: string | null
          id?: string
          lead_time?: string | null
          moq?: number | null
          price_inr?: number | null
          price_per_unit?: number | null
          rfq_id: string
          sample_timeline?: string | null
          sampling_cost?: number | null
          status?: Database["public"]["Enums"]["quote_status"]
          vendor_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          currency?: string
          fabric?: string | null
          id?: string
          lead_time?: string | null
          moq?: number | null
          price_inr?: number | null
          price_per_unit?: number | null
          rfq_id?: string
          sample_timeline?: string | null
          sampling_cost?: number | null
          status?: Database["public"]["Enums"]["quote_status"]
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recently_viewed: {
        Row: {
          buyer_id: string
          product_id: string
          viewed_at: string
        }
        Insert: {
          buyer_id: string
          product_id: string
          viewed_at?: string
        }
        Update: {
          buyer_id?: string
          product_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recently_viewed_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recently_viewed_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      refund_guarantee_requests: {
        Row: {
          close_note: string | null
          closed_at: string | null
          closed_by: string | null
          id: string
          invoice_ids: string[]
          reason: string | null
          requested_at: string
          status: string
          total_rupees: number
          vendor_id: string
        }
        Insert: {
          close_note?: string | null
          closed_at?: string | null
          closed_by?: string | null
          id?: string
          invoice_ids: string[]
          reason?: string | null
          requested_at?: string
          status?: string
          total_rupees: number
          vendor_id: string
        }
        Update: {
          close_note?: string | null
          closed_at?: string | null
          closed_by?: string | null
          id?: string
          invoice_ids?: string[]
          reason?: string | null
          requested_at?: string
          status?: string
          total_rupees?: number
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_guarantee_requests_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          body: string | null
          buyer_id: string
          created_at: string
          id: string
          rating: number
          replied_at: string | null
          reply_body: string | null
          reviewer_company: string | null
          reviewer_name: string | null
          updated_at: string
          vendor_id: string
        }
        Insert: {
          body?: string | null
          buyer_id: string
          created_at?: string
          id?: string
          rating: number
          replied_at?: string | null
          reply_body?: string | null
          reviewer_company?: string | null
          reviewer_name?: string | null
          updated_at?: string
          vendor_id: string
        }
        Update: {
          body?: string | null
          buyer_id?: string
          created_at?: string
          id?: string
          rating?: number
          replied_at?: string | null
          reply_body?: string | null
          reviewer_company?: string | null
          reviewer_name?: string | null
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rfqs: {
        Row: {
          attributes: Json
          budget_max: number | null
          budget_min: number | null
          buyer_country_code: string | null
          buyer_id: string
          category_id: string | null
          colors: string[] | null
          created_at: string
          customization_images: string[] | null
          customization_notes: string | null
          customization_requested: boolean
          description: string | null
          embedding: unknown
          id: string
          image: string | null
          images: string[] | null
          overseas: boolean
          overseas_vip_until: string | null
          product_id: string | null
          product_name: string | null
          quantity: number | null
          removed_at: string | null
          removed_by: string | null
          removed_reason: string | null
          search_text: string | null
          sizes_breakdown: Json | null
          status: Database["public"]["Enums"]["rfq_status"]
          title: string
          vendor_id: string | null
        }
        Insert: {
          attributes?: Json
          budget_max?: number | null
          budget_min?: number | null
          buyer_country_code?: string | null
          buyer_id: string
          category_id?: string | null
          colors?: string[] | null
          created_at?: string
          customization_images?: string[] | null
          customization_notes?: string | null
          customization_requested?: boolean
          description?: string | null
          embedding?: unknown
          id?: string
          image?: string | null
          images?: string[] | null
          overseas?: boolean
          overseas_vip_until?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number | null
          removed_at?: string | null
          removed_by?: string | null
          removed_reason?: string | null
          search_text?: string | null
          sizes_breakdown?: Json | null
          status?: Database["public"]["Enums"]["rfq_status"]
          title: string
          vendor_id?: string | null
        }
        Update: {
          attributes?: Json
          budget_max?: number | null
          budget_min?: number | null
          buyer_country_code?: string | null
          buyer_id?: string
          category_id?: string | null
          colors?: string[] | null
          created_at?: string
          customization_images?: string[] | null
          customization_notes?: string | null
          customization_requested?: boolean
          description?: string | null
          embedding?: unknown
          id?: string
          image?: string | null
          images?: string[] | null
          overseas?: boolean
          overseas_vip_until?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity?: number | null
          removed_at?: string | null
          removed_by?: string | null
          removed_reason?: string | null
          search_text?: string | null
          sizes_breakdown?: Json | null
          status?: Database["public"]["Enums"]["rfq_status"]
          title?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rfqs_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfqs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfqs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfqs_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfqs_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_folder_items: {
        Row: {
          created_at: string
          folder_id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          folder_id: string
          product_id: string
        }
        Update: {
          created_at?: string
          folder_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_folder_items_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "saved_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_folder_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_folders: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          name?: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_folders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_items: {
        Row: {
          buyer_id: string
          created_at: string
          product_id: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          product_id: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_items_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_videos: {
        Row: {
          buyer_id: string
          created_at: string
          video_id: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          video_id: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_videos_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_videos_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "product_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      search_query_embeddings: {
        Row: {
          created_at: string
          embedding: unknown
          hits: number
          last_used_at: string
          query_norm: string
        }
        Insert: {
          created_at?: string
          embedding: unknown
          hits?: number
          last_used_at?: string
          query_norm: string
        }
        Update: {
          created_at?: string
          embedding?: unknown
          hits?: number
          last_used_at?: string
          query_norm?: string
        }
        Relationships: []
      }
      service_reviews: {
        Row: {
          body: string | null
          buyer_id: string
          created_at: string
          id: string
          rating: number
          reviewer_name: string | null
          service_id: string
          service_kind: string
          service_name: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          buyer_id: string
          created_at?: string
          id?: string
          rating: number
          reviewer_name?: string | null
          service_id: string
          service_kind: string
          service_name?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          buyer_id?: string
          created_at?: string
          id?: string
          rating?: number
          reviewer_name?: string | null
          service_id?: string
          service_kind?: string
          service_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      site_banners: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          cta_label: string | null
          ends_at: string | null
          id: string
          image_path: string | null
          link_path: string | null
          placement: string
          position: number
          starts_at: string | null
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          ends_at?: string | null
          id?: string
          image_path?: string | null
          link_path?: string | null
          placement?: string
          position?: number
          starts_at?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          ends_at?: string | null
          id?: string
          image_path?: string | null
          link_path?: string | null
          placement?: string
          position?: number
          starts_at?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_theme: {
        Row: {
          body_font: string
          border: string
          buyer_accent: string
          heading_font: string
          id: boolean
          ink: string
          success: string
          updated_at: string
          updated_by: string | null
          vendor_accent: string
        }
        Insert: {
          body_font: string
          border: string
          buyer_accent: string
          heading_font: string
          id?: boolean
          ink: string
          success: string
          updated_at?: string
          updated_by?: string | null
          vendor_accent: string
        }
        Update: {
          body_font?: string
          border?: string
          buyer_accent?: string
          heading_font?: string
          id?: boolean
          ink?: string
          success?: string
          updated_at?: string
          updated_by?: string | null
          vendor_accent?: string
        }
        Relationships: []
      }
      subscription_credit_notes: {
        Row: {
          cgst_paise: number
          created_at: string
          credit_note_number: string
          id: string
          igst_paise: number
          invoice_id: string
          razorpay_refund_id: string | null
          reason: string
          sgst_paise: number
          taxable_paise: number
          total_paise: number
          vendor_id: string
        }
        Insert: {
          cgst_paise?: number
          created_at?: string
          credit_note_number: string
          id?: string
          igst_paise?: number
          invoice_id: string
          razorpay_refund_id?: string | null
          reason: string
          sgst_paise?: number
          taxable_paise: number
          total_paise: number
          vendor_id: string
        }
        Update: {
          cgst_paise?: number
          created_at?: string
          credit_note_number?: string
          id?: string
          igst_paise?: number
          invoice_id?: string
          razorpay_refund_id?: string | null
          reason?: string
          sgst_paise?: number
          taxable_paise?: number
          total_paise?: number
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_credit_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "subscription_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_credit_notes_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_grants: {
        Row: {
          created_at: string
          ends_at: string
          granted_by: string | null
          id: string
          plan_id: string
          reason: string
          starts_at: string
          subscription_id: string | null
          vendor_id: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          granted_by?: string | null
          id?: string
          plan_id: string
          reason: string
          starts_at: string
          subscription_id?: string | null
          vendor_id: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          granted_by?: string | null
          id?: string
          plan_id?: string
          reason?: string
          starts_at?: string
          subscription_id?: string | null
          vendor_id?: string
        }
        Relationships: []
      }
      subscription_invoices: {
        Row: {
          amount: number
          billing_period_end: string | null
          billing_period_start: string | null
          cgst_paise: number | null
          change_kind: string | null
          created_at: string
          credit_rupees: number | null
          currency: string
          discount_amount: number | null
          discount_code: string | null
          document_type: string
          gst_amount: number | null
          gst_number: string | null
          id: string
          igst_paise: number | null
          invoice_number: string | null
          payment_mode: string
          pdf_url: string | null
          place_of_supply: string | null
          plan_id: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_refund_id: string | null
          recipient: Json | null
          refund_requested_at: string | null
          refund_status: string | null
          refunded_amount: number | null
          refunded_at: string | null
          sac_code: string | null
          sgst_paise: number | null
          status: string
          subscription_id: string | null
          superseded_at: string | null
          supplier: Json | null
          supply_type: string | null
          tds_amount: number | null
          total_paise: number | null
          vendor_id: string
        }
        Insert: {
          amount?: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          cgst_paise?: number | null
          change_kind?: string | null
          created_at?: string
          credit_rupees?: number | null
          currency?: string
          discount_amount?: number | null
          discount_code?: string | null
          document_type: string
          gst_amount?: number | null
          gst_number?: string | null
          id?: string
          igst_paise?: number | null
          invoice_number?: string | null
          payment_mode: string
          pdf_url?: string | null
          place_of_supply?: string | null
          plan_id?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_refund_id?: string | null
          recipient?: Json | null
          refund_requested_at?: string | null
          refund_status?: string | null
          refunded_amount?: number | null
          refunded_at?: string | null
          sac_code?: string | null
          sgst_paise?: number | null
          status?: string
          subscription_id?: string | null
          superseded_at?: string | null
          supplier?: Json | null
          supply_type?: string | null
          tds_amount?: number | null
          total_paise?: number | null
          vendor_id: string
        }
        Update: {
          amount?: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          cgst_paise?: number | null
          change_kind?: string | null
          created_at?: string
          credit_rupees?: number | null
          currency?: string
          discount_amount?: number | null
          discount_code?: string | null
          document_type?: string
          gst_amount?: number | null
          gst_number?: string | null
          id?: string
          igst_paise?: number | null
          invoice_number?: string | null
          payment_mode?: string
          pdf_url?: string | null
          place_of_supply?: string | null
          plan_id?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_refund_id?: string | null
          recipient?: Json | null
          refund_requested_at?: string | null
          refund_status?: string | null
          refunded_amount?: number | null
          refunded_at?: string | null
          sac_code?: string | null
          sgst_paise?: number | null
          status?: string
          subscription_id?: string | null
          superseded_at?: string | null
          supplier?: Json | null
          supply_type?: string | null
          tds_amount?: number | null
          total_paise?: number | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_invoices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "vendor_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_invoices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_mandates: {
        Row: {
          amount_paise: number
          billing_cycle: string
          charge_at: string | null
          created_at: string
          ended_at: string | null
          first_order_ref: string | null
          id: string
          list_rupees: number
          method: string | null
          payment_mode: string
          plan_id: string
          razorpay_subscription_id: string
          start_at: string
          status: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          amount_paise: number
          billing_cycle: string
          charge_at?: string | null
          created_at?: string
          ended_at?: string | null
          first_order_ref?: string | null
          id?: string
          list_rupees: number
          method?: string | null
          payment_mode: string
          plan_id: string
          razorpay_subscription_id: string
          start_at: string
          status?: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          amount_paise?: number
          billing_cycle?: string
          charge_at?: string | null
          created_at?: string
          ended_at?: string | null
          first_order_ref?: string | null
          id?: string
          list_rupees?: number
          method?: string | null
          payment_mode?: string
          plan_id?: string
          razorpay_subscription_id?: string
          start_at?: string
          status?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_mandates_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_mandates_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payment_orders: {
        Row: {
          amount: number
          autopay: boolean
          billing_cycle: string
          change_kind: string | null
          created_at: string
          credit_rupees: number
          discount_code: string | null
          discount_redemption_id: string | null
          discount_rupees: number
          gst_number: string | null
          list_rupees: number | null
          order_id: string
          paid_at: string | null
          payment_mode: string
          payment_ref: string | null
          plan_id: string
          reconciled_at: string | null
          status: string
          vendor_id: string
        }
        Insert: {
          amount: number
          autopay?: boolean
          billing_cycle?: string
          change_kind?: string | null
          created_at?: string
          credit_rupees?: number
          discount_code?: string | null
          discount_redemption_id?: string | null
          discount_rupees?: number
          gst_number?: string | null
          list_rupees?: number | null
          order_id: string
          paid_at?: string | null
          payment_mode: string
          payment_ref?: string | null
          plan_id: string
          reconciled_at?: string | null
          status?: string
          vendor_id: string
        }
        Update: {
          amount?: number
          autopay?: boolean
          billing_cycle?: string
          change_kind?: string | null
          created_at?: string
          credit_rupees?: number
          discount_code?: string | null
          discount_redemption_id?: string | null
          discount_rupees?: number
          gst_number?: string | null
          list_rupees?: number | null
          order_id?: string
          paid_at?: string | null
          payment_mode?: string
          payment_ref?: string | null
          plan_id?: string
          reconciled_at?: string | null
          status?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payment_orders_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payment_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plan_prices: {
        Row: {
          applied_at: string | null
          canceled_at: string | null
          canceled_by: string | null
          created_at: string
          created_by: string | null
          effective_from: string
          id: string
          monthly_price: number
          plan_id: string
          previous_monthly: number | null
          previous_yearly: number | null
          reason: string
          status: string
          yearly_price: number
        }
        Insert: {
          applied_at?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          created_at?: string
          created_by?: string | null
          effective_from: string
          id?: string
          monthly_price: number
          plan_id: string
          previous_monthly?: number | null
          previous_yearly?: number | null
          reason: string
          status?: string
          yearly_price: number
        }
        Update: {
          applied_at?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          monthly_price?: number
          plan_id?: string
          previous_monthly?: number | null
          previous_yearly?: number | null
          reason?: string
          status?: string
          yearly_price?: number
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          created_at: string
          currency: string
          display: Json
          id: string
          is_invite_only: boolean
          limits: Json
          monthly_price: number
          name: string
          sort_order: number
          yearly_price: number
        }
        Insert: {
          created_at?: string
          currency?: string
          display?: Json
          id: string
          is_invite_only?: boolean
          limits?: Json
          monthly_price?: number
          name: string
          sort_order?: number
          yearly_price?: number
        }
        Update: {
          created_at?: string
          currency?: string
          display?: Json
          id?: string
          is_invite_only?: boolean
          limits?: Json
          monthly_price?: number
          name?: string
          sort_order?: number
          yearly_price?: number
        }
        Relationships: []
      }
      subscription_usage: {
        Row: {
          id: string
          leads_used: number
          period_end: string
          period_start: string
          products_used: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          id?: string
          leads_used?: number
          period_end: string
          period_start: string
          products_used?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          id?: string
          leads_used?: number
          period_end?: string
          period_start?: string
          products_used?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_usage_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_attachments: {
        Row: {
          bytes: number
          checked_at: string | null
          created_at: string
          duration_ms: number | null
          id: string
          kind: string
          message_id: string | null
          mime: string
          requester_can_view: boolean
          status: string
          storage_path: string
          ticket_id: string
          uploader_id: string | null
          uploader_kind: string
        }
        Insert: {
          bytes: number
          checked_at?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          kind: string
          message_id?: string | null
          mime: string
          requester_can_view?: boolean
          status?: string
          storage_path: string
          ticket_id: string
          uploader_id?: string | null
          uploader_kind: string
        }
        Update: {
          bytes?: number
          checked_at?: string | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          kind?: string
          message_id?: string | null
          mime?: string
          requester_can_view?: boolean
          status?: string
          storage_path?: string
          ticket_id?: string
          uploader_id?: string | null
          uploader_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "support_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_attachments_uploader_id_fkey"
            columns: ["uploader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_callbacks: {
        Row: {
          attempts: number
          created_at: string
          last_attempt_at: string | null
          outcome: string
          phone: string
          preferred_date: string
          ticket_id: string
          window_end: string
          window_start: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          last_attempt_at?: string | null
          outcome?: string
          phone: string
          preferred_date: string
          ticket_id: string
          window_end: string
          window_start: string
        }
        Update: {
          attempts?: number
          created_at?: string
          last_attempt_at?: string | null
          outcome?: string
          phone?: string
          preferred_date?: string
          ticket_id?: string
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_callbacks_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_categories: {
        Row: {
          active: boolean
          audience: string
          channels: string[]
          code: string
          label: Json
          position: number
          restricted: boolean
        }
        Insert: {
          active?: boolean
          audience: string
          channels: string[]
          code: string
          label: Json
          position?: number
          restricted?: boolean
        }
        Update: {
          active?: boolean
          audience?: string
          channels?: string[]
          code?: string
          label?: Json
          position?: number
          restricted?: boolean
        }
        Relationships: []
      }
      support_events: {
        Row: {
          actor_id: string | null
          actor_kind: string
          at: string
          detail: Json
          event: string
          from_status: string | null
          id: number
          ticket_id: string
          to_status: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          at?: string
          detail?: Json
          event: string
          from_status?: string | null
          id?: never
          ticket_id: string
          to_status?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          at?: string
          detail?: Json
          event?: string
          from_status?: string | null
          id?: never
          ticket_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_fraud_details: {
        Row: {
          amount_inr: number | null
          city: string | null
          created_at: string
          incident_date: string | null
          reported_entity_id: string | null
          reported_entity_type: string | null
          reported_name: string | null
          reported_phone: string | null
          reported_url: string | null
          ticket_id: string
        }
        Insert: {
          amount_inr?: number | null
          city?: string | null
          created_at?: string
          incident_date?: string | null
          reported_entity_id?: string | null
          reported_entity_type?: string | null
          reported_name?: string | null
          reported_phone?: string | null
          reported_url?: string | null
          ticket_id: string
        }
        Update: {
          amount_inr?: number | null
          city?: string | null
          created_at?: string
          incident_date?: string | null
          reported_entity_id?: string | null
          reported_entity_type?: string | null
          reported_name?: string | null
          reported_phone?: string | null
          reported_url?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_fraud_details_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_holidays: {
        Row: {
          created_at: string
          created_by: string | null
          day: string
          label: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          day: string
          label: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          day?: string
          label?: string
        }
        Relationships: []
      }
      support_hours: {
        Row: {
          close_time: string | null
          is_open: boolean
          open_time: string | null
          weekday: number
        }
        Insert: {
          close_time?: string | null
          is_open: boolean
          open_time?: string | null
          weekday: number
        }
        Update: {
          close_time?: string | null
          is_open?: boolean
          open_time?: string | null
          weekday?: number
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          author_id: string | null
          author_kind: string
          body: string | null
          created_at: string
          event: string | null
          id: string
          kind: string
          meta: Json
          ticket_id: string
          visibility: string
        }
        Insert: {
          author_id?: string | null
          author_kind: string
          body?: string | null
          created_at?: string
          event?: string | null
          id?: string
          kind?: string
          meta?: Json
          ticket_id: string
          visibility?: string
        }
        Update: {
          author_id?: string | null
          author_kind?: string
          body?: string | null
          created_at?: string
          event?: string | null
          id?: string
          kind?: string
          meta?: Json
          ticket_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_settings: {
        Row: {
          rollout: string
          singleton: boolean
          support_email: string
          support_phone: string
          test_profile_ids: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          rollout?: string
          singleton?: boolean
          support_email?: string
          support_phone?: string
          test_profile_ids?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          rollout?: string
          singleton?: boolean
          support_email?: string
          support_phone?: string
          test_profile_ids?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      support_ticket_staff: {
        Row: {
          assigned_at: string | null
          assignee_id: string | null
          context: Json
          fraud_outcome: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          ticket_id: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assignee_id?: string | null
          context?: Json
          fraud_outcome?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          ticket_id: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assignee_id?: string | null
          context?: Json
          fraud_outcome?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_staff_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_staff_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_staff_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          category: string
          channel: string
          closed_at: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          first_staff_reply_at: string | null
          id: string
          is_test: boolean
          language: string
          last_message_at: string
          reopen_count: number
          requester_id: string | null
          requester_last_read_at: string | null
          requester_side: string
          resolved_at: string | null
          restricted: boolean
          status: string
          subject: string
          ticket_no: string
        }
        Insert: {
          category: string
          channel: string
          closed_at?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          first_staff_reply_at?: string | null
          id?: string
          is_test?: boolean
          language?: string
          last_message_at?: string
          reopen_count?: number
          requester_id?: string | null
          requester_last_read_at?: string | null
          requester_side: string
          resolved_at?: string | null
          restricted?: boolean
          status?: string
          subject: string
          ticket_no?: string
        }
        Update: {
          category?: string
          channel?: string
          closed_at?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          first_staff_reply_at?: string | null
          id?: string
          is_test?: boolean
          language?: string
          last_message_at?: string
          reopen_count?: number
          requester_id?: string | null
          requester_last_read_at?: string | null
          requester_side?: string
          resolved_at?: string | null
          restricted?: boolean
          status?: string
          subject?: string
          ticket_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "support_categories"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "support_tickets_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_ad_verifications: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          source: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          source: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          source?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_ad_verifications_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_capacity: {
        Row: {
          category_root: string
          monthly_capacity: number
          unit: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          category_root: string
          monthly_capacity: number
          unit: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          category_root?: string
          monthly_capacity?: number
          unit?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_capacity_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_catalog_recompute_queue: {
        Row: {
          queued_at: string
          vendor_id: string
        }
        Insert: {
          queued_at?: string
          vendor_id: string
        }
        Update: {
          queued_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_catalog_recompute_queue_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_contracts: {
        Row: {
          agreement_version: string
          created_at: string
          id: string
          signature_url: string | null
          signed_at: string
          signed_name: string
          vendor_id: string
        }
        Insert: {
          agreement_version: string
          created_at?: string
          id?: string
          signature_url?: string | null
          signed_at?: string
          signed_name: string
          vendor_id: string
        }
        Update: {
          agreement_version?: string
          created_at?: string
          id?: string
          signature_url?: string | null
          signed_at?: string
          signed_name?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_contracts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_documents: {
        Row: {
          created_at: string
          detail: Json
          doc_type: string
          file_url: string | null
          id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          vendor_id: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          detail?: Json
          doc_type: string
          file_url?: string | null
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          vendor_id: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          detail?: Json
          doc_type?: string
          file_url?: string | null
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          vendor_id?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "vendor_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_documents_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_lead_followups: {
        Row: {
          created_at: string
          done_at: string | null
          due_at: string
          id: string
          note: string | null
          notified_at: string | null
          pipeline_id: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          done_at?: string | null
          due_at: string
          id?: string
          note?: string | null
          notified_at?: string | null
          pipeline_id: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          done_at?: string | null
          due_at?: string
          id?: string
          note?: string | null
          notified_at?: string | null
          pipeline_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_lead_followups_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "vendor_lead_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_lead_followups_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_lead_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          meta: Json
          pipeline_id: string
          vendor_id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          meta?: Json
          pipeline_id: string
          vendor_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          meta?: Json
          pipeline_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_lead_notes_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "vendor_lead_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_lead_notes_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_lead_pipeline: {
        Row: {
          buyer_id: string | null
          buyer_name: string | null
          closed_at: string | null
          created_at: string
          id: string
          lost_reason: string | null
          next_follow_up_at: string | null
          rfq_id: string | null
          source: string
          stage: string
          stage_changed_at: string
          tags: string[]
          title: string
          updated_at: string
          value_inr: number | null
          vendor_id: string
        }
        Insert: {
          buyer_id?: string | null
          buyer_name?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          lost_reason?: string | null
          next_follow_up_at?: string | null
          rfq_id?: string | null
          source?: string
          stage?: string
          stage_changed_at?: string
          tags?: string[]
          title: string
          updated_at?: string
          value_inr?: number | null
          vendor_id: string
        }
        Update: {
          buyer_id?: string | null
          buyer_name?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          lost_reason?: string | null
          next_follow_up_at?: string | null
          rfq_id?: string | null
          source?: string
          stage?: string
          stage_changed_at?: string
          tags?: string[]
          title?: string
          updated_at?: string
          value_inr?: number | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_lead_pipeline_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_lead_pipeline_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_lead_pipeline_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_profiles: {
        Row: {
          about: string | null
          ad_verified_until: string | null
          address_line: string | null
          annual_turnover: string | null
          area: string | null
          banner_url: string | null
          brand_name: string | null
          business_type: string | null
          capabilities: string[]
          capacity: string[]
          catalog_embedding: unknown
          catalog_embedding_updated_at: string | null
          category: string[] | null
          cin: string | null
          city: string | null
          country: string | null
          created_at: string
          employee_count: string | null
          followers_count: number
          gstin: string | null
          has_phone: boolean | null
          has_whatsapp: boolean | null
          id: string
          is_verified: boolean
          landmark: string | null
          logo_url: string | null
          notifications: Json | null
          office_photos: string[] | null
          onboarding_complete: boolean
          owner_email: string | null
          owner_name: string | null
          pan: string | null
          phone: string | null
          plan_expires_at: string | null
          plan_id: string | null
          postal_code: string | null
          primary_type: string | null
          profile_score: number
          rating_avg: number
          recommended_product_ids: string[]
          regional: Json | null
          reviews_count: number
          served_states: string[]
          social: Json | null
          state: string | null
          state_code: string | null
          website: string | null
          whatsapp: string | null
          year_established: number | null
        }
        Insert: {
          about?: string | null
          ad_verified_until?: string | null
          address_line?: string | null
          annual_turnover?: string | null
          area?: string | null
          banner_url?: string | null
          brand_name?: string | null
          business_type?: string | null
          capabilities?: string[]
          capacity?: string[]
          catalog_embedding?: unknown
          catalog_embedding_updated_at?: string | null
          category?: string[] | null
          cin?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          employee_count?: string | null
          followers_count?: number
          gstin?: string | null
          has_phone?: boolean | null
          has_whatsapp?: boolean | null
          id: string
          is_verified?: boolean
          landmark?: string | null
          logo_url?: string | null
          notifications?: Json | null
          office_photos?: string[] | null
          onboarding_complete?: boolean
          owner_email?: string | null
          owner_name?: string | null
          pan?: string | null
          phone?: string | null
          plan_expires_at?: string | null
          plan_id?: string | null
          postal_code?: string | null
          primary_type?: string | null
          profile_score?: number
          rating_avg?: number
          recommended_product_ids?: string[]
          regional?: Json | null
          reviews_count?: number
          served_states?: string[]
          social?: Json | null
          state?: string | null
          state_code?: string | null
          website?: string | null
          whatsapp?: string | null
          year_established?: number | null
        }
        Update: {
          about?: string | null
          ad_verified_until?: string | null
          address_line?: string | null
          annual_turnover?: string | null
          area?: string | null
          banner_url?: string | null
          brand_name?: string | null
          business_type?: string | null
          capabilities?: string[]
          capacity?: string[]
          catalog_embedding?: unknown
          catalog_embedding_updated_at?: string | null
          category?: string[] | null
          cin?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          employee_count?: string | null
          followers_count?: number
          gstin?: string | null
          has_phone?: boolean | null
          has_whatsapp?: boolean | null
          id?: string
          is_verified?: boolean
          landmark?: string | null
          logo_url?: string | null
          notifications?: Json | null
          office_photos?: string[] | null
          onboarding_complete?: boolean
          owner_email?: string | null
          owner_name?: string | null
          pan?: string | null
          phone?: string | null
          plan_expires_at?: string | null
          plan_id?: string | null
          postal_code?: string | null
          primary_type?: string | null
          profile_score?: number
          rating_avg?: number
          recommended_product_ids?: string[]
          regional?: Json | null
          reviews_count?: number
          served_states?: string[]
          social?: Json | null
          state?: string | null
          state_code?: string | null
          website?: string | null
          whatsapp?: string | null
          year_established?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_profiles_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_profiles_state_code_fkey"
            columns: ["state_code"]
            isOneToOne: false
            referencedRelation: "india_states"
            referencedColumns: ["code"]
          },
        ]
      }
      vendor_subscriptions: {
        Row: {
          account_manager_id: string | null
          auto_renew: boolean
          billing_cycle: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          keep_product_ids: string[] | null
          plan_id: string
          real_time_alerts_enabled: boolean
          scheduled_billing_cycle: string | null
          scheduled_from: string | null
          scheduled_plan_id: string | null
          status: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          account_manager_id?: string | null
          auto_renew?: boolean
          billing_cycle?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          keep_product_ids?: string[] | null
          plan_id: string
          real_time_alerts_enabled?: boolean
          scheduled_billing_cycle?: string | null
          scheduled_from?: string | null
          scheduled_plan_id?: string | null
          status?: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          account_manager_id?: string | null
          auto_renew?: boolean
          billing_cycle?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          keep_product_ids?: string[] | null
          plan_id?: string
          real_time_alerts_enabled?: boolean
          scheduled_billing_cycle?: string | null
          scheduled_from?: string | null
          scheduled_plan_id?: string | null
          status?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_subscriptions_account_manager_id_fkey"
            columns: ["account_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_subscriptions_scheduled_plan_id_fkey"
            columns: ["scheduled_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_subscriptions_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      video_likes: {
        Row: {
          buyer_id: string
          created_at: string
          video_id: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          video_id: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_likes_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_likes_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "product_videos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      embedding_usage_daily: {
        Row: {
          avg_queue_seconds: number | null
          chars_embedded: number | null
          day: string | null
          est_usd: number | null
          jobs_processed: number | null
          max_queue_seconds: number | null
          retried_jobs: number | null
          source_table: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      account_deletion_blocker: { Args: { p_user: string }; Returns: string }
      account_deletion_channels: { Args: { p_user: string }; Returns: string[] }
      account_deletion_sweep_list: {
        Args: never
        Returns: {
          avatar_paths: string[]
          avatar_url: string
          phase: string
          request_id: string
          user_id: string
        }[]
      }
      account_is_active: { Args: { p_id: string }; Returns: boolean }
      account_not_deleted: { Args: { p_id: string }; Returns: boolean }
      active_ads: {
        Args: {
          filter_categories?: string[]
          filter_category?: string
          filter_placements?: string[]
          max_count?: number
        }
        Returns: {
          ad_id: string
          category_name: string
          currency: string
          image_url: string
          is_bumped: boolean
          placement: string
          price_value: number
          product_id: string
          product_name: string
          title: string
          vendor_id: string
          vendor_name: string
        }[]
      }
      ad_apply_decision: {
        Args: {
          p_ad_id: string
          p_decision: string
          p_new_status: string
          p_note?: string
          p_notify_body?: string
          p_notify_title?: string
          p_reason_code?: string
          p_reviewer?: string
        }
        Returns: undefined
      }
      ad_bump_window: { Args: never; Returns: string }
      ad_category_benchmarks: { Args: { v?: string }; Returns: Json }
      ad_click: { Args: { ad: string; p_session?: string }; Returns: undefined }
      ad_fraud_signals: {
        Args: { p_days?: number }
        Returns: {
          ad_id: string
          clicks: number
          clicks_per_viewer: number
          depth_ratio: number
          distinct_viewers: number
          post_click_events: number
          reasons: string[]
          status: string
          title: string
          vendor_id: string
        }[]
      }
      ad_frequency_capped: {
        Args: { p_ad: string; p_cap?: number; p_session?: string }
        Returns: boolean
      }
      ad_impression: {
        Args: { ad: string; p_session?: string }
        Returns: undefined
      }
      ad_is_bumped: {
        Args: { a: Database["public"]["Tables"]["advertisements"]["Row"] }
        Returns: boolean
      }
      ad_logging_throttled: {
        Args: { p_ad: string; p_session?: string; p_window?: string }
        Returns: boolean
      }
      ad_moderator: { Args: never; Returns: boolean }
      ad_owner: { Args: { p_ad_id: string }; Returns: boolean }
      ad_reach_check: {
        Args: { p_cities: Json; p_countries: string[]; p_states: string[]; p_vendor: string }
        Returns: Json
      }
      ad_reach_resolve: {
        Args: {
          p_cities: Json
          p_countries: string[]
          p_states: string[]
          p_strict?: boolean
          p_vendor: string
        }
        Returns: Json
      }
      ad_review_metrics: { Args: { p_days?: number }; Returns: Json }
      ad_seal_sources: { Args: { p_placement: string }; Returns: string[] }
      ad_target_live_status: { Args: { p_ad_id: string }; Returns: string }
      ad_targeting_matches: {
        Args: {
          a: Database["public"]["Tables"]["advertisements"]["Row"]
          p_categories: string[]
          p_city: string
        }
        Returns: boolean
      }
      ad_viewer_city: { Args: never; Returns: string }
      ad_viewer_location: {
        Args: never
        Returns: { city: string; country_code: string; state_code: string }[]
      }
      admin_account_suspension_list: {
        Args: { p_active?: boolean; p_profile_ids?: string[] }
        Returns: {
          active: boolean
          conversation_review_id: string
          id: string
          profile_id: string
          reason: string
          reason_id: string
          reinstated_at: string
          reinstated_by: string
          reinstated_by_email: string
          reinstated_by_full_name: string
          source: string
          suspended_at: string
          suspended_by: string
          suspended_by_email: string
          suspended_by_full_name: string
        }[]
      }
      admin_ad_reason_codes: {
        Args: never
        Returns: {
          code: string
          label: string
        }[]
      }
      admin_ad_review_log_list: {
        Args: { p_ad_id: string }
        Returns: {
          ad_id: string
          created_at: string
          decision: string
          id: string
          new_status: string
          note: string
          previous_status: string
          reason_code: string
          reviewer_id: string
        }[]
      }
      admin_am_assign: { Args: { p_manager: string | null; p_vendor: string }; Returns: undefined }
      admin_am_callback_set: { Args: { p_id: string; p_status: string }; Returns: undefined }
      admin_am_concierge: { Args: { p_vendor: string }; Returns: Json }
      admin_am_managers: { Args: never; Returns: Json }
      admin_am_mark_read: { Args: { p_vendor: string }; Returns: undefined }
      admin_am_note: {
        Args: { p_body: string; p_kind: string; p_period?: string | null; p_rfq?: string | null; p_vendor: string }
        Returns: string
      }
      admin_am_send: { Args: { p_body: string; p_vendor: string }; Returns: string }
      admin_am_vendor: { Args: { p_vendor: string }; Returns: Json }
      admin_am_vendors: { Args: { p_filter?: string }; Returns: Json }
      admin_audit_log_actors: {
        Args: never
        Returns: {
          actor_id: string
          actor_name: string
          actor_role: Database["public"]["Enums"]["admin_role_type"]
          entries: number
          last_at: string
        }[]
      }
      admin_audit_log_list: {
        Args: {
          p_action?: string
          p_actor?: string
          p_before_id?: number
          p_from?: string
          p_limit?: number
          p_table?: string
          p_to?: string
        }
        Returns: {
          action: string
          actor_id: string
          actor_name: string
          actor_role: Database["public"]["Enums"]["admin_role_type"]
          at: string
          changes: Json
          id: number
          own_row: boolean
          reason: string
          source: string
          target_id: string
          target_table: string
        }[]
      }
      admin_audit_record: {
        Args: {
          p_action: string
          p_actor: string
          p_changes: Json
          p_source: string
          p_target_id: string
          p_target_table: string
        }
        Returns: undefined
      }
      admin_audit_session: { Args: { p_action: string }; Returns: undefined }
      admin_billing_entity: { Args: never; Returns: Json }
      admin_billing_entity_save: { Args: { p: Json; p_reason: string }; Returns: Json }
      admin_billing_incident_resolve: { Args: { p_id: string; p_resolution: string }; Returns: undefined }
      admin_billing_incidents: {
        Args: { p_open_only?: boolean }
        Returns: {
          created_at: string
          detail: Json
          id: string
          kind: string
          order_ref: string
          payment_ref: string
          resolution: string
          resolved_at: string
          resolved_by_name: string
          vendor_id: string
          vendor_name: string
        }[]
      }
      admin_block_reason_add: {
        Args: { p_reason: string }
        Returns: {
          active: boolean
          created_at: string
          created_by: string
          id: string
          reason: string
        }[]
      }
      admin_block_reason_list: {
        Args: { p_active_only?: boolean }
        Returns: {
          active: boolean
          created_at: string
          created_by: string
          creator_email: string
          creator_full_name: string
          id: string
          reason: string
        }[]
      }
      admin_block_reason_update: {
        Args: { p_active?: boolean; p_id: string; p_reason?: string }
        Returns: {
          active: boolean
          id: string
          reason: string
        }[]
      }
      admin_blog_category_delete: {
        Args: { p_id: string }
        Returns: {
          id: string
        }[]
      }
      admin_blog_category_list: {
        Args: never
        Returns: {
          description: string
          id: string
          name: string
          posts: number
          seo_description: string
          seo_title: string
          slug: string
          sort_order: number
        }[]
      }
      admin_blog_category_reorder: {
        Args: { p_ids: string[] }
        Returns: undefined
      }
      admin_blog_category_save: {
        Args: {
          p_description?: string
          p_id?: string
          p_name?: string
          p_seo_description?: string
          p_seo_title?: string
          p_slug?: string
        }
        Returns: string
      }
      admin_blog_post_delete: {
        Args: { p_id: string }
        Returns: {
          id: string
          images: string[]
        }[]
      }
      admin_blog_post_get: {
        Args: { p_id: string }
        Returns: {
          author_id: string
          blocks: Json
          body: string
          canonical_url: string
          category_id: string
          created_at: string
          excerpt: string
          hero_image: string
          hero_image_alt: string
          id: string
          is_featured: boolean
          noindex: boolean
          og_image: string
          published_at: string
          read_time: string
          seo_description: string
          seo_title: string
          slug: string
          sort_order: number
          status: string
          tags: string[]
          thumbnail: string
          thumbnail_alt: string
          title: string
          updated_at: string
        }[]
      }
      admin_blog_post_list: {
        Args: never
        Returns: {
          category_id: string
          category_name: string
          excerpt: string
          has_blocks: boolean
          hero_image: string
          id: string
          is_featured: boolean
          noindex: boolean
          published_at: string
          slug: string
          sort_order: number
          status: string
          tags: string[]
          thumbnail: string
          title: string
          updated_at: string
        }[]
      }
      admin_blog_post_reorder: { Args: { p_ids: string[] }; Returns: undefined }
      admin_blog_post_save: {
        Args: {
          p_author?: string
          p_author_id?: string
          p_blocks?: Json
          p_canonical_url?: string
          p_category_id?: string
          p_excerpt?: string
          p_hero_image?: string
          p_hero_image_alt?: string
          p_id?: string
          p_is_featured?: boolean
          p_noindex?: boolean
          p_og_image?: string
          p_published_at?: string
          p_seo_description?: string
          p_seo_title?: string
          p_slug?: string
          p_status?: string
          p_tags?: string[]
          p_thumbnail?: string
          p_thumbnail_alt?: string
          p_title?: string
        }
        Returns: string
      }
      admin_blog_post_set_status: {
        Args: { p_id: string; p_published_at?: string; p_status: string }
        Returns: {
          id: string
          published_at: string
          status: string
        }[]
      }
      admin_blog_settings_get: {
        Args: never
        Returns: {
          hero_cta_href: string
          hero_cta_label: string
          hero_enabled: boolean
          hero_eyebrow: string
          hero_image: string
          hero_image_alt: string
          hero_subtitle: string
          hero_title: string
          updated_at: string
        }[]
      }
      admin_blog_settings_save: {
        Args: {
          p_hero_cta_href?: string
          p_hero_cta_label?: string
          p_hero_enabled?: boolean
          p_hero_eyebrow?: string
          p_hero_image?: string
          p_hero_image_alt?: string
          p_hero_subtitle?: string
          p_hero_title?: string
        }
        Returns: {
          hero_image: string
        }[]
      }
      admin_callback_log_attempt: {
        Args: { p_note?: string; p_outcome: string; p_ticket_id: string }
        Returns: Json
      }
      admin_conversation_review_list: {
        Args: { p_conversation_id?: string; p_status?: string }
        Returns: {
          conversation_id: string
          conversation_status: string
          conversation_user_a: string
          conversation_user_b: string
          created_at: string
          flagged_body: string
          flagged_created_at: string
          flagged_kind: string
          flagged_message_id: string
          flagged_sender_id: string
          id: string
          matched_pattern_id: string
          pattern_label: string
          pattern_pattern: string
          reason: string
          reason_id: string
          reported_reason: string
          reviewed_at: string
          reviewed_by: string
          source: string
          status: string
        }[]
      }
      admin_cron_status: {
        Args: never
        Returns: {
          active: boolean
          failures_24h: number
          jobname: string
          last_finished_at: string
          last_message: string
          last_started_at: string
          last_status: string
          runs_24h: number
          schedule: string
        }[]
      }
      admin_customer_list: {
        Args: {
          p_kind?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_segment?: string
          p_sort?: string
          p_tag?: string
        }
        Returns: {
          account_status: string
          city: string
          email: string
          id: string
          interactions: number
          joined_at: string
          kind: string
          last_active_at: string
          name: string
          payments: number
          segments: string[]
          spend_paise: number
          tags: Json
          total_count: number
          total_spend_paise: number
        }[]
      }
      admin_customer_refresh: { Args: never; Returns: Json }
      admin_customer_segment_counts: { Args: never; Returns: Json }
      admin_customer_tag_apply: {
        Args: { p_profile_id: string; p_tag_id: string }
        Returns: undefined
      }
      admin_customer_tag_create: { Args: { p_label: string }; Returns: string }
      admin_customer_tag_delete: {
        Args: { p_tag_id: string }
        Returns: undefined
      }
      admin_customer_tag_remove: {
        Args: { p_profile_id: string; p_tag_id: string }
        Returns: undefined
      }
      admin_customer_tags: {
        Args: never
        Returns: {
          id: string
          label: string
          uses: number
        }[]
      }
      admin_discount_code_save: {
        Args: {
          p_active?: boolean
          p_applies_to?: string
          p_code?: string
          p_id?: string
          p_kind?: string
          p_max_uses?: number
          p_note?: string
          p_per_vendor_limit?: number
          p_plan_ids?: string[]
          p_valid_from?: string
          p_valid_to?: string
          p_value?: number
        }
        Returns: string
      }
      admin_discount_code_set_active: {
        Args: { p_active: boolean; p_id: string }
        Returns: undefined
      }
      admin_discount_codes: { Args: never; Returns: Json }
      admin_discount_redemptions: {
        Args: { p_code_id: string; p_limit?: number }
        Returns: Json
      }
      admin_embedding_pipeline_health: {
        Args: { p_limit?: number }
        Returns: {
          checked_at: string
          products_missing: number
          queue_depth: number
          reason: string
          rfqs_missing: number
          status: string
          vault_secret_ok: boolean
          videos_missing: number
        }[]
      }
      admin_engagement_event_failures: {
        Args: { p_days?: number }
        Returns: {
          constraint_name: string
          count: number
          error_code: string
          first_at: string
          hour: string
          last_at: string
          last_event_type: string
          last_source: string
          message: string
        }[]
      }
      admin_faq_add: {
        Args: {
          p_answer: string
          p_category_label: string
          p_position?: number
          p_question: string
          p_surface: string
        }
        Returns: {
          active: boolean
          answer: string
          category_label: string
          id: string
          position: number
          question: string
          surface: string
        }[]
      }
      admin_faq_delete: {
        Args: { p_id: string }
        Returns: {
          id: string
        }[]
      }
      admin_faq_list: {
        Args: { p_surface?: string }
        Returns: {
          active: boolean
          answer: string
          category_label: string
          created_at: string
          created_by: string
          creator_email: string
          creator_full_name: string
          id: string
          position: number
          question: string
          surface: string
          updated_at: string
        }[]
      }
      admin_faq_reorder: {
        Args: { p_id: string; p_position: number }
        Returns: {
          id: string
          position: number
        }[]
      }
      admin_faq_set_translations: {
        Args: { p_id: string; p_translations: Json }
        Returns: {
          id: string
          translations: Json
        }[]
      }
      admin_faq_translations: {
        Args: { p_surface?: string }
        Returns: {
          id: string
          translations: Json
        }[]
      }
      admin_faq_update: {
        Args: {
          p_active?: boolean
          p_answer?: string
          p_category_label?: string
          p_id: string
          p_question?: string
        }
        Returns: {
          active: boolean
          answer: string
          category_label: string
          id: string
          position: number
          question: string
          surface: string
        }[]
      }
      admin_feature_flag_set: {
        Args: {
          p_allow_profile_ids: string[]
          p_enabled: boolean
          p_key: string
          p_reason: string
        }
        Returns: undefined
      }
      admin_feature_flags: {
        Args: never
        Returns: {
          allow_names: string[]
          allow_profile_ids: string[]
          description: string
          enabled: boolean
          key: string
          updated_at: string
          updated_by_name: string
        }[]
      }
      admin_feedback_mark_reviewed: {
        Args: { p_note?: string; p_ticket_id: string }
        Returns: Json
      }
      admin_flag_add: {
        Args: { p_entity_id: string; p_entity_type: string; p_note: string }
        Returns: {
          author_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          note: string
        }[]
      }
      admin_flag_list: {
        Args: { p_entity_id?: string; p_entity_type?: string; p_limit?: number }
        Returns: {
          author_email: string
          author_full_name: string
          author_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          note: string
        }[]
      }
      admin_flag_pattern_add: {
        Args: { p_active?: boolean; p_label: string; p_pattern: string }
        Returns: {
          active: boolean
          added_by: string
          created_at: string
          id: string
          label: string
          pattern: string
        }[]
      }
      admin_flag_pattern_list: {
        Args: never
        Returns: {
          active: boolean
          added_by: string
          adder_email: string
          adder_full_name: string
          created_at: string
          id: string
          label: string
          pattern: string
        }[]
      }
      admin_flag_pattern_remove: {
        Args: { p_id: string }
        Returns: {
          id: string
        }[]
      }
      admin_flag_pattern_update: {
        Args: { p_active: boolean; p_id: string }
        Returns: {
          active: boolean
          id: string
        }[]
      }
      admin_fraud_findings: {
        Args: { p_limit?: number }
        Returns: {
          account_status: string
          amount_inr: number
          decided_at: string
          decided_by_name: string
          id: string
          incident_date: string
          outcome: string
          report_purged_at: string
          subject_kind: string
          subject_name: string
          subject_profile_id: string
          ticket_no: string
          what_happened: string
          withdrawn_at: string
        }[]
      }
      admin_fraud_set_outcome: {
        Args: { p_note?: string; p_outcome: string; p_ticket_id: string }
        Returns: Json
      }
      admin_grant: {
        Args: {
          p_role: Database["public"]["Enums"]["admin_role_type"]
          p_user_id: string
        }
        Returns: {
          admin_role: Database["public"]["Enums"]["admin_role_type"]
          id: string
          is_active: boolean
        }[]
      }
      admin_help_guide_delete: { Args: { p_id: string }; Returns: undefined }
      admin_help_guide_list: { Args: never; Returns: Json }
      admin_help_guide_save: {
        Args: {
          p_active?: boolean
          p_audience: string
          p_body: Json
          p_id: string
          p_position?: number
          p_slug: string
          p_title: Json
          p_verified?: boolean
        }
        Returns: string
      }
      admin_keyword_add: {
        Args: { p_term: string }
        Returns: {
          added_by: string
          created_at: string
          id: string
          term: string
        }[]
      }
      admin_keyword_list: {
        Args: never
        Returns: {
          added_by: string
          adder_email: string
          adder_full_name: string
          created_at: string
          id: string
          term: string
        }[]
      }
      admin_keyword_remove: {
        Args: { p_id: string }
        Returns: {
          id: string
        }[]
      }
      admin_lead_alert_stats: { Args: { p_days?: number }; Returns: Json }
      admin_lead_detail: { Args: { p_rfq_id: string }; Returns: Json }
      admin_lead_remove: {
        Args: { p_reason: string; p_rfq_id: string }
        Returns: {
          id: string
          removed_at: string
        }[]
      }
      admin_leads_list: {
        Args: {
          p_category?: string
          p_cursor_at?: string
          p_cursor_id?: string
          p_direct?: boolean
          p_limit?: number
          p_min_age_hours?: number
          p_search?: string
          p_stage?: string
        }
        Returns: {
          accepted_vendor_id: string
          accepted_vendor_name: string
          budget_max: number
          budget_min: number
          buyer_id: string
          buyer_name: string
          category: string
          created_at: string
          direct: boolean
          first_quote_at: string
          id: string
          overdue: boolean
          quantity: number
          quotes: number
          rfq_status: string
          stage: string
          target_vendor_id: string
          target_vendor_name: string
          title: string
        }[]
      }
      admin_leads_summary: { Args: { p_days?: number }; Returns: Json }
      admin_list_admins: {
        Args: never
        Returns: {
          admin_role: Database["public"]["Enums"]["admin_role_type"]
          email: string
          full_name: string
          id: string
        }[]
      }
      admin_live_activity: { Args: { p_minutes?: number }; Returns: Json }
      admin_notification_health: { Args: never; Returns: Json }
      admin_notification_test: { Args: { p_channel: string }; Returns: Json }
      admin_payments_ledger: {
        Args: {
          p_cursor_at?: string
          p_cursor_key?: string
          p_from?: string
          p_kinds?: string[]
          p_limit?: number
          p_search?: string
          p_statuses?: string[]
          p_to?: string
          p_vendor?: string
        }
        Returns: {
          detail: string
          discount_code: string
          discount_paise: number
          entry_key: string
          gateway_ref: string
          gst_paise: number
          includes_certificate: boolean
          kind: string
          net_paise: number
          occurred_at: string
          reference: string
          source_id: string
          source_table: string
          status: string
          total_paise: number
          vendor_city: string
          vendor_id: string
          vendor_name: string
          verified: boolean
        }[]
      }
      admin_payments_summary: {
        Args: {
          p_from?: string
          p_kinds?: string[]
          p_search?: string
          p_statuses?: string[]
          p_to?: string
          p_vendor?: string
        }
        Returns: Json
      }
      admin_plan_price_cancel: { Args: { p_id: string; p_reason: string }; Returns: undefined }
      admin_plan_price_set: {
        Args: {
          p_effective?: string
          p_monthly: number
          p_plan: string
          p_reason?: string
          p_yearly: number
        }
        Returns: Json
      }
      admin_profile_emails: {
        Args: { p_ids: string[] }
        Returns: {
          email: string
          full_name: string
          id: string
        }[]
      }
      admin_profile_search: {
        Args: { p_limit?: number; p_term: string }
        Returns: {
          account_status: Database["public"]["Enums"]["account_status_type"]
          active_role: string
          created_at: string
          email: string
          full_name: string
          id: string
        }[]
      }
      admin_refund_guarantee_close: {
        Args: { p_note?: string; p_request_id: string }
        Returns: undefined
      }
      admin_refund_guarantee_requests: {
        Args: { p_status?: string }
        Returns: {
          close_note: string
          closed_at: string
          closed_by_name: string
          id: string
          invoices: Json
          reason: string
          requested_at: string
          status: string
          total_rupees: number
          vendor_id: string
          vendor_name: string
        }[]
      }
      admin_report_summary: {
        Args: { p_from?: string; p_to?: string }
        Returns: Json
      }
      admin_revoke: {
        Args: { p_user_id: string }
        Returns: {
          admin_role: Database["public"]["Enums"]["admin_role_type"]
          id: string
          is_active: boolean
        }[]
      }
      admin_role: {
        Args: never
        Returns: Database["public"]["Enums"]["admin_role_type"]
      }
      admin_role_values: { Args: never; Returns: string[] }
      admin_search_candidates: {
        Args: { p_query: string }
        Returns: {
          email: string
          full_name: string
          id: string
        }[]
      }
      admin_set_role: {
        Args: {
          p_role: Database["public"]["Enums"]["admin_role_type"]
          p_user_id: string
        }
        Returns: {
          admin_role: Database["public"]["Enums"]["admin_role_type"]
          id: string
          is_active: boolean
        }[]
      }
      admin_site_banner_delete: { Args: { p_id: string }; Returns: string }
      admin_site_banner_reorder: {
        Args: { p_ids: string[] }
        Returns: undefined
      }
      admin_site_banner_save: {
        Args: {
          p_active?: boolean
          p_cta_label?: string
          p_ends_at?: string
          p_id?: string
          p_image_path?: string
          p_link_path?: string
          p_starts_at?: string
          p_subtitle?: string
          p_title?: string
        }
        Returns: string
      }
      admin_site_banners: { Args: never; Returns: Json }
      admin_site_theme_get: { Args: never; Returns: Json }
      admin_site_theme_save: {
        Args: {
          p_body_font: string
          p_border: string
          p_buyer_accent: string
          p_heading_font: string
          p_ink: string
          p_success: string
          p_vendor_accent: string
        }
        Returns: Json
      }
      admin_staff_get: {
        Args: { p_user_id: string }
        Returns: {
          admin_role: Database["public"]["Enums"]["admin_role_type"]
          employee_id: string
          full_name: string
          is_active: boolean
          personal_email: string
          user_id: string
          work_email: string
        }[]
      }
      admin_staff_identifiers: {
        Args: { p_full_name: string; p_personal_email: string }
        Returns: {
          employee_id: string
          work_email: string
        }[]
      }
      admin_staff_list: {
        Args: never
        Returns: {
          admin_role: Database["public"]["Enums"]["admin_role_type"]
          employee_id: string
          full_name: string
          is_active: boolean
          password_changed_at: string
          personal_email: string
          phone: string
          registered_at: string
          registered_by_name: string
          temp_password_delivery: string
          temp_password_issued_at: string
          user_id: string
          work_email: string
        }[]
      }
      admin_staff_password_event: {
        Args: { p_delivery?: string; p_event: string; p_user_id: string }
        Returns: undefined
      }
      admin_staff_record: {
        Args: {
          p_employee_id: string
          p_full_name: string
          p_personal_email: string
          p_phone: string
          p_registered_by: string
          p_user_id: string
          p_work_email: string
        }
        Returns: undefined
      }
      admin_status_of: {
        Args: { p_user_id: string }
        Returns: {
          admin_role: Database["public"]["Enums"]["admin_role_type"]
          is_admin: boolean
        }[]
      }
      admin_subscription_cancel: {
        Args: { p_reason: string; p_subscription_id: string }
        Returns: undefined
      }
      admin_subscription_change_plan: {
        Args: { p_plan_id: string; p_reason: string; p_subscription_id: string }
        Returns: undefined
      }
      admin_subscription_grant: {
        Args: { p_plan: string; p_reason: string; p_until: string; p_vendor: string }
        Returns: Json
      }
      admin_subscription_kpis: { Args: never; Returns: Json }
      admin_subscription_worklist: {
        Args: {
          p_after_at?: string
          p_after_vendor?: string
          p_days?: number
          p_limit?: number
          p_plan?: string
          p_search?: string
          p_view?: string
        }
        Returns: {
          auto_renew: boolean
          billing_cycle: string
          brand_name: string
          city: string
          created_at: string
          current_period_end: string
          current_period_start: string
          grace_until: string
          granted: boolean
          id: string
          last_failed_at: string
          mandate_status: string
          plan_id: string
          scheduled_from: string
          scheduled_plan_id: string
          sort_at: string
          status: string
          vendor_id: string
        }[]
      }
      admin_support_assignees: {
        Args: never
        Returns: {
          id: string
          name: string
          role: string
        }[]
      }
      admin_support_category_set_active: {
        Args: { p_active: boolean; p_code: string }
        Returns: undefined
      }
      admin_support_claim: { Args: { p_ticket_id: string }; Returns: Json }
      admin_support_counts: { Args: never; Returns: Json }
      admin_support_get: { Args: { p_ticket_no: string }; Returns: Json }
      admin_support_holiday_add: {
        Args: { p_day: string; p_label: string }
        Returns: undefined
      }
      admin_support_holiday_remove: {
        Args: { p_day: string }
        Returns: undefined
      }
      admin_support_list: {
        Args: {
          p_category?: string
          p_channel?: string
          p_include_test?: boolean
          p_language?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_side?: string
          p_view?: string
        }
        Returns: {
          assignee_id: string
          assignee_name: string
          awaiting_staff: boolean
          callback_attempts: number
          callback_date: string
          callback_end: string
          callback_outcome: string
          callback_start: string
          category: string
          category_label: Json
          channel: string
          created_at: string
          first_staff_reply_at: string
          id: string
          is_test: boolean
          language: string
          last_message_at: string
          message_count: number
          requester_id: string
          requester_name: string
          requester_side: string
          restricted: boolean
          status: string
          subject: string
          ticket_no: string
          total_count: number
          waiting_since: string
        }[]
      }
      admin_support_prepare_upload: {
        Args: {
          p_bytes: number
          p_duration_ms?: number
          p_kind: string
          p_mime: string
          p_ticket_id: string
        }
        Returns: Json
      }
      admin_support_priorities: { Args: { p_ids: string[] }; Returns: Json }
      admin_support_reassign: {
        Args: { p_assignee_id: string; p_ticket_id: string }
        Returns: undefined
      }
      admin_support_reply: {
        Args: {
          p_attachment_ids?: string[]
          p_body: string
          p_internal?: boolean
          p_ticket_id: string
        }
        Returns: Json
      }
      admin_support_reveal_contact: {
        Args: { p_field: string; p_ticket_id: string }
        Returns: Json
      }
      admin_support_set_contact: {
        Args: { p_email: string; p_phone: string }
        Returns: undefined
      }
      admin_support_set_hours: { Args: { p_hours: Json }; Returns: undefined }
      admin_support_set_rollout: {
        Args: { p_rollout: string; p_test_profile_ids?: string[] }
        Returns: undefined
      }
      admin_support_set_status: {
        Args: { p_note?: string; p_status: string; p_ticket_id: string }
        Returns: Json
      }
      admin_support_settings: { Args: never; Returns: Json }
      admin_vendor_private: {
        Args: { p_ids: string[] }
        Returns: {
          address_line: string
          area: string
          id: string
          landmark: string
          owner_email: string
          pan: string
          phone: string
          postal_code: string
          whatsapp: string
        }[]
      }
      admin_whoami: {
        Args: never
        Returns: {
          email: string
          full_name: string
          id: string
          is_admin: boolean
          role: Database["public"]["Enums"]["admin_role_type"]
        }[]
      }
      am_cancel_callback: { Args: { p_id: string }; Returns: undefined }
      am_mark_read: { Args: never; Returns: undefined }
      am_request_callback: {
        Args: { p_date: string; p_note?: string | null; p_window: string }
        Returns: string
      }
      am_send: { Args: { p_body: string }; Returns: string }
      anonymize_account: { Args: { p_user: string }; Returns: undefined }
      approve_ad_campaign: {
        Args: { p_ad_id: string; p_note?: string }
        Returns: string
      }
      approve_vendor_content: {
        Args: { target_id: string; target_table: string }
        Returns: undefined
      }
      approve_vendor_videos_bulk: {
        Args: { p_vendor: string }
        Returns: number
      }
      archive_ad_campaign: { Args: { p_ad_id: string }; Returns: undefined }
      attributes_search_text: { Args: { p: Json }; Returns: string }
      autopay_charge: { Args: { p_amount_paise: number; p_payment_ref: string; p_sub_id: string }; Returns: Json }
      autopay_gateway_plan: {
        Args: { p_amount_paise: number; p_cycle: string; p_mode: string; p_plan: string }
        Returns: string
      }
      autopay_gateway_plan_save: {
        Args: {
          p_amount_paise: number
          p_cycle: string
          p_list_rupees: number
          p_mode: string
          p_plan: string
          p_razorpay_plan_id: string
        }
        Returns: string
      }
      autopay_incident: { Args: { p_detail: Json; p_kind: string; p_sub_id: string }; Returns: string }
      autopay_mandate_create: {
        Args: {
          p_amount_paise: number
          p_cycle: string
          p_first_order_ref: string
          p_list_rupees: number
          p_mode: string
          p_plan: string
          p_start_at: string
          p_sub_id: string
          p_vendor: string
        }
        Returns: string
      }
      autopay_mandate_event: {
        Args: { p_charge_at?: string; p_method?: string; p_status: string; p_sub_id: string }
        Returns: Json
      }
      autopay_vendor_open: { Args: { p_vendor: string }; Returns: Json }
      billing_dispute_event: { Args: { p_detail: Json; p_event: string; p_payment_ref: string }; Returns: string }
      billing_reconcile_candidates: {
        Args: { p_limit?: number }
        Returns: {
          created_at: string
          order_id: string
          payment_mode: string
          vendor_id: string
        }[]
      }
      billing_reconcile_mark: { Args: { p_order_ref: string }; Returns: undefined }
      block_account_from_review: {
        Args: {
          p_profile_id: string
          p_reason_id: string
          p_resume?: boolean
          p_review_id: string
          p_side: string
        }
        Returns: undefined
      }
      blog_assert_slug: {
        Args: { p_id: string; p_slug: string }
        Returns: string
      }
      blog_blocks_valid: { Args: { p_blocks: Json }; Returns: boolean }
      blog_inline_text: { Args: { p_html: string }; Returns: string }
      blog_read_time: { Args: { p_blocks: Json }; Returns: string }
      blog_read_time_markdown: { Args: { p_body: string }; Returns: string }
      blog_slugify: { Args: { p_text: string }; Returns: string }
      blog_word_count: { Args: { p_blocks: Json }; Returns: number }
      build_video_search_text: {
        Args: { v: Database["public"]["Tables"]["product_videos"]["Row"] }
        Returns: string
      }
      buyer_cold_start_embedding: {
        Args: { p_buyer_id: string }
        Returns: unknown
      }
      buyer_taste_embedding: { Args: { p_buyer_id: string }; Returns: unknown }
      cache_query_embedding: {
        Args: { p_embedding: string; p_query: string }
        Returns: boolean
      }
      call_buyer_contact: {
        Args: { p_buyer_id: string }
        Returns: {
          full_name: string
          phone: string
        }[]
      }
      call_vendor_contact: {
        Args: { p_vendor_id: string }
        Returns: {
          brand_name: string
          phone: string
          whatsapp: string
        }[]
      }
      cancel_account_deletion: { Args: never; Returns: Json }
      category_for_import: { Args: { p_name: string }; Returns: string }
      certificate_apply: {
        Args: {
          p_courier?: string
          p_from: string[]
          p_id: string
          p_notify_body?: string
          p_notify_title?: string
          p_reason?: string
          p_to: string
          p_tracking?: string
        }
        Returns: string
      }
      certificate_cancel_order: {
        Args: { p_ad_certificate_id: string; p_reason: string }
        Returns: string
      }
      certificate_dispatch: {
        Args: {
          p_ad_certificate_id: string
          p_courier: string
          p_tracking: string
        }
        Returns: string
      }
      certificate_fulfiller: { Args: never; Returns: boolean }
      certificate_mark_delivered: {
        Args: { p_ad_certificate_id: string }
        Returns: string
      }
      certificate_mark_printed: {
        Args: { p_ad_certificate_id: string }
        Returns: string
      }
      certificate_mark_returned: {
        Args: { p_ad_certificate_id: string; p_reason: string }
        Returns: string
      }
      complete_account_deletion: {
        Args: { p_request: string }
        Returns: string
      }
      confirm_account_deletion: { Args: { p_code: string }; Returns: Json }
      country_code_for: { Args: { p: string }; Returns: string }
      crm_add_follow_up: {
        Args: { p_due: string; p_id: string; p_note?: string | null }
        Returns: string
      }
      crm_add_lead: {
        Args: { p_buyer_name?: string | null; p_tags?: string[]; p_title: string; p_value?: number | null }
        Returns: string
      }
      crm_add_note: { Args: { p_body: string; p_id: string }; Returns: string }
      crm_analytics: { Args: { p_days?: number }; Returns: Json }
      crm_delete_follow_up: { Args: { p_follow_up: string }; Returns: undefined }
      crm_delete_lead: { Args: { p_id: string }; Returns: undefined }
      crm_stage_rank: { Args: { p_stage: string }; Returns: number }
      crm_tags_ok: { Args: { p: string[] }; Returns: boolean }
      crm_track: { Args: { p_rfq: string }; Returns: string }
      crm_update_follow_up: {
        Args: { p_done?: boolean | null; p_due?: string | null; p_follow_up: string }
        Returns: undefined
      }
      crm_update_lead: { Args: { p_id: string; p_patch: Json }; Returns: undefined }
      csp_report_ingest: { Args: { p_reports: Json }; Returns: undefined }
      discard_account_deletion_code: {
        Args: { p_request: string }
        Returns: undefined
      }
      discount_check: {
        Args: {
          p_ad_rupees?: number
          p_certificate_rupees?: number
          p_code: string
          p_order_kind: string
          p_plan_id?: string
          p_plan_rupees?: number
          p_vendor: string
        }
        Returns: Json
      }
      discount_confirm: {
        Args: { p_order_ref: string; p_redemption: string }
        Returns: Json
      }
      discount_release: {
        Args: { p_order_ref: string; p_redemption: string }
        Returns: Json
      }
      discount_reserve: {
        Args: {
          p_ad_rupees?: number
          p_certificate_rupees?: number
          p_code: string
          p_expected_rupees?: number
          p_order_kind: string
          p_order_ref: string
          p_plan_id?: string
          p_plan_rupees?: number
          p_vendor: string
        }
        Returns: Json
      }
      drain_vendor_catalog_recompute: {
        Args: { p_limit?: number }
        Returns: number
      }
      embed_query_rate_check: {
        Args: {
          p_global_limit?: number
          p_global_window_secs?: number
          p_ip: string
          p_ip_limit?: number
          p_ip_window_secs?: number
        }
        Returns: boolean
      }
      embedding_jobs_archive: { Args: { p_msg_id: number }; Returns: boolean }
      embedding_jobs_read: {
        Args: { batch_size?: number; vt?: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      embedding_jobs_set_vt: {
        Args: { p_msg_id: number; p_vt: number }
        Returns: boolean
      }
      embedding_pipeline_health: {
        Args: never
        Returns: {
          oldest_job_age: string
          products_missing: number
          queue_depth: number
          reason: string
          rfqs_missing: number
          status: string
          vault_secret_ok: boolean
          videos_missing: number
          worker_last_failure: string
          worker_last_run: string
        }[]
      }
      expire_subscriptions: { Args: never; Returns: number }
      faq_translations_valid: { Args: { p: Json }; Returns: boolean }
      feature_on: { Args: { p_key: string }; Returns: boolean }
      feature_on_for: { Args: { p_key: string; p_profile: string }; Returns: boolean }
      featured_listings: {
        Args: { p_category: string; p_session?: string }
        Returns: Json
      }
      featured_listings_on: { Args: never; Returns: boolean }
      for_you_products: {
        Args: { match_count?: number; p_buyer_id: string }
        Returns: {
          distance: number
          id: string
          source: string
        }[]
      }
      get_vendor_plan: { Args: { v?: string }; Returns: Json }
      grant_ad_verification: {
        Args: { exp: string; src: string; v: string }
        Returns: undefined
      }
      gstin_is_valid: { Args: { p_gstin: string }; Returns: boolean }
      halfvec_scale: { Args: { k: number; v: unknown }; Returns: unknown }
      has_query_embedding: { Args: { p_query: string }; Returns: boolean }
      image_search_rate_check: {
        Args: {
          p_global_limit?: number
          p_global_window_secs?: number
          p_ip: string
          p_ip_limit?: number
          p_ip_window_secs?: number
          p_user_id?: string
        }
        Returns: boolean
      }
      immutable_array_to_string: {
        Args: { arr: string[]; sep: string }
        Returns: string
      }
      import_products: {
        Args: { p_as_draft?: boolean; p_file_name?: string; p_rows: Json }
        Returns: Json
      }
      increment_product_enquiry: { Args: { p: string }; Returns: undefined }
      increment_product_view: { Args: { p: string }; Returns: undefined }
      increment_video_view: { Args: { p: string }; Returns: undefined }
      is_ad_eligible: {
        Args: {
          a: Database["public"]["Tables"]["advertisements"]["Row"]
          p_categories?: string[]
          p_city?: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_conversation_member: { Args: { cid: string }; Returns: boolean }
      issue_account_deletion_code: {
        Args: { p_channels: string[]; p_user: string }
        Returns: Json
      }
      lead_cap_used: {
        Args: { p_since: string; p_vendor: string }
        Returns: number
      }
      lead_digest_run: { Args: never; Returns: Json }
      log_call: {
        Args: { p_product_context?: string; p_vendor_id: string }
        Returns: Json
      }
      log_engagement_event: {
        Args: {
          p_ad_id?: string
          p_cta_name?: string
          p_event_type: string
          p_product_id?: string
          p_query_text?: string
          p_session_id?: string
          p_source?: string
          p_vendor_id?: string
        }
        Returns: undefined
      }
      log_featured_impressions: {
        Args: { p_items: Json; p_session?: string }
        Returns: number
      }
      match_products: {
        Args: {
          boost_weight?: number
          match_count?: number
          max_distance?: number
          query: string
          query_embedding?: unknown
        }
        Returns: {
          boost_tier: number
          fts_rank: number
          id: string
          score: number
          vec_rank: number
        }[]
      }
      match_rfq_vendors: {
        Args: { match_count?: number; p_rfq_id: string }
        Returns: {
          category_match: boolean
          score: number
          similarity: number
          vendor_id: string
        }[]
      }
      match_vendor_rfqs: {
        Args: { match_count?: number; p_vendor_id: string }
        Returns: {
          category_match: boolean
          rfq_id: string
          score: number
          similarity: number
        }[]
      }
      match_videos: {
        Args: { match_count?: number; p_video_id: string }
        Returns: {
          distance: number
          id: string
        }[]
      }
      my_account_manager: { Args: never; Returns: Json }
      my_autopay: { Args: never; Returns: Json }
      my_contact_channels: { Args: never; Returns: Json }
      my_contact_info: {
        Args: never
        Returns: {
          email: string
          phone: string
        }[]
      }
      my_feature_flags: {
        Args: never
        Returns: {
          enabled: boolean
          key: string
        }[]
      }
      my_lead_alerts: { Args: { p_limit?: number }; Returns: Json }
      my_overseas_tier: { Args: never; Returns: string }
      my_product_cap: { Args: never; Returns: Json }
      my_vendor_private: {
        Args: never
        Returns: {
          address_line: string
          area: string
          landmark: string
          owner_email: string
          pan: string
          phone: string
          postal_code: string
          whatsapp: string
        }[]
      }
      my_visibility: { Args: { p_days?: number }; Returns: Json }
      next_invoice_number: { Args: never; Returns: string }
      normalise_search_query: { Args: { q: string }; Returns: string }
      notification_claim: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          body: string
          channel: string
          cta_label: string
          cta_path: string
          id: string
          payload: Json
          sms_dlt_template_id: string
          subject: string
          template_key: string
          to_address: string
          wa_language: string
          wa_params: string[]
          wa_template: string
        }[]
      }
      notification_dispatch_heartbeat: {
        Args: {
          p_claimed: number
          p_configured: Json
          p_failed: number
          p_sent: number
        }
        Returns: undefined
      }
      notification_mark: {
        Args: {
          p_error?: string
          p_id: string
          p_outcome: string
          p_provider_id?: string
        }
        Returns: string
      }
      notify: {
        Args: {
          p_body?: string
          p_conversation_id?: string
          p_kind: string
          p_profile_id: string
          p_title: string
        }
        Returns: undefined
      }
      notify_deliver: {
        Args: {
          p_channels?: string[]
          p_dedupe_key?: string
          p_payload: Json
          p_profile: string
          p_template: string
        }
        Returns: Json
      }
      notify_embedding_alert_webhook: {
        Args: { p_queue_depth?: number; p_reason: string; p_status: string }
        Returns: boolean
      }
      overseas_lead_count: { Args: never; Returns: Json }
      owns_product: { Args: { pid: string }; Returns: boolean }
      owns_rfq: { Args: { rid: string }; Returns: boolean }
      pause_ad_campaign_by_admin: {
        Args: { p_ad_id: string; p_note?: string; p_reason_code: string }
        Returns: undefined
      }
      pause_ad_campaign_by_vendor: {
        Args: { p_ad_id: string; p_reason_code?: string }
        Returns: undefined
      }
      payment_event_finish: { Args: { p_detail: Json; p_event_id: string; p_outcome: string }; Returns: undefined }
      payment_event_record: {
        Args: {
          p_event: string
          p_event_id: string
          p_order_ref: string
          p_payload_sha256: string
          p_payment_ref: string
          p_refund_ref: string
          p_source: string
        }
        Returns: Json
      }
      process_due_account_deletions: {
        Args: { p_min_overdue?: string }
        Returns: number
      }
      prune_search_query_embeddings: {
        Args: {
          p_max_age_days?: number
          p_max_rows?: number
          p_min_hits?: number
        }
        Returns: number
      }
      recompute_vendor_catalog_embedding: {
        Args: { v_id: string }
        Returns: undefined
      }
      record_account_storage_cleanup: {
        Args: { p_error?: string; p_request: string }
        Returns: string
      }
      record_embedding_pipeline_health: { Args: never; Returns: string }
      refund_guarantee_request: { Args: { p_reason?: string }; Returns: Json }
      refund_guarantee_status: { Args: never; Returns: Json }
      regex_probe: {
        Args: { p_pattern: string; p_sample: string }
        Returns: Json
      }
      reject_ad_campaign: {
        Args: { p_ad_id: string; p_note?: string; p_reason_code: string }
        Returns: undefined
      }
      reject_vendor_content: {
        Args: { reason?: string; target_id: string; target_table: string }
        Returns: undefined
      }
      related_products: {
        Args: { match_count?: number; p_id: string }
        Returns: {
          distance: number
          id: string
          is_fallback: boolean
        }[]
      }
      reply_to_product_review: {
        Args: { reply: string; review_id: string }
        Returns: undefined
      }
      reply_to_review: {
        Args: { reply: string; review_id: string }
        Returns: undefined
      }
      request_ad_changes: {
        Args: { p_ad_id: string; p_note?: string; p_reason_code: string }
        Returns: undefined
      }
      resolve_conversation_review: {
        Args: {
          p_reason_id?: string
          p_resume?: boolean
          p_review_id: string
          p_verdict: string
        }
        Returns: undefined
      }
      resubmit_ad_campaign: { Args: { p_ad_id: string }; Returns: undefined }
      resume_ad_campaign: { Args: { p_ad_id: string }; Returns: string }
      rfq_targets_vendor: {
        Args: { p_rfq: string; p_vendor: string }
        Returns: boolean
      }
      search_products: {
        Args: { match_count?: number; query: string }
        Returns: {
          boost_tier: number
          embedding_used: boolean
          fts_rank: number
          id: string
          score: number
          vec_rank: number
        }[]
      }
      search_suggestions: {
        Args: { max_results?: number; q: string }
        Returns: {
          count_hint: number
          kind: string
          label: string
          ref_id: string
          verified: boolean
        }[]
      }
      set_account_status: {
        Args: {
          p_conversation_review_id?: string
          p_new_status: Database["public"]["Enums"]["account_status_type"]
          p_profile_id: string
          p_reason_id: string
          p_source: string
        }
        Returns: undefined
      }
      set_contact_consent: {
        Args: { p_channel: string; p_opted_in: boolean; p_source?: string }
        Returns: undefined
      }
      set_lead_alert_settings: {
        Args: {
          p_category_ids: string[] | null
          p_digest: boolean
          p_instant: boolean
          p_quiet_end: string | null
          p_quiet_start: string | null
        }
        Returns: Json
      }
      set_product_embedding: {
        Args: { p_embedding: string; p_id: string }
        Returns: boolean
      }
      set_rfq_embedding: {
        Args: { p_embedding: string; p_id: string }
        Returns: boolean
      }
      set_vendor_document_verified: {
        Args: { p_doc_id: string; p_reason?: string; p_verified: boolean }
        Returns: undefined
      }
      set_video_embedding: {
        Args: { p_embedding: string; p_id: string }
        Returns: boolean
      }
      spotlight_listings: {
        Args: { p_category?: string; p_limit?: number; p_session?: string }
        Returns: Json
      }
      state_code_for: { Args: { p: string }; Returns: string }
      state_name_key: { Args: { p: string }; Returns: string }
      submit_report: {
        Args: {
          p_conversation_id: string
          p_message_id: string
          p_reported_reason?: string
        }
        Returns: undefined
      }
      subscription_activate: {
        Args: { p_cycle: string; p_plan: string; p_vendor: string }
        Returns: Json
      }
      subscription_change_preview: {
        Args: { p_cycle: string; p_plan: string }
        Returns: Json
      }
      subscription_checkout_gate: { Args: { p_vendor: string }; Returns: Json }
      subscription_fulfil: { Args: { p_order_ref: string; p_payment_ref: string; p_source: string }; Returns: Json }
      subscription_quote_for: {
        Args: { p_cycle: string; p_plan: string; p_vendor: string }
        Returns: Json
      }
      subscription_refund_event: {
        Args: {
          p_amount_paise: number
          p_payment_ref: string
          p_refund_ref: string
          p_status: string
        }
        Returns: Json
      }
      support_attachment_checked: {
        Args: { p_attachment_id: string; p_clean: boolean }
        Returns: undefined
      }
      support_attachment_read_allowed: {
        Args: { p_name: string }
        Returns: boolean
      }
      support_attachment_upload_allowed: {
        Args: { p_name: string }
        Returns: boolean
      }
      support_callback_slots: { Args: { p_days?: number }; Returns: Json }
      support_end_chat: { Args: { p_ticket_id: string }; Returns: Json }
      support_mark_read: { Args: { p_ticket_id: string }; Returns: undefined }
      support_my_requests: { Args: { p_limit?: number }; Returns: Json }
      support_post_message: {
        Args: {
          p_attachment_ids?: string[]
          p_body?: string
          p_ticket_id: string
        }
        Returns: Json
      }
      support_prepare_upload: {
        Args: {
          p_bytes: number
          p_duration_ms?: number
          p_kind: string
          p_mime: string
          p_ticket_id: string
        }
        Returns: Json
      }
      support_receipt_record: {
        Args: { p_detail?: string; p_sent: boolean; p_ticket_id: string }
        Returns: undefined
      }
      support_receipt_target: {
        Args: { p_ticket_no: string; p_user: string }
        Returns: Json
      }
      support_reopen: { Args: { p_ticket_id: string }; Returns: Json }
      support_report_fraud: {
        Args: {
          p_amount_inr?: number
          p_city?: string
          p_description: string
          p_incident_date?: string
          p_language?: string
          p_reported_entity_id?: string
          p_reported_entity_type?: string
          p_reported_name?: string
          p_reported_phone?: string
          p_reported_url?: string
        }
        Returns: Json
      }
      support_request_callback: {
        Args: {
          p_category: string
          p_date: string
          p_language?: string
          p_note?: string
          p_phone: string
          p_window_start: string
        }
        Returns: Json
      }
      support_request_detail: { Args: { p_ticket_no: string }; Returns: Json }
      support_start_chat: {
        Args: {
          p_body: string
          p_category: string
          p_entity_id?: string
          p_entity_type?: string
          p_language?: string
        }
        Returns: Json
      }
      support_status: { Args: never; Returns: Json }
      support_submit_feedback: {
        Args: {
          p_body: string
          p_kind: string
          p_language?: string
          p_page?: string
        }
        Returns: Json
      }
      support_sweep_purge: { Args: { p_ticket_ids: string[] }; Returns: number }
      support_sweep_run: { Args: { p_limit?: number }; Returns: Json }
      suspend_ad_campaign: {
        Args: { p_ad_id: string; p_note?: string; p_reason_code: string }
        Returns: undefined
      }
      sweep_ad_schedules: {
        Args: never
        Returns: {
          expired: number
          promoted: number
        }[]
      }
      user_has_password: { Args: { target_email: string }; Returns: boolean }
      vendor_account_in_good_standing: {
        Args: { p_vendor: string }
        Returns: boolean
      }
      vendor_buyer_geography: {
        Args: { p_days?: number; v?: string }
        Returns: Json
      }
      vendor_cap_plan: { Args: { p_vendor: string }; Returns: string }
      vendor_entitlements: { Args: { p_vendor?: string }; Returns: Json }
      vendor_keep_products: { Args: { p_ids: string[] }; Returns: Json }
      vendor_quoted_rfq: { Args: { p_rfq: string }; Returns: boolean }
      vendor_set_live_products: { Args: { p_ids: string[] }; Returns: Json }
      vendor_type_from_labels: {
        Args: { p_business_type: string; p_labels: string[] }
        Returns: {
          capabilities: string[]
          primary_type: string
        }[]
      }
    }
    Enums: {
      account_status_type: "active" | "suspended" | "deleted"
      admin_role_type:
        | "super_admin"
        | "product_moderator"
        | "vendor_ops"
        | "ads_moderator"
        | "finance_admin"
        | "support"
        | "manager"
        | "account_manager"
      product_status: "draft" | "under_review" | "live" | "rejected" | "paused"
      quote_status: "pending" | "shortlisted" | "accepted" | "rejected"
      rfq_status: "active" | "closed"
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
      account_status_type: ["active", "suspended", "deleted"],
      admin_role_type: [
        "super_admin",
        "product_moderator",
        "vendor_ops",
        "ads_moderator",
        "finance_admin",
        "support",
        "manager",
        "account_manager",
      ],
      product_status: ["draft", "under_review", "live", "rejected", "paused"],
      quote_status: ["pending", "shortlisted", "accepted", "rejected"],
      rfq_status: ["active", "closed"],
    },
  },
} as const
