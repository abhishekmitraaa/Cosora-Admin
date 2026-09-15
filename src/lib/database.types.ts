export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]
/*
 * GENERATED from the live schema of Supabase project vxdhhgdfubqedfpwfyrb.
 * Do not hand-edit. Regenerate after every migration.
 *
 * This file was previously generated-plus-hand-maintained, and the hand-written
 * region went stale: it still typed `vendor_profiles.account_status`, a column
 * migration 20260801095820 had already DROPPED. TypeScript therefore accepted
 * queries that were 400-ing at runtime on Vendors, VendorDetail, Products and
 * Ads. Regenerating is what caught it; keep it generated.
 */
export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_suspensions: {
        Row: {
          active: boolean
          conversation_review_id: string | null
          id: string
          profile_id: string
          reason_id: string | null
          reinstated_at: string | null
          reinstated_by: string | null
          source: string
          suspended_at: string
          suspended_by: string | null
        }
        Insert: {
          active?: boolean
          conversation_review_id?: string | null
          id?: string
          profile_id: string
          reason_id?: string | null
          reinstated_at?: string | null
          reinstated_by?: string | null
          source: string
          suspended_at?: string
          suspended_by?: string | null
        }
        Update: {
          active?: boolean
          conversation_review_id?: string | null
          id?: string
          profile_id?: string
          reason_id?: string | null
          reinstated_at?: string | null
          reinstated_by?: string | null
          source?: string
          suspended_at?: string
          suspended_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_suspensions_conversation_review_id_fkey"
            columns: ["conversation_review_id"]
            isOneToOne: false
            referencedRelation: "conversation_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_suspensions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_suspensions_reason_id_fkey"
            columns: ["reason_id"]
            isOneToOne: false
            referencedRelation: "chat_block_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_suspensions_reinstated_by_fkey"
            columns: ["reinstated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_suspensions_suspended_by_fkey"
            columns: ["suspended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_orders: {
        Row: {
          amount: number
          created_at: string
          order_id: string
          paid_at: string | null
          spec: Json
          status: string
          vendor_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          order_id: string
          paid_at?: string | null
          spec: Json
          status?: string
          vendor_id: string
        }
        Update: {
          amount?: number
          created_at?: string
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
      buyer_profiles: {
        Row: {
          business_city: string | null
          business_type: string | null
          city: string | null
          company: string | null
          country: string | null
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
          street: string | null
          website: string | null
        }
        Insert: {
          business_city?: string | null
          business_type?: string | null
          city?: string | null
          company?: string | null
          country?: string | null
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
          street?: string | null
          website?: string | null
        }
        Update: {
          business_city?: string | null
          business_type?: string | null
          city?: string | null
          company?: string | null
          country?: string | null
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
      chat_block_reasons: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          id: string
          reason: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          id?: string
          reason: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_block_reasons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_reviews: {
        Row: {
          conversation_id: string
          created_at: string
          flagged_message_id: string | null
          id: string
          matched_pattern_id: string | null
          reason_id: string | null
          reported_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          status: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          flagged_message_id?: string | null
          id?: string
          matched_pattern_id?: string | null
          reason_id?: string | null
          reported_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source: string
          status?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          flagged_message_id?: string | null
          id?: string
          matched_pattern_id?: string | null
          reason_id?: string | null
          reported_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_reviews_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_reviews_flagged_message_id_fkey"
            columns: ["flagged_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_reviews_matched_pattern_id_fkey"
            columns: ["matched_pattern_id"]
            isOneToOne: false
            referencedRelation: "flag_patterns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_reviews_reason_id_fkey"
            columns: ["reason_id"]
            isOneToOne: false
            referencedRelation: "chat_block_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
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
      flag_patterns: {
        Row: {
          active: boolean
          added_by: string | null
          created_at: string
          id: string
          label: string
          pattern: string
        }
        Insert: {
          active?: boolean
          added_by?: string | null
          created_at?: string
          id?: string
          label: string
          pattern: string
        }
        Update: {
          active?: boolean
          added_by?: string | null
          created_at?: string
          id?: string
          label?: string
          pattern?: string
        }
        Relationships: [
          {
            foreignKeyName: "flag_patterns_added_by_fkey"
            columns: ["added_by"]
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
      keyword_blocklist: {
        Row: {
          added_by: string | null
          created_at: string
          id: string
          term: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          id?: string
          term: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          id?: string
          term?: string
        }
        Relationships: [
          {
            foreignKeyName: "keyword_blocklist_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      product_reviews: {
        Row: {
          body: string | null
          buyer_id: string
          created_at: string
          id: string
          photos: string[]
          product_id: string
          rating: number
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
          admin_role: Database["public"]["Enums"]["admin_role_type"] | null
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_admin: boolean
          onboarded: boolean
          phone: string | null
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status_type"]
          active_role?: string
          admin_role?: Database["public"]["Enums"]["admin_role_type"] | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_admin?: boolean
          onboarded?: boolean
          phone?: string | null
        }
        Update: {
          account_status?: Database["public"]["Enums"]["account_status_type"]
          active_role?: string
          admin_role?: Database["public"]["Enums"]["admin_role_type"] | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_admin?: boolean
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
          budget_max: number | null
          budget_min: number | null
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
          product_id: string | null
          product_name: string | null
          quantity: number | null
          search_text: string | null
          sizes_breakdown: Json | null
          status: Database["public"]["Enums"]["rfq_status"]
          title: string
          vendor_id: string | null
        }
        Insert: {
          budget_max?: number | null
          budget_min?: number | null
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
          product_id?: string | null
          product_name?: string | null
          quantity?: number | null
          search_text?: string | null
          sizes_breakdown?: Json | null
          status?: Database["public"]["Enums"]["rfq_status"]
          title: string
          vendor_id?: string | null
        }
        Update: {
          budget_max?: number | null
          budget_min?: number | null
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
          product_id?: string | null
          product_name?: string | null
          quantity?: number | null
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
      subscription_invoices: {
        Row: {
          amount: number
          billing_period_end: string | null
          billing_period_start: string | null
          created_at: string
          currency: string
          gst_amount: number | null
          gst_number: string | null
          id: string
          invoice_number: string | null
          pdf_url: string | null
          plan_id: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_refund_id: string | null
          refund_status: string | null
          refunded_amount: number | null
          refunded_at: string | null
          status: string
          subscription_id: string | null
          tds_amount: number | null
          vendor_id: string
        }
        Insert: {
          amount?: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string
          currency?: string
          gst_amount?: number | null
          gst_number?: string | null
          id?: string
          invoice_number?: string | null
          pdf_url?: string | null
          plan_id?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_refund_id?: string | null
          refund_status?: string | null
          refunded_amount?: number | null
          refunded_at?: string | null
          status?: string
          subscription_id?: string | null
          tds_amount?: number | null
          vendor_id: string
        }
        Update: {
          amount?: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          created_at?: string
          currency?: string
          gst_amount?: number | null
          gst_number?: string | null
          id?: string
          invoice_number?: string | null
          pdf_url?: string | null
          plan_id?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_refund_id?: string | null
          refund_status?: string | null
          refunded_amount?: number | null
          refunded_at?: string | null
          status?: string
          subscription_id?: string | null
          tds_amount?: number | null
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
      subscription_payment_orders: {
        Row: {
          amount: number
          billing_cycle: string
          created_at: string
          gst_number: string | null
          order_id: string
          paid_at: string | null
          plan_id: string
          status: string
          vendor_id: string
        }
        Insert: {
          amount: number
          billing_cycle?: string
          created_at?: string
          gst_number?: string | null
          order_id: string
          paid_at?: string | null
          plan_id: string
          status?: string
          vendor_id: string
        }
        Update: {
          amount?: number
          billing_cycle?: string
          created_at?: string
          gst_number?: string | null
          order_id?: string
          paid_at?: string | null
          plan_id?: string
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
          profile_score: number
          rating_avg: number
          recommended_product_ids: string[]
          regional: Json | null
          reviews_count: number
          social: Json | null
          state: string | null
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
          profile_score?: number
          rating_avg?: number
          recommended_product_ids?: string[]
          regional?: Json | null
          reviews_count?: number
          social?: Json | null
          state?: string | null
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
          profile_score?: number
          rating_avg?: number
          recommended_product_ids?: string[]
          regional?: Json | null
          reviews_count?: number
          social?: Json | null
          state?: string | null
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
          plan_id: string
          real_time_alerts_enabled: boolean
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
          plan_id: string
          real_time_alerts_enabled?: boolean
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
          plan_id?: string
          real_time_alerts_enabled?: boolean
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
      account_is_active: { Args: { p_id: string }; Returns: boolean }
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
      admin_role: {
        Args: never
        Returns: Database["public"]["Enums"]["admin_role_type"]
      }
      admin_role_values: { Args: never; Returns: string[] }
      approve_ad_campaign: {
        Args: { p_ad_id: string; p_note?: string }
        Returns: string
      }
      approve_vendor_content: {
        Args: { target_id: string; target_table: string }
        Returns: undefined
      }
      approve_vendor_content_bulk: {
        Args: { target: string }
        Returns: undefined
      }
      archive_ad_campaign: { Args: { p_ad_id: string }; Returns: undefined }
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
      next_invoice_number: { Args: never; Returns: string }
      normalise_search_query: { Args: { q: string }; Returns: string }
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
      notify_embedding_alert_webhook: {
        Args: { p_queue_depth?: number; p_reason: string; p_status: string }
        Returns: boolean
      }
      owns_product: { Args: { pid: string }; Returns: boolean }
      owns_rfq: { Args: { rid: string }; Returns: boolean }
      pause_ad_campaign_by_admin: {
        Args: { p_ad_id: string; p_reason_code: string }
        Returns: undefined
      }
      pause_ad_campaign_by_vendor: {
        Args: { p_ad_id: string; p_reason_code?: string }
        Returns: undefined
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
      record_embedding_pipeline_health: { Args: never; Returns: string }
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
      submit_report: {
        Args: {
          p_conversation_id: string
          p_message_id: string
          p_reported_reason?: string
        }
        Returns: undefined
      }
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
    }
    Enums: {
      account_status_type: "active" | "suspended"
      admin_role_type:
        | "super_admin"
        | "product_moderator"
        | "vendor_ops"
        | "ads_moderator"
        | "finance_admin"
        | "support"
      product_status: "draft" | "under_review" | "live" | "rejected"
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
      account_status_type: ["active", "suspended"],
      admin_role_type: [
        "super_admin",
        "product_moderator",
        "vendor_ops",
        "ads_moderator",
        "finance_admin",
        "support",
      ],
      product_status: ["draft", "under_review", "live", "rejected"],
      quote_status: ["pending", "shortlisted", "accepted", "rejected"],
      rfq_status: ["active", "closed"],
    },
  },
} as const
