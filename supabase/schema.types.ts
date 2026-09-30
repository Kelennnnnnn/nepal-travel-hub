export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agencies: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          description: string
          display_name: string
          district: string | null
          email: string | null
          id: string
          legal_name: string
          payout_account_reference: string | null
          phone: string | null
          slug: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          description?: string
          display_name: string
          district?: string | null
          email?: string | null
          id?: string
          legal_name: string
          payout_account_reference?: string | null
          phone?: string | null
          slug: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          description?: string
          display_name?: string
          district?: string | null
          email?: string | null
          id?: string
          legal_name?: string
          payout_account_reference?: string | null
          phone?: string | null
          slug?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      agency_documents: {
        Row: {
          agency_id: string
          created_at: string
          document_type: string
          expires_at: string | null
          id: string
          mime_type: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          size_bytes: number
          status: string
          storage_path: string
          superseded_at: string | null
        }
        Insert: {
          agency_id: string
          created_at?: string
          document_type: string
          expires_at?: string | null
          id?: string
          mime_type: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          size_bytes: number
          status?: string
          storage_path: string
          superseded_at?: string | null
        }
        Update: {
          agency_id?: string
          created_at?: string
          document_type?: string
          expires_at?: string | null
          id?: string
          mime_type?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          size_bytes?: number
          status?: string
          storage_path?: string
          superseded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_documents_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_invitations: {
        Row: {
          accepted_at: string | null
          agency_id: string
          agency_role: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          agency_id: string
          agency_role: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          agency_id?: string
          agency_role?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_invitations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_status_history: {
        Row: {
          agency_id: string
          changed_by: string | null
          created_at: string
          from_status: string | null
          id: string
          reason: string | null
          to_status: string
        }
        Insert: {
          agency_id: string
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          reason?: string | null
          to_status: string
        }
        Update: {
          agency_id?: string
          changed_by?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          reason?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_status_history_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_users: {
        Row: {
          accepted_at: string | null
          agency_id: string
          agency_role: string
          id: string
          invited_at: string
          invited_by: string | null
          removed_at: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          agency_id: string
          agency_role: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          removed_at?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          agency_id?: string
          agency_role?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          removed_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_users_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_verification: {
        Row: {
          agency_id: string
          id: string
          info_requested_note: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          id?: string
          info_requested_note?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          id?: string
          info_requested_note?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_verification_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: true
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          id: string
          ip_address: unknown
          request_id: string | null
          resource_id: string | null
          resource_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          id?: string
          ip_address?: unknown
          request_id?: string | null
          resource_id?: string | null
          resource_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          id?: string
          ip_address?: unknown
          request_id?: string | null
          resource_id?: string | null
          resource_type?: string
        }
        Relationships: []
      }
      blackout_dates: {
        Row: {
          blackout_date: string
          created_at: string
          created_by: string | null
          id: string
          listing_id: string
          reason: string | null
        }
        Insert: {
          blackout_date: string
          created_at?: string
          created_by?: string | null
          id?: string
          listing_id: string
          reason?: string | null
        }
        Update: {
          blackout_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          listing_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blackout_dates_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_guests: {
        Row: {
          booking_id: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          date_of_birth: string | null
          full_name: string
          id: string
          is_primary: boolean
          passport_number_encrypted: string | null
        }
        Insert: {
          booking_id: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          date_of_birth?: string | null
          full_name: string
          id?: string
          is_primary?: boolean
          passport_number_encrypted?: string | null
        }
        Update: {
          booking_id?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          date_of_birth?: string | null
          full_name?: string
          id?: string
          is_primary?: boolean
          passport_number_encrypted?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_guests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_items: {
        Row: {
          booking_id: string
          description: string
          id: string
          line_total: number
          quantity: number
          quote_item_id: string | null
          unit_price: number
        }
        Insert: {
          booking_id: string
          description: string
          id?: string
          line_total: number
          quantity: number
          quote_item_id?: string | null
          unit_price: number
        }
        Update: {
          booking_id?: string
          description?: string
          id?: string
          line_total?: number
          quantity?: number
          quote_item_id?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_items_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_items_quote_item_id_fkey"
            columns: ["quote_item_id"]
            isOneToOne: false
            referencedRelation: "quote_items"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_quotes: {
        Row: {
          agency_balance: number
          agency_id: string
          balance_payment_terms_snapshot: Json
          cancellation_policy_snapshot: Json
          created_at: string
          currency: string
          departure_id: string
          expires_at: string
          id: string
          inventory_reservation_id: string
          listing_id: string
          participant_count: number
          platform_fee: number
          platform_fee_percent: number
          pricing_version: Json
          product_value: number
          status: string
          traveler_id: string
        }
        Insert: {
          agency_balance: number
          agency_id: string
          balance_payment_terms_snapshot?: Json
          cancellation_policy_snapshot: Json
          created_at?: string
          currency: string
          departure_id: string
          expires_at: string
          id?: string
          inventory_reservation_id: string
          listing_id: string
          participant_count: number
          platform_fee: number
          platform_fee_percent: number
          pricing_version?: Json
          product_value: number
          status?: string
          traveler_id: string
        }
        Update: {
          agency_balance?: number
          agency_id?: string
          balance_payment_terms_snapshot?: Json
          cancellation_policy_snapshot?: Json
          created_at?: string
          currency?: string
          departure_id?: string
          expires_at?: string
          id?: string
          inventory_reservation_id?: string
          listing_id?: string
          participant_count?: number
          platform_fee?: number
          platform_fee_percent?: number
          pricing_version?: Json
          product_value?: number
          status?: string
          traveler_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_quotes_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_quotes_departure_id_fkey"
            columns: ["departure_id"]
            isOneToOne: false
            referencedRelation: "departures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_quotes_inventory_reservation_id_fkey"
            columns: ["inventory_reservation_id"]
            isOneToOne: false
            referencedRelation: "inventory_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_quotes_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_status_history: {
        Row: {
          booking_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json
        }
        Insert: {
          booking_id: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
        }
        Update: {
          booking_id?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "booking_status_history_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          agency_id: string
          balance_method: string | null
          balance_status: string
          booking_ref: string
          booking_status: string
          cancellation_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          departure_id: string
          id: string
          listing_id: string
          participant_count: number
          payment_status: string
          quote_id: string
          refund_status: string
          settlement_status: string
          traveler_id: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          balance_method?: string | null
          balance_status?: string
          booking_ref?: string
          booking_status?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          departure_id: string
          id?: string
          listing_id: string
          participant_count: number
          payment_status?: string
          quote_id: string
          refund_status?: string
          settlement_status?: string
          traveler_id: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          balance_method?: string | null
          balance_status?: string
          booking_ref?: string
          booking_status?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          departure_id?: string
          id?: string
          listing_id?: string
          participant_count?: number
          payment_status?: string
          quote_id?: string
          refund_status?: string
          settlement_status?: string
          traveler_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_departure_id_fkey"
            columns: ["departure_id"]
            isOneToOne: false
            referencedRelation: "departures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "booking_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_submissions: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          status: string
          subject: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          status?: string
          subject?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          status?: string
          subject?: string
        }
        Relationships: []
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string
          participant_role: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string
          participant_role: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string
          participant_role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          agency_id: string
          booking_id: string | null
          created_at: string
          id: string
          last_message_at: string | null
          listing_id: string | null
          subject: string | null
          traveler_id: string | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          booking_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          listing_id?: string | null
          subject?: string | null
          traveler_id?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          booking_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          listing_id?: string | null
          subject?: string | null
          traveler_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      departures: {
        Row: {
          agency_id: string
          created_at: string
          cutoff_at: string | null
          departure_date: string
          id: string
          listing_id: string
          status: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          cutoff_at?: string | null
          departure_date: string
          id?: string
          listing_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          cutoff_at?: string | null
          departure_date?: string
          id?: string
          listing_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departures_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departures_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_events: {
        Row: {
          aggregate_id: string
          aggregate_type: string
          claimed_at: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
        }
        Insert: {
          aggregate_id: string
          aggregate_type: string
          claimed_at?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          processed_at?: string | null
        }
        Update: {
          aggregate_id?: string
          aggregate_type?: string
          claimed_at?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
        }
        Relationships: []
      }
      idempotency_keys: {
        Row: {
          created_at: string
          fn: string
          key: string
          response: Json
          status: number
          user_id: string
        }
        Insert: {
          created_at?: string
          fn: string
          key: string
          response: Json
          status: number
          user_id: string
        }
        Update: {
          created_at?: string
          fn?: string
          key?: string
          response?: Json
          status?: number
          user_id?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          capacity_confirmed: number
          capacity_held: number
          capacity_total: number
          created_at: string
          departure_id: string
          id: string
          updated_at: string
          version: number
        }
        Insert: {
          capacity_confirmed?: number
          capacity_held?: number
          capacity_total: number
          created_at?: string
          departure_id: string
          id?: string
          updated_at?: string
          version?: number
        }
        Update: {
          capacity_confirmed?: number
          capacity_held?: number
          capacity_total?: number
          created_at?: string
          departure_id?: string
          id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_departure_id_fkey"
            columns: ["departure_id"]
            isOneToOne: true
            referencedRelation: "departures"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_reservations: {
        Row: {
          booking_id: string | null
          confirmed_at: string | null
          created_at: string
          expires_at: string
          held_at: string
          id: string
          inventory_id: string
          quantity: number
          released_at: string | null
          status: string
        }
        Insert: {
          booking_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          expires_at: string
          held_at?: string
          id?: string
          inventory_id: string
          quantity: number
          released_at?: string | null
          status?: string
        }
        Update: {
          booking_id?: string | null
          confirmed_at?: string | null
          created_at?: string
          expires_at?: string
          held_at?: string
          id?: string
          inventory_id?: string
          quantity?: number
          released_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reservations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_images: {
        Row: {
          alt_text: string | null
          created_at: string
          height: number | null
          id: string
          listing_id: string
          mime_type: string
          size_bytes: number
          sort_order: number
          storage_path: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          height?: number | null
          id?: string
          listing_id: string
          mime_type: string
          size_bytes: number
          sort_order?: number
          storage_path: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          height?: number | null
          id?: string
          listing_id?: string
          mime_type?: string
          size_bytes?: number
          sort_order?: number
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_images_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          agency_id: string
          base_price: number
          cancellation_policy: Json
          category: string
          created_at: string
          currency: string
          description: string
          difficulty: string | null
          duration_days: number
          duration_label: string
          excludes: string[]
          featured: boolean
          id: string
          images: Json
          includes: string[]
          itinerary: Json
          location: string
          max_participants: number
          rating: number
          review_count: number
          slug: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          base_price: number
          cancellation_policy?: Json
          category: string
          created_at?: string
          currency?: string
          description?: string
          difficulty?: string | null
          duration_days: number
          duration_label: string
          excludes?: string[]
          featured?: boolean
          id?: string
          images?: Json
          includes?: string[]
          itinerary?: Json
          location: string
          max_participants?: number
          rating?: number
          review_count?: number
          slug: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          base_price?: number
          cancellation_policy?: Json
          category?: string
          created_at?: string
          currency?: string
          description?: string
          difficulty?: string | null
          duration_days?: number
          duration_label?: string
          excludes?: string[]
          featured?: boolean
          id?: string
          images?: Json
          includes?: string[]
          itinerary?: Json
          location?: string
          max_participants?: number
          rating?: number
          review_count?: number
          slug?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          created_at: string
          id: string
          message_id: string
          mime_type: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          mime_type: string
          size_bytes: number
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          mime_type?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          read_at: string | null
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
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
        ]
      }
      notification_preferences: {
        Row: {
          balance_due: boolean
          booking_cancel: boolean
          marketing: boolean
          new_booking: boolean
          new_message: boolean
          new_review: boolean
          payout: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_due?: boolean
          booking_cancel?: boolean
          marketing?: boolean
          new_booking?: boolean
          new_message?: boolean
          new_review?: boolean
          payout?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_due?: boolean
          booking_cancel?: boolean
          marketing?: boolean
          new_booking?: boolean
          new_message?: boolean
          new_review?: boolean
          payout?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          attempts: number
          channel: string
          claimed_at: string | null
          created_at: string
          domain_event_id: string
          error_message: string | null
          id: string
          idempotency_key: string
          next_attempt_at: string
          read_at: string | null
          recipient_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          channel: string
          claimed_at?: string | null
          created_at?: string
          domain_event_id: string
          error_message?: string | null
          id?: string
          idempotency_key: string
          next_attempt_at?: string
          read_at?: string | null
          recipient_id: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          channel?: string
          claimed_at?: string | null
          created_at?: string
          domain_event_id?: string
          error_message?: string | null
          id?: string
          idempotency_key?: string
          next_attempt_at?: string
          read_at?: string | null
          recipient_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_domain_event_id_fkey"
            columns: ["domain_event_id"]
            isOneToOne: false
            referencedRelation: "domain_events"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      platform_settings_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          key: string
          new_value: Json
          old_value: Json | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          key: string
          new_value: Json
          old_value?: Json | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          key?: string
          new_value?: Json
          old_value?: Json | null
        }
        Relationships: []
      }
      price_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          departure_id: string | null
          id: string
          listing_id: string
          override_date: string | null
          price: number
          reason: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          departure_id?: string | null
          id?: string
          listing_id: string
          override_date?: string | null
          price: number
          reason?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          departure_id?: string | null
          id?: string
          listing_id?: string
          override_date?: string | null
          price?: number
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_overrides_departure_id_fkey"
            columns: ["departure_id"]
            isOneToOne: false
            referencedRelation: "departures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_overrides_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          full_name: string | null
          id: string
          locale: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quote_items: {
        Row: {
          description: string
          id: string
          item_type: string
          line_total: number
          quantity: number
          quote_id: string
          unit_price: number
        }
        Insert: {
          description: string
          id?: string
          item_type: string
          line_total: number
          quantity: number
          quote_id: string
          unit_price: number
        }
        Update: {
          description?: string
          id?: string
          item_type?: string
          line_total?: number
          quantity?: number
          quote_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "booking_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          window_start?: string
        }
        Relationships: []
      }
      review_photos: {
        Row: {
          created_at: string
          id: string
          mime_type: string
          review_id: string
          size_bytes: number
          sort_order: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          mime_type: string
          review_id: string
          size_bytes: number
          sort_order?: number
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          mime_type?: string
          review_id?: string
          size_bytes?: number
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_photos_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_votes: {
        Row: {
          created_at: string
          id: string
          review_id: string
          user_id: string
          vote: string
        }
        Insert: {
          created_at?: string
          id?: string
          review_id: string
          user_id: string
          vote?: string
        }
        Update: {
          created_at?: string
          id?: string
          review_id?: string
          user_id?: string
          vote?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_votes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          agency_id: string
          agency_responded_at: string | null
          agency_response: string | null
          booking_id: string
          comment: string
          created_at: string
          helpful_count: number
          hidden_at: string | null
          id: string
          is_featured: boolean
          is_flagged: boolean
          listing_id: string
          rating: number
          title: string | null
          traveler_id: string
          traveler_name: string | null
          updated_at: string
        }
        Insert: {
          agency_id: string
          agency_responded_at?: string | null
          agency_response?: string | null
          booking_id: string
          comment: string
          created_at?: string
          helpful_count?: number
          hidden_at?: string | null
          id?: string
          is_featured?: boolean
          is_flagged?: boolean
          listing_id: string
          rating: number
          title?: string | null
          traveler_id: string
          traveler_name?: string | null
          updated_at?: string
        }
        Update: {
          agency_id?: string
          agency_responded_at?: string | null
          agency_response?: string | null
          booking_id?: string
          comment?: string
          created_at?: string
          helpful_count?: number
          hidden_at?: string | null
          id?: string
          is_featured?: boolean
          is_flagged?: boolean
          listing_id?: string
          rating?: number
          title?: string | null
          traveler_id?: string
          traveler_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      seasonal_pricing: {
        Row: {
          created_at: string
          currency: string
          end_date: string
          id: string
          listing_id: string
          price: number
          season_name: string
          start_date: string
        }
        Insert: {
          created_at?: string
          currency?: string
          end_date: string
          id?: string
          listing_id: string
          price: number
          season_name: string
          start_date: string
        }
        Update: {
          created_at?: string
          currency?: string
          end_date?: string
          id?: string
          listing_id?: string
          price?: number
          season_name?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "seasonal_pricing_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      welcome_emails: {
        Row: {
          sent_at: string
          user_id: string
        }
        Insert: {
          sent_at?: string
          user_id: string
        }
        Update: {
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wishlists: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlists_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_agency_member_to_conversation: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: undefined
      }
      admin_reinstate_agency: {
        Args: { p_agency_id: string; p_request_id?: string }
        Returns: undefined
      }
      admin_suspend_agency: {
        Args: { p_agency_id: string; p_reason: string; p_request_id?: string }
        Returns: undefined
      }
      admin_user_directory: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_role?: string
          p_search?: string
        }
        Returns: {
          banned_until: string
          created_at: string
          email: string
          full_name: string
          id: string
          last_sign_in_at: string
          role: string
          total_count: number
        }[]
      }
      admin_user_stats: {
        Args: never
        Returns: {
          admins: number
          agencies: number
          finance: number
          support: number
          suspended: number
          total: number
          travelers: number
        }[]
      }
      agency_is_active: { Args: { target_agency_id: string }; Returns: boolean }
      agency_set_trip_status: {
        Args: { p_booking_id: string; p_status: string }
        Returns: undefined
      }
      agency_team_roster: {
        Args: { p_agency_id: string }
        Returns: {
          accepted_at: string
          agency_role: string
          display_name: string
          email: string
          invited_at: string
          membership_id: string
          user_id: string
        }[]
      }
      assert_valid_transition: {
        Args: {
          p_allowed: Json
          p_column: string
          p_new: string
          p_old: string
        }
        Returns: undefined
      }
      audit_definer_exposure: {
        Args: never
        Returns: {
          arguments: string
          executable_by: string[]
          function_name: string
        }[]
      }
      capacity_available: {
        Args: { inv: Database["public"]["Tables"]["inventory"]["Row"] }
        Returns: number
      }
      change_agency_member_role: {
        Args: { p_agency_id: string; p_role: string; p_user_id: string }
        Returns: undefined
      }
      check_ops_daily_health: { Args: never; Returns: undefined }
      claim_domain_events: {
        Args: { p_limit?: number }
        Returns: {
          aggregate_id: string
          aggregate_type: string
          claimed_at: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "domain_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_pending_notifications: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          channel: string
          claimed_at: string | null
          created_at: string
          domain_event_id: string
          error_message: string | null
          id: string
          idempotency_key: string
          next_attempt_at: string
          read_at: string | null
          recipient_id: string
          sent_at: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      confirm_reservation: {
        Args: { p_booking_id: string; p_reservation_id: string }
        Returns: undefined
      }
      conversation_display_names: {
        Args: { p_conversation_id: string }
        Returns: {
          display_name: string
          participant_role: string
          user_id: string
        }[]
      }
      cron_health: {
        Args: never
        Returns: {
          active: boolean
          is_healthy: boolean
          jobid: number
          jobname: string
          last_end_time: string
          last_start_time: string
          last_status: string
          schedule: string
        }[]
      }
      current_platform_role: { Args: never; Returns: string }
      current_platform_role_unverified: { Args: never; Returns: string }
      delete_my_account: { Args: { p_request_id?: string }; Returns: undefined }
      expire_stale_quotes: { Args: never; Returns: number }
      expire_stale_reservations: { Args: never; Returns: number }
      finalize_domain_event: {
        Args: { p_domain_event_id: string }
        Returns: undefined
      }
      has_agency_access: {
        Args: { min_role?: string; target_agency_id: string }
        Returns: boolean
      }
      hit_rate_limit: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      hold_inventory: {
        Args: {
          p_departure_id: string
          p_quantity: number
          p_ttl_minutes?: number
        }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      is_agency_publicly_approved: {
        Args: { target_agency_id: string }
        Returns: boolean
      }
      is_authenticated_aal2: { Args: never; Returns: boolean }
      is_conversation_participant: {
        Args: { target_conversation_id: string }
        Returns: boolean
      }
      is_finance_or_admin: { Args: never; Returns: boolean }
      is_own_review: { Args: { p_review_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_support_or_admin: { Args: never; Returns: boolean }
      lookup_user_id_by_email: { Args: { p_email: string }; Returns: string }
      record_audit_log: {
        Args: {
          p_action: string
          p_actor_id: string
          p_after?: Json
          p_before?: Json
          p_request_id?: string
          p_resource_id: string
          p_resource_type: string
        }
        Returns: string
      }
      record_booking_event: {
        Args: { p_booking_id: string; p_event_type: string; p_metadata?: Json }
        Returns: undefined
      }
      release_reservation: {
        Args: { p_reason?: string; p_reservation_id: string }
        Returns: undefined
      }
      remove_agency_member: {
        Args: { p_agency_id: string; p_user_id: string }
        Returns: undefined
      }
      replace_agency_document: {
        Args: {
          p_agency_id: string
          p_document_type: string
          p_mime_type: string
          p_size_bytes: number
          p_storage_path: string
        }
        Returns: string
      }
      request_booking_cancellation: {
        Args: { p_booking_id: string; p_reason: string }
        Returns: undefined
      }
      respond_to_review: {
        Args: { p_review_id: string; p_text: string }
        Returns: undefined
      }
      revoke_user_sessions: { Args: { p_user_id: string }; Returns: undefined }
      save_agency_draft: { Args: { p_fields: Json }; Returns: string }
      set_departure_capacity: {
        Args: { p_capacity_total: number; p_departure_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      start_conversation: {
        Args: {
          p_agency_id: string
          p_booking_id?: string
          p_listing_id?: string
          p_subject?: string
        }
        Returns: string
      }
      submit_agency_application: { Args: never; Returns: string }
      trigger_dispatch_notifications: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

