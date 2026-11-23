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
      body_weights: {
        Row: {
          created_at: string
          id: string
          measured_on: string
          user_id: string
          weight_kg: number
        }
        Insert: {
          created_at?: string
          id?: string
          measured_on: string
          user_id: string
          weight_kg: number
        }
        Update: {
          created_at?: string
          id?: string
          measured_on?: string
          user_id?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "body_weights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "body_weights_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          author: string | null
          created_at: string
          finished_on: string | null
          id: string
          status: string
          title: string
          total_pages: number | null
          user_id: string
        }
        Insert: {
          author?: string | null
          created_at?: string
          finished_on?: string | null
          id?: string
          status?: string
          title: string
          total_pages?: number | null
          user_id: string
        }
        Update: {
          author?: string | null
          created_at?: string
          finished_on?: string | null
          id?: string
          status?: string
          title?: string
          total_pages?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "books_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "books_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_periods: {
        Row: {
          challenge_id: string
          closed_at: string | null
          created_at: string
          id: string
          period_end: string
          period_start: string
        }
        Insert: {
          challenge_id: string
          closed_at?: string | null
          created_at?: string
          id?: string
          period_end: string
          period_start: string
        }
        Update: {
          challenge_id?: string
          closed_at?: string | null
          created_at?: string
          id?: string
          period_end?: string
          period_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_periods_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          cancel_requested_by: string | null
          cancelled_at: string | null
          created_at: string
          creator_habit_id: string
          creator_id: string
          fine_amount: number
          frequency_type: string
          id: string
          requires_photo: boolean
          rival_habit_id: string | null
          rival_id: string
          settled_at: string | null
          starts_on: string | null
          status: string
          target_per_week: number | null
          timezone: string
          weeks: number
        }
        Insert: {
          cancel_requested_by?: string | null
          cancelled_at?: string | null
          created_at?: string
          creator_habit_id: string
          creator_id: string
          fine_amount: number
          frequency_type: string
          id?: string
          requires_photo?: boolean
          rival_habit_id?: string | null
          rival_id: string
          settled_at?: string | null
          starts_on?: string | null
          status?: string
          target_per_week?: number | null
          timezone: string
          weeks: number
        }
        Update: {
          cancel_requested_by?: string | null
          cancelled_at?: string | null
          created_at?: string
          creator_habit_id?: string
          creator_id?: string
          fine_amount?: number
          frequency_type?: string
          id?: string
          requires_photo?: boolean
          rival_habit_id?: string | null
          rival_id?: string
          settled_at?: string | null
          starts_on?: string | null
          status?: string
          target_per_week?: number | null
          timezone?: string
          weeks?: number
        }
        Relationships: [
          {
            foreignKeyName: "challenges_cancel_requested_by_fkey"
            columns: ["cancel_requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_cancel_requested_by_fkey"
            columns: ["cancel_requested_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_creator_habit_id_fkey"
            columns: ["creator_habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_rival_habit_id_fkey"
            columns: ["rival_habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_rival_id_fkey"
            columns: ["rival_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_rival_id_fkey"
            columns: ["rival_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checkin_items: {
        Row: {
          created_at: string
          habit_id: string
          id: string
          is_duplicate: boolean
          item_id: string
          local_date: string
          photo_path: string | null
          photo_sha256: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          habit_id: string
          id?: string
          is_duplicate?: boolean
          item_id: string
          local_date: string
          photo_path?: string | null
          photo_sha256?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          habit_id?: string
          id?: string
          is_duplicate?: boolean
          item_id?: string
          local_date?: string
          photo_path?: string | null
          photo_sha256?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkin_items_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "habit_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkin_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checkins: {
        Row: {
          created_at: string
          habit_id: string
          id: string
          is_duplicate: boolean
          local_date: string
          photo_path: string | null
          photo_sha256: string | null
          reject_reason: string | null
          rejected_at: string | null
          rejected_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          habit_id: string
          id?: string
          is_duplicate?: boolean
          local_date: string
          photo_path?: string | null
          photo_sha256?: string | null
          reject_reason?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          habit_id?: string
          id?: string
          is_duplicate?: boolean
          local_date?: string
          photo_path?: string | null
          photo_sha256?: string | null
          reject_reason?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkins_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      debts: {
        Row: {
          amount: number
          challenge_id: string
          created_at: string
          creditor_id: string
          debtor_id: string
          id: string
          paid_at: string | null
          period_start: string
        }
        Insert: {
          amount: number
          challenge_id: string
          created_at?: string
          creditor_id: string
          debtor_id: string
          id?: string
          paid_at?: string | null
          period_start: string
        }
        Update: {
          amount?: number
          challenge_id?: string
          created_at?: string
          creditor_id?: string
          debtor_id?: string
          id?: string
          paid_at?: string | null
          period_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "debts_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debts_creditor_id_fkey"
            columns: ["creditor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debts_creditor_id_fkey"
            columns: ["creditor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debts_debtor_id_fkey"
            columns: ["debtor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debts_debtor_id_fkey"
            columns: ["debtor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          key: string | null
          muscle_group: string
          name: string
          user_id: string | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          key?: string | null
          muscle_group: string
          name: string
          user_id?: string | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          key?: string | null
          muscle_group?: string
          name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercises_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          archived_at: string | null
          created_at: string
          deadline: string | null
          habit_id: string
          id: string
          kind: string
          starts_on: string
          target: number
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          deadline?: string | null
          habit_id: string
          id?: string
          kind: string
          starts_on?: string
          target: number
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          deadline?: string | null
          habit_id?: string
          id?: string
          kind?: string
          starts_on?: string
          target?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_items: {
        Row: {
          archived_at: string | null
          created_at: string
          habit_id: string
          id: string
          label: string
          position: number
          requires_photo: boolean
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          habit_id: string
          id?: string
          label: string
          position: number
          requires_photo?: boolean
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          habit_id?: string
          id?: string
          label?: string
          position?: number
          requires_photo?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_items_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habit_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habit_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      habits: {
        Row: {
          archived_at: string | null
          color: string
          created_at: string
          frequency_type: string
          icon: string
          id: string
          log_type: string
          name: string
          preset: string | null
          requires_photo: boolean
          target_per_week: number | null
          user_id: string
          visibility: string
        }
        Insert: {
          archived_at?: string | null
          color?: string
          created_at?: string
          frequency_type: string
          icon: string
          id?: string
          log_type?: string
          name: string
          preset?: string | null
          requires_photo?: boolean
          target_per_week?: number | null
          user_id: string
          visibility?: string
        }
        Update: {
          archived_at?: string | null
          color?: string
          created_at?: string
          frequency_type?: string
          icon?: string
          id?: string
          log_type?: string
          name?: string
          preset?: string | null
          requires_photo?: boolean
          target_per_week?: number | null
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "habits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "habits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          inviter_id: string
          uses: number
        }
        Insert: {
          code?: string
          created_at?: string
          expires_at: string
          id?: string
          inviter_id: string
          uses?: number
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          inviter_id?: string
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "invites_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          created_at: string
          id: number
          key: string
        }
        Insert: {
          created_at?: string
          id?: never
          key: string
        }
        Update: {
          created_at?: string
          id?: never
          key?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          payload: Json
          pushed_at: string | null
          read_at: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          pushed_at?: string | null
          read_at?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          pushed_at?: string | null
          read_at?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          avatar_preset: number
          avatar_updated_at: string | null
          birth_date: string | null
          created_at: string
          deleted_at: string | null
          display_name: string | null
          first_name: string
          height_cm: number | null
          id: string
          last_name: string
          reminder_time: string
          terms_accepted_at: string
          timezone: string
          timezone_changed_at: string | null
          username: string
        }
        Insert: {
          avatar_path?: string | null
          avatar_preset?: number
          avatar_updated_at?: string | null
          birth_date?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          first_name: string
          height_cm?: number | null
          id: string
          last_name: string
          reminder_time?: string
          terms_accepted_at: string
          timezone: string
          timezone_changed_at?: string | null
          username: string
        }
        Update: {
          avatar_path?: string | null
          avatar_preset?: number
          avatar_updated_at?: string | null
          birth_date?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          first_name?: string
          height_cm?: number | null
          id?: string
          last_name?: string
          reminder_time?: string
          terms_accepted_at?: string
          timezone?: string
          timezone_changed_at?: string | null
          username?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_entries: {
        Row: {
          book_id: string
          checkin_id: string
          created_at: string
          from_page: number
          habit_id: string
          id: string
          local_date: string
          to_page: number
          updated_at: string
          user_id: string
        }
        Insert: {
          book_id: string
          checkin_id: string
          created_at?: string
          from_page: number
          habit_id: string
          id?: string
          local_date: string
          to_page: number
          updated_at?: string
          user_id: string
        }
        Update: {
          book_id?: string
          checkin_id?: string
          created_at?: string
          from_page?: number
          habit_id?: string
          id?: string
          local_date?: string
          to_page?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_entries_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_entries_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: true
            referencedRelation: "checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_entries_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_log: {
        Row: {
          created_at: string
          local_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          local_date: string
          user_id: string
        }
        Update: {
          created_at?: string
          local_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sessions: {
        Row: {
          checkin_id: string
          created_at: string
          day_types: string[]
          habit_id: string
          id: string
          local_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          checkin_id: string
          created_at?: string
          day_types: string[]
          habit_id: string
          id?: string
          local_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          checkin_id?: string
          created_at?: string
          day_types?: string[]
          habit_id?: string
          id?: string
          local_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sessions_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: true
            referencedRelation: "checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sessions_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sets: {
        Row: {
          exercise_id: string
          id: string
          local_date: string
          position: number
          reps: number
          session_id: string
          user_id: string
          weight_kg: number
        }
        Insert: {
          exercise_id: string
          id?: string
          local_date: string
          position: number
          reps: number
          session_id: string
          user_id: string
          weight_kg: number
        }
        Update: {
          exercise_id?: string
          id?: string
          local_date?: string
          position?: number
          reps?: number
          session_id?: string
          user_id?: string
          weight_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "workout_sets_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_profiles: {
        Row: {
          avatar_path: string | null
          avatar_preset: number | null
          display_name: string | null
          id: string | null
          username: string | null
        }
        Insert: {
          avatar_path?: string | null
          avatar_preset?: number | null
          display_name?: string | null
          id?: string | null
          username?: string | null
        }
        Update: {
          avatar_path?: string | null
          avatar_preset?: number | null
          display_name?: string | null
          id?: string | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_invite: { Args: { p_code: string }; Returns: string }
      account_for_login: {
        Args: { p_kind: string; p_value: string }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      call_cron_endpoints: { Args: never; Returns: undefined }
      cancel_challenges_between: {
        Args: { p_other: string }
        Returns: undefined
      }
      check_item: {
        Args: { p_item_id: string }
        Returns: {
          checkin_item_id: string
          created: boolean
          day_completed: boolean
        }[]
      }
      complete_day_from_items: {
        Args: { p_date: string; p_habit_id: string; p_user_id: string }
        Returns: boolean
      }
      create_checkin: {
        Args: { p_habit_id: string }
        Returns: {
          checkin_id: string
          created: boolean
        }[]
      }
      create_invite: { Args: never; Returns: string }
      delete_body_weight: { Args: { p_id: string }; Returns: boolean }
      delete_reading_entry: {
        Args: { p_checkin_id: string }
        Returns: undefined
      }
      delete_workout: { Args: { p_checkin_id: string }; Returns: undefined }
      email_for_username: { Args: { p_username: string }; Returns: string }
      habit_preset_color: { Args: { p_preset: string }; Returns: string }
      invite_preview: { Args: { p_code: string }; Returns: Json }
      is_friend: { Args: { a: string; b: string }; Returns: boolean }
      log_body_weight: {
        Args: { p_date?: string; p_kg: number }
        Returns: string
      }
      public_profile: { Args: { p_username: string }; Returns: Json }
      register_login_attempt: { Args: { p_keys: string[] }; Returns: boolean }
      reject_checkin: {
        Args: { p_checkin_id: string; p_reason: string }
        Returns: undefined
      }
      reminder_candidates: {
        Args: never
        Returns: {
          pending_today: boolean
          reminder_time: string
          timezone: string
          user_id: string
        }[]
      }
      remove_friend: { Args: { p_other: string }; Returns: boolean }
      request_cancel: { Args: { p_id: string }; Returns: boolean }
      respond_challenge: {
        Args: { p_accept: boolean; p_id: string; p_rival_habit_id?: string }
        Returns: undefined
      }
      save_reading_entry: {
        Args: {
          p_book_id: string
          p_checkin_id: string
          p_finished?: boolean
          p_from_page: number
          p_to_page: number
        }
        Returns: string
      }
      save_workout: {
        Args: { p_checkin_id: string; p_day_types: string[]; p_sets: Json }
        Returns: string
      }
      set_avatar_preset: { Args: { p_preset: number }; Returns: undefined }
      set_height: { Args: { p_cm: number }; Returns: undefined }
      set_timezone: { Args: { p_tz: string }; Returns: undefined }
      uncheck_item: { Args: { p_item_id: string }; Returns: undefined }
      username_available: { Args: { p_username: string }; Returns: boolean }
      workout_day_types_valid: {
        Args: { p_day_types: string[] }
        Returns: boolean
      }
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

