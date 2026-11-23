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
      cardio_entries: {
        Row: {
          checkin_id: string
          created_at: string
          distance_m: number
          duration_s: number
          effort: number | null
          habit_id: string
          id: string
          kind: string
          local_date: string
          note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          checkin_id: string
          created_at?: string
          distance_m: number
          duration_s: number
          effort?: number | null
          habit_id: string
          id?: string
          kind: string
          local_date: string
          note?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          checkin_id?: string
          created_at?: string
          distance_m?: number
          duration_s?: number
          effort?: number | null
          habit_id?: string
          id?: string
          kind?: string
          local_date?: string
          note?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cardio_entries_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cardio_entries_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cardio_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cardio_entries_user_id_fkey"
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
      group_invites: {
        Row: {
          code: string
          created_at: string
          created_by: string
          expires_at: string
          group_id: string
          max_uses: number
          uses: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          expires_at?: string
          group_id: string
          max_uses: number
          uses?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          group_id?: string
          max_uses?: number
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "group_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_join_attempts: {
        Row: {
          attempted_at: string
          user_id: string
        }
        Insert: {
          attempted_at?: string
          user_id: string
        }
        Update: {
          attempted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_join_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_join_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          counts_from: string
          group_id: string
          habit_id: string | null
          id: string
          is_live: boolean
          joined_at: string
          joined_on: string
          left_at: string | null
          left_reason: string | null
          role: string
          user_id: string
        }
        Insert: {
          counts_from: string
          group_id: string
          habit_id?: string | null
          id?: string
          is_live?: boolean
          joined_at?: string
          joined_on: string
          left_at?: string | null
          left_reason?: string | null
          role?: string
          user_id: string
        }
        Update: {
          counts_from?: string
          group_id?: string
          habit_id?: string | null
          id?: string
          is_live?: boolean
          joined_at?: string
          joined_on?: string
          left_at?: string | null
          left_reason?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_week_results: {
        Row: {
          complied: boolean
          counted: boolean
          done: number
          group_id: string
          target: number
          user_id: string
          week_start: string
        }
        Insert: {
          complied: boolean
          counted?: boolean
          done: number
          group_id: string
          target: number
          user_id: string
          week_start: string
        }
        Update: {
          complied?: boolean
          counted?: boolean
          done?: number
          group_id?: string
          target?: number
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_week_results_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_week_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_week_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_weeks: {
        Row: {
          closed_at: string
          commitment_name: string
          group_id: string
          members_complied: number
          members_counted: number
          requires_photo: boolean
          target_per_week: number
          week_start: string
        }
        Insert: {
          closed_at: string
          commitment_name: string
          group_id: string
          members_complied: number
          members_counted: number
          requires_photo: boolean
          target_per_week: number
          week_start: string
        }
        Update: {
          closed_at?: string
          commitment_name?: string
          group_id?: string
          members_complied?: number
          members_counted?: number
          requires_photo?: boolean
          target_per_week?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_weeks_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          archived_at: string | null
          color: string
          commitment_icon: string
          commitment_name: string
          created_at: string
          created_by: string
          description: string | null
          icon: string
          id: string
          name: string
          next_commitment_icon: string | null
          next_commitment_name: string | null
          next_effective_from: string | null
          next_requires_photo: boolean | null
          next_target_per_week: number | null
          requires_photo: boolean
          target_per_week: number
          timezone: string
        }
        Insert: {
          archived_at?: string | null
          color: string
          commitment_icon: string
          commitment_name: string
          created_at?: string
          created_by: string
          description?: string | null
          icon: string
          id?: string
          name: string
          next_commitment_icon?: string | null
          next_commitment_name?: string | null
          next_effective_from?: string | null
          next_requires_photo?: boolean | null
          next_target_per_week?: number | null
          requires_photo?: boolean
          target_per_week: number
          timezone: string
        }
        Update: {
          archived_at?: string | null
          color?: string
          commitment_icon?: string
          commitment_name?: string
          created_at?: string
          created_by?: string
          description?: string | null
          icon?: string
          id?: string
          name?: string
          next_commitment_icon?: string | null
          next_commitment_name?: string | null
          next_effective_from?: string | null
          next_requires_photo?: boolean | null
          next_target_per_week?: number | null
          requires_photo?: boolean
          target_per_week?: number
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_created_by_fkey"
            columns: ["created_by"]
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
          glass_ml: number
          icon: string
          id: string
          log_type: string
          name: string
          preset: string | null
          quantity_display: string
          quantity_label: string | null
          quantity_step: number | null
          quantity_target: number | null
          quantity_unit: string | null
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
          glass_ml?: number
          icon: string
          id?: string
          log_type?: string
          name: string
          preset?: string | null
          quantity_display?: string
          quantity_label?: string | null
          quantity_step?: number | null
          quantity_target?: number | null
          quantity_unit?: string | null
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
          glass_ml?: number
          icon?: string
          id?: string
          log_type?: string
          name?: string
          preset?: string | null
          quantity_display?: string
          quantity_label?: string | null
          quantity_step?: number | null
          quantity_target?: number | null
          quantity_unit?: string | null
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
      media_items: {
        Row: {
          created_at: string
          finished_on: string | null
          id: string
          kind: string
          runtime_min: number | null
          status: string
          title: string
          total_episodes: number | null
          total_seasons: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          finished_on?: string | null
          id?: string
          kind: string
          runtime_min?: number | null
          status?: string
          title: string
          total_episodes?: number | null
          total_seasons?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          finished_on?: string | null
          id?: string
          kind?: string
          runtime_min?: number | null
          status?: string
          title?: string
          total_episodes?: number | null
          total_seasons?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
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
      pomodoro_blocks: {
        Row: {
          block_id: string
          checkin_id: string | null
          created_at: string
          habit_id: string
          local_date: string
          minutes: number
          user_id: string
        }
        Insert: {
          block_id: string
          checkin_id?: string | null
          created_at?: string
          habit_id: string
          local_date: string
          minutes: number
          user_id: string
        }
        Update: {
          block_id?: string
          checkin_id?: string | null
          created_at?: string
          habit_id?: string
          local_date?: string
          minutes?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pomodoro_blocks_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: false
            referencedRelation: "checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pomodoro_blocks_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pomodoro_blocks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pomodoro_blocks_user_id_fkey"
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
          discoverable: boolean
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
          discoverable?: boolean
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
          discoverable?: boolean
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
      quantity_entries: {
        Row: {
          amount: number
          created_at: string
          habit_id: string
          id: string
          local_date: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          habit_id: string
          id: string
          local_date: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          habit_id?: string
          id?: string
          local_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quantity_entries_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quantity_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quantity_entries_user_id_fkey"
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
      rate_limit_events: {
        Row: {
          at: string
          key_hash: string
        }
        Insert: {
          at?: string
          key_hash: string
        }
        Update: {
          at?: string
          key_hash?: string
        }
        Relationships: []
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
      time_entries: {
        Row: {
          checkin_id: string
          created_at: string
          habit_id: string
          id: string
          local_date: string
          minutes: number
          pomodoros: number
          topic: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          checkin_id: string
          created_at?: string
          habit_id: string
          id?: string
          local_date: string
          minutes: number
          pomodoros?: number
          topic?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          checkin_id?: string
          created_at?: string
          habit_id?: string
          id?: string
          local_date?: string
          minutes?: number
          pomodoros?: number
          topic?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: true
            referencedRelation: "checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_entries: {
        Row: {
          checkin_id: string
          completed: boolean
          created_at: string
          episode_to: number | null
          episodes: number | null
          habit_id: string
          id: string
          local_date: string
          media_id: string
          minutes: number | null
          season: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          checkin_id: string
          completed?: boolean
          created_at?: string
          episode_to?: number | null
          episodes?: number | null
          habit_id: string
          id?: string
          local_date: string
          media_id: string
          minutes?: number | null
          season?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          checkin_id?: string
          completed?: boolean
          created_at?: string
          episode_to?: number | null
          episodes?: number | null
          habit_id?: string
          id?: string
          local_date?: string
          media_id?: string
          minutes?: number | null
          season?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_entries_checkin_id_fkey"
            columns: ["checkin_id"]
            isOneToOne: true
            referencedRelation: "checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_entries_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_entries_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_entries_user_id_fkey"
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
      add_cardio_entry: {
        Args: {
          p_checkin_id: string
          p_distance_m: number
          p_duration_s: number
          p_effort?: number
          p_kind: string
          p_note?: string
        }
        Returns: string
      }
      add_pomodoro_block: {
        Args: {
          p_block_id: string
          p_ended_at?: string
          p_habit_id: string
          p_minutes: number
          p_topic?: string
        }
        Returns: {
          checkin_created: boolean
          checkin_id: string
          credited: boolean
          total_minutes: number
        }[]
      }
      add_quantity_entry: {
        Args: { p_amount: number; p_entry_id: string; p_habit_id: string }
        Returns: {
          created: boolean
          done: boolean
          target: number
          total: number
        }[]
      }
      add_time: {
        Args: { p_habit_id: string; p_minutes: number; p_topic?: string }
        Returns: {
          checkin_created: boolean
          checkin_id: string
          total_minutes: number
        }[]
      }
      archive_group: { Args: { p_group_id: string }; Returns: undefined }
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
      checkin_dates: {
        Args: { p_from: string; p_habit_ids: string[] }
        Returns: {
          dates: string[]
          habit_id: string
        }[]
      }
      close_due_group_weeks: { Args: { p_now?: string }; Returns: number }
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
      create_group: {
        Args: {
          p_color: string
          p_commitment_icon: string
          p_commitment_name: string
          p_description: string
          p_habit_id: string
          p_icon: string
          p_name: string
          p_requires_photo: boolean
          p_target_per_week: number
        }
        Returns: string
      }
      create_group_invite: { Args: { p_group_id: string }; Returns: string }
      create_invite: { Args: never; Returns: string }
      cron_secret_valid: { Args: { p_secret: string }; Returns: boolean }
      delete_body_weight: { Args: { p_id: string }; Returns: boolean }
      delete_cardio_entry: { Args: { p_entry_id: string }; Returns: undefined }
      delete_reading_entry: {
        Args: { p_checkin_id: string }
        Returns: undefined
      }
      delete_time_entry: { Args: { p_checkin_id: string }; Returns: undefined }
      delete_watch_entry: { Args: { p_checkin_id: string }; Returns: undefined }
      delete_workout: { Args: { p_checkin_id: string }; Returns: undefined }
      discover_fold: { Args: { p_text: string }; Returns: string }
      discover_people: {
        Args: { p_limit?: number; p_offset?: number; p_query?: string }
        Returns: {
          avatar_path: string
          avatar_preset: number
          display_name: string
          id: string
          is_new: boolean
          mutual_count: number
          relation: string
          username: string
        }[]
      }
      email_for_username: { Args: { p_username: string }; Returns: string }
      ensure_cron_secret: { Args: never; Returns: undefined }
      friend_feed: {
        Args: {
          p_cursor_at?: string
          p_cursor_day?: string
          p_cursor_id?: string
          p_limit: number
          p_owner?: string
          p_photos_only?: boolean
        }
        Returns: {
          created_at: string
          habit_color: string
          habit_frequency_type: string
          habit_id: string
          habit_name: string
          habit_target_per_week: number
          id: string
          local_date: string
          photo_path: string
          rejected_at: string
          rejected_by: string
          user_id: string
        }[]
      }
      group_board: {
        Args: { p_group_id: string }
        Returns: {
          avatar_path: string
          avatar_preset: number
          counts: boolean
          display_name: string
          done: number
          joined_on: string
          role: string
          target: number
          user_id: string
          username: string
        }[]
      }
      group_detail: {
        Args: { p_group_id: string }
        Returns: {
          archived_at: string
          color: string
          commitment_icon: string
          commitment_name: string
          description: string
          icon: string
          id: string
          member_count: number
          my_habit_id: string | null
          my_role: string
          name: string
          next_commitment_icon: string
          next_commitment_name: string
          next_effective_from: string
          next_requires_photo: boolean
          next_target_per_week: number
          requires_photo: boolean
          streak: number
          target_per_week: number
          timezone: string
        }[]
      }
      group_history: {
        Args: { p_group_id: string; p_limit?: number }
        Returns: {
          members_complied: number
          members_counted: number
          my_complied: boolean
          requires_photo: boolean
          target_per_week: number
          week_start: string
        }[]
      }
      group_invite_preview: { Args: { p_code: string }; Returns: Json }
      group_invite_preview_for: {
        Args: { p_code: string; p_viewer?: string }
        Returns: Json
      }
      group_proof_readable: { Args: { p_name: string }; Returns: boolean }
      group_wall: {
        Args: {
          p_before?: string
          p_before_id?: string
          p_group_id: string
          p_limit?: number
        }
        Returns: {
          avatar_path: string
          avatar_preset: number
          checkin_id: string
          created_at: string
          display_name: string
          local_date: string
          photo_path: string
          user_id: string
          username: string
        }[]
      }
      group_week_detail: {
        Args: { p_group_id: string; p_week_start: string }
        Returns: {
          avatar_path: string
          avatar_preset: number
          complied: boolean
          display_name: string
          done: number
          target: number
          user_id: string
          username: string
        }[]
      }
      groups_actor: { Args: never; Returns: string }
      groups_apply_pending: {
        Args: { p_group_id: string; p_now: string }
        Returns: undefined
      }
      groups_check_habit: {
        Args: { p_habit_id: string; p_requires_photo: boolean; p_uid: string }
        Returns: undefined
      }
      groups_close_group: {
        Args: { p_group_id: string; p_now: string }
        Returns: number
      }
      groups_close_week: {
        Args: { p_group_id: string; p_now: string; p_week: string }
        Returns: undefined
      }
      groups_counts_from: { Args: { p_joined_on: string }; Returns: string }
      groups_lock_admin: {
        Args: { p_group_id: string; p_uid: string }
        Returns: Database["public"]["Tables"]["groups"]["Row"]
      }
      groups_member_role: {
        Args: { p_group_id: string; p_uid: string }
        Returns: string
      }
      groups_next_monday: { Args: { p_date: string }; Returns: string }
      groups_normalize_code: { Args: { p_code: string }; Returns: string }
      groups_random_invite_code: { Args: never; Returns: string }
      groups_streak: { Args: { p_group_id: string }; Returns: number }
      groups_validate_commitment: {
        Args: {
          p_icon: string
          p_name: string
          p_requires_photo: boolean
          p_target: number
        }
        Returns: undefined
      }
      groups_validate_info: {
        Args: {
          p_color: string
          p_description: string
          p_icon: string
          p_name: string
        }
        Returns: undefined
      }
      groups_week_start: { Args: { p_date: string }; Returns: string }
      habit_date_period_closed: {
        Args: { p_date: string; p_habit_id: string }
        Returns: boolean
      }
      habit_group_link: {
        Args: { p_habit_id: string }
        Returns: {
          linked: boolean
          requires_photo: boolean
        }[]
      }
      habit_preset_color: { Args: { p_preset: string }; Returns: string }
      invite_preview: { Args: { p_code: string }; Returns: Json }
      is_friend: { Args: { a: string; b: string }; Returns: boolean }
      join_group: {
        Args: { p_code: string; p_habit_id: string }
        Returns: string
      }
      leave_group: { Args: { p_group_id: string }; Returns: undefined }
      log_body_weight: {
        Args: { p_date?: string; p_kg: number }
        Returns: string
      }
      my_groups: {
        Args: never
        Returns: {
          archived: boolean
          color: string
          commitment_icon: string
          commitment_name: string
          complied_count: number
          counted_count: number
          icon: string
          id: string
          member_count: number
          my_counts: boolean
          my_done: number
          my_habit_id: string | null
          name: string
          requires_photo: boolean
          role: string
          streak: number
          target_per_week: number
        }[]
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
      rate_limit: {
        Args: {
          p_key: string
          p_limit: number
          p_record: boolean
          p_window_seconds: number
        }
        Returns: boolean
      }
      remove_group_member: {
        Args: { p_group_id: string; p_user_id: string }
        Returns: undefined
      }
      remove_quantity_entry: {
        Args: { p_entry_id: string }
        Returns: {
          done: boolean
          target: number
          total: number
        }[]
      }
      request_cancel: { Args: { p_id: string }; Returns: boolean }
      respond_challenge: {
        Args: { p_accept: boolean; p_id: string; p_rival_habit_id?: string }
        Returns: undefined
      }
      revoke_group_invites: { Args: { p_group_id: string }; Returns: number }
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
      save_watch_entry: {
        Args: {
          p_checkin_id: string
          p_completed: boolean
          p_episode_to: number
          p_episodes: number
          p_finished?: boolean
          p_media_id: string
          p_minutes: number
          p_season: number
        }
        Returns: string
      }
      save_workout: {
        Args: { p_checkin_id: string; p_day_types: string[]; p_sets: Json }
        Returns: string
      }
      set_avatar_preset: { Args: { p_preset: number }; Returns: undefined }
      set_group_admin: {
        Args: { p_admin: boolean; p_group_id: string; p_user_id: string }
        Returns: undefined
      }
      set_group_commitment: {
        Args: {
          p_commitment_icon: string
          p_commitment_name: string
          p_group_id: string
          p_requires_photo: boolean
          p_target_per_week: number
        }
        Returns: string
      }
      set_height: { Args: { p_cm: number }; Returns: undefined }
      set_time_entry: {
        Args: { p_checkin_id: string; p_minutes: number; p_topic: string }
        Returns: string
      }
      set_timezone: { Args: { p_tz: string }; Returns: undefined }
      uncheck_item: { Args: { p_item_id: string }; Returns: undefined }
      update_cardio_entry: {
        Args: {
          p_distance_m: number
          p_duration_s: number
          p_effort?: number
          p_entry_id: string
          p_kind: string
          p_note?: string
        }
        Returns: undefined
      }
      update_group: {
        Args: {
          p_color: string
          p_description: string
          p_group_id: string
          p_icon: string
          p_name: string
        }
        Returns: undefined
      }
      username_available: { Args: { p_username: string }; Returns: boolean }
      v4_actor: {
        Args: never
        Returns: {
          today: string
          uid: string
        }[]
      }
      v4_cardio_check: {
        Args: {
          p_distance_m: number
          p_duration_s: number
          p_effort: number
          p_kind: string
          p_note: string
        }
        Returns: string
      }
      v4_topic: { Args: { p_topic: string }; Returns: string }
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

