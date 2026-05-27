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
      ai_agent_settings: {
        Row: {
          ab_enabled: boolean
          ab_split_pct: number
          ai_model: string
          auto_send_proposal: boolean
          created_at: string
          id: string
          proposal_prompt: string
          qualifier_enabled: boolean
          qualifier_prompt: string
          qualifier_prompt_b: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ab_enabled?: boolean
          ab_split_pct?: number
          ai_model?: string
          auto_send_proposal?: boolean
          created_at?: string
          id?: string
          proposal_prompt?: string
          qualifier_enabled?: boolean
          qualifier_prompt?: string
          qualifier_prompt_b?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ab_enabled?: boolean
          ab_split_pct?: number
          ai_model?: string
          auto_send_proposal?: boolean
          created_at?: string
          id?: string
          proposal_prompt?: string
          qualifier_enabled?: boolean
          qualifier_prompt?: string
          qualifier_prompt_b?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_debug_logs: {
        Row: {
          conversation_id: string
          created_at: string
          error: string | null
          estimated_cost: number | null
          id: string
          kind: string
          latency_ms: number | null
          model: string | null
          prompt: Json | null
          response: string | null
          user_id: string
          variant: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          error?: string | null
          estimated_cost?: number | null
          id?: string
          kind?: string
          latency_ms?: number | null
          model?: string | null
          prompt?: Json | null
          response?: string | null
          user_id: string
          variant?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          error?: string | null
          estimated_cost?: number | null
          id?: string
          kind?: string
          latency_ms?: number | null
          model?: string | null
          prompt?: Json | null
          response?: string | null
          user_id?: string
          variant?: string | null
        }
        Relationships: []
      }
      appointments: {
        Row: {
          attended: boolean
          client_id: string | null
          conversation_id: string | null
          created_at: string
          end_at: string
          funnel_id: string | null
          google_event_id: string | null
          id: string
          notes: string | null
          reminder_d0_sent: boolean
          reminder_d1_sent: boolean
          start_at: string
          status: string
          title: string
          user_id: string
        }
        Insert: {
          attended?: boolean
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          end_at: string
          funnel_id?: string | null
          google_event_id?: string | null
          id?: string
          notes?: string | null
          reminder_d0_sent?: boolean
          reminder_d1_sent?: boolean
          start_at: string
          status?: string
          title: string
          user_id: string
        }
        Update: {
          attended?: boolean
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          end_at?: string
          funnel_id?: string | null
          google_event_id?: string | null
          id?: string
          notes?: string | null
          reminder_d0_sent?: boolean
          reminder_d1_sent?: boolean
          start_at?: string
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "funnels"
            referencedColumns: ["id"]
          },
        ]
      }
      business_hours: {
        Row: {
          absent_message: string
          away_message: string
          away_timeout_min: number
          enabled: boolean
          end_hour: number
          id: string
          start_hour: number
          user_id: string
          work_days: number[]
        }
        Insert: {
          absent_message?: string
          away_message?: string
          away_timeout_min?: number
          enabled?: boolean
          end_hour?: number
          id?: string
          start_hour?: number
          user_id: string
          work_days?: number[]
        }
        Update: {
          absent_message?: string
          away_message?: string
          away_timeout_min?: number
          enabled?: boolean
          end_hour?: number
          id?: string
          start_hour?: number
          user_id?: string
          work_days?: number[]
        }
        Relationships: []
      }
      case_notes: {
        Row: {
          case_id: string
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          case_id: string
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          case_id?: string
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_notes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          area: Database["public"]["Enums"]["legal_area"]
          client_id: string | null
          contract_id: string | null
          created_at: string
          description: string | null
          id: string
          next_action_date: string | null
          position: number
          priority: Database["public"]["Enums"]["case_priority"]
          process_number: string | null
          proposal_id: string | null
          stage: string
          title: string
          updated_at: string
          user_id: string
          value: number | null
        }
        Insert: {
          area?: Database["public"]["Enums"]["legal_area"]
          client_id?: string | null
          contract_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          next_action_date?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["case_priority"]
          process_number?: string | null
          proposal_id?: string | null
          stage?: string
          title: string
          updated_at?: string
          user_id: string
          value?: number | null
        }
        Update: {
          area?: Database["public"]["Enums"]["legal_area"]
          client_id?: string | null
          contract_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          next_action_date?: string | null
          position?: number
          priority?: Database["public"]["Enums"]["case_priority"]
          process_number?: string | null
          proposal_id?: string | null
          stage?: string
          title?: string
          updated_at?: string
          user_id?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_documents: {
        Row: {
          client_id: string | null
          conversation_id: string | null
          created_at: string
          doc_type: string
          file_url: string
          id: string
          label: string | null
          media_type: string | null
          notes: string | null
          transcription: string | null
          updated_at: string
          user_id: string
          whatsapp_media_id: string | null
        }
        Insert: {
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          doc_type?: string
          file_url: string
          id?: string
          label?: string | null
          media_type?: string | null
          notes?: string | null
          transcription?: string | null
          updated_at?: string
          user_id: string
          whatsapp_media_id?: string | null
        }
        Update: {
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          doc_type?: string
          file_url?: string
          id?: string
          label?: string | null
          media_type?: string | null
          notes?: string | null
          transcription?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_media_id?: string | null
        }
        Relationships: []
      }
      client_memory: {
        Row: {
          client_id: string | null
          conversation_id: string | null
          created_at: string
          facts: Json
          id: string
          summary: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          facts?: Json
          id?: string
          summary?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          facts?: Json
          id?: string
          summary?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          created_at: string
          document: string | null
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string | null
          updated_at: string
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          document?: string | null
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      contracts: {
        Row: {
          case_id: string | null
          client_id: string | null
          created_at: string
          id: string
          proposal_id: string | null
          sent_at: string | null
          signed_at: string | null
          signed_file_url: string | null
          signing_url: string | null
          status: Database["public"]["Enums"]["contract_status"]
          template_id: string | null
          updated_at: string
          user_id: string
          variables: Json | null
          viewed_at: string | null
          zapsign_document_id: string | null
          zapsign_signer_id: string | null
        }
        Insert: {
          case_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          proposal_id?: string | null
          sent_at?: string | null
          signed_at?: string | null
          signed_file_url?: string | null
          signing_url?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          template_id?: string | null
          updated_at?: string
          user_id: string
          variables?: Json | null
          viewed_at?: string | null
          zapsign_document_id?: string | null
          zapsign_signer_id?: string | null
        }
        Update: {
          case_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          proposal_id?: string | null
          sent_at?: string | null
          signed_at?: string | null
          signed_file_url?: string | null
          signing_url?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          template_id?: string | null
          updated_at?: string
          user_id?: string
          variables?: Json | null
          viewed_at?: string | null
          zapsign_document_id?: string | null
          zapsign_signer_id?: string | null
        }
        Relationships: []
      }
      conversation_assignment_events: {
        Row: {
          actor_id: string | null
          assigned_to: string | null
          conversation_id: string
          created_at: string
          event_type: string
          id: string
          note: string | null
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          assigned_to?: string | null
          conversation_id: string
          created_at?: string
          event_type: string
          id?: string
          note?: string | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          assigned_to?: string | null
          conversation_id?: string
          created_at?: string
          event_type?: string
          id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_assignment_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_locks: {
        Row: {
          conversation_id: string
          expires_at: string
          locked_at: string
        }
        Insert: {
          conversation_id: string
          expires_at?: string
          locked_at?: string
        }
        Update: {
          conversation_id?: string
          expires_at?: string
          locked_at?: string
        }
        Relationships: []
      }
      conversation_summaries: {
        Row: {
          conversation_id: string
          generated_at: string
          id: string
          legal_area: string | null
          message_count: number
          next_step: string | null
          summary: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          generated_at?: string
          id?: string
          legal_area?: string | null
          message_count?: number
          next_step?: string | null
          summary: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          generated_at?: string
          id?: string
          legal_area?: string | null
          message_count?: number
          next_step?: string | null
          summary?: string
          user_id?: string
        }
        Relationships: []
      }
      conversation_tags: {
        Row: {
          color: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          accepted_at: string | null
          ai_consecutive_count: number
          ai_handled: boolean
          ai_pause_reason: string | null
          ai_paused: boolean
          assigned_to: string | null
          blocked: boolean
          client_id: string | null
          consulta_at: string | null
          contact_name: string | null
          created_at: string
          deadline_context: string | null
          first_response_at: string | null
          follow_up_required: boolean
          id: string
          instance_id: string | null
          last_message_at: string | null
          last_message_preview: string | null
          needs_human: boolean
          phone: string
          photo_url: string | null
          post_consulta_stage: string | null
          priority_flag: string | null
          resolved_at: string | null
          sentiment: string | null
          sla_due_at: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          tags: string[]
          ticket_status: string
          unread_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          ai_consecutive_count?: number
          ai_handled?: boolean
          ai_pause_reason?: string | null
          ai_paused?: boolean
          assigned_to?: string | null
          blocked?: boolean
          client_id?: string | null
          consulta_at?: string | null
          contact_name?: string | null
          created_at?: string
          deadline_context?: string | null
          first_response_at?: string | null
          follow_up_required?: boolean
          id?: string
          instance_id?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          needs_human?: boolean
          phone: string
          photo_url?: string | null
          post_consulta_stage?: string | null
          priority_flag?: string | null
          resolved_at?: string | null
          sentiment?: string | null
          sla_due_at?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          tags?: string[]
          ticket_status?: string
          unread_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          ai_consecutive_count?: number
          ai_handled?: boolean
          ai_pause_reason?: string | null
          ai_paused?: boolean
          assigned_to?: string | null
          blocked?: boolean
          client_id?: string | null
          consulta_at?: string | null
          contact_name?: string | null
          created_at?: string
          deadline_context?: string | null
          first_response_at?: string | null
          follow_up_required?: boolean
          id?: string
          instance_id?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          needs_human?: boolean
          phone?: string
          photo_url?: string | null
          post_consulta_stage?: string | null
          priority_flag?: string | null
          resolved_at?: string | null
          sentiment?: string | null
          sla_due_at?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          tags?: string[]
          ticket_status?: string
          unread_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      forbidden_words: {
        Row: {
          created_at: string
          id: string
          severity: string
          user_id: string
          word: string
        }
        Insert: {
          created_at?: string
          id?: string
          severity?: string
          user_id: string
          word: string
        }
        Update: {
          created_at?: string
          id?: string
          severity?: string
          user_id?: string
          word?: string
        }
        Relationships: []
      }
      funnel_ab_events: {
        Row: {
          conversation_id: string | null
          created_at: string
          event: string
          funnel_id: string | null
          id: string
          user_id: string
          variant: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          event: string
          funnel_id?: string | null
          id?: string
          user_id: string
          variant?: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          event?: string
          funnel_id?: string | null
          id?: string
          user_id?: string
          variant?: string
        }
        Relationships: []
      }
      funnel_followups: {
        Row: {
          conversation_id: string
          created_at: string
          funnel_id: string | null
          id: string
          scheduled_at: string
          sent: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          funnel_id?: string | null
          id?: string
          scheduled_at: string
          sent?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          funnel_id?: string | null
          id?: string
          scheduled_at?: string
          sent?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      funnel_states: {
        Row: {
          conversation_id: string
          created_at: string
          dados: Json
          fase: string
          funnel_id: string | null
          historico: Json
          id: string
          lead_score: number | null
          midias_enviadas: string[]
          prompt_variant: string | null
          updated_at: string
          user_id: string
          viability_notes: string | null
          viability_score: number | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          dados?: Json
          fase?: string
          funnel_id?: string | null
          historico?: Json
          id?: string
          lead_score?: number | null
          midias_enviadas?: string[]
          prompt_variant?: string | null
          updated_at?: string
          user_id: string
          viability_notes?: string | null
          viability_score?: number | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          dados?: Json
          fase?: string
          funnel_id?: string | null
          historico?: Json
          id?: string
          lead_score?: number | null
          midias_enviadas?: string[]
          prompt_variant?: string | null
          updated_at?: string
          user_id?: string
          viability_notes?: string | null
          viability_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "funnel_states_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_states_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "funnels"
            referencedColumns: ["id"]
          },
        ]
      }
      funnels: {
        Row: {
          ab_enabled: boolean
          ab_split: number
          calendar_enabled: boolean
          calendar_end_hour: number | null
          calendar_google_token: string | null
          calendar_id: string | null
          calendar_meeting_desc: string | null
          calendar_meeting_title: string | null
          calendar_slot_duration: number | null
          calendar_start_hour: number | null
          created_at: string
          description: string | null
          followup_hours: number
          followup_msg: string | null
          group_enabled: boolean
          group_name_template: string | null
          group_participants: string[]
          group_welcome_msg: string | null
          handoff_enabled: boolean
          handoff_msg: string | null
          id: string
          is_active: boolean
          is_default: boolean
          media_audio_fechamento: string | null
          media_video_abertura: string | null
          media_video_conexao: string | null
          media_video_documentos: string | null
          medias: Json
          name: string
          notify_phone: string | null
          outside_hours_msg: string | null
          persona_prompt: string
          post_consulta_d1_msg: string | null
          post_consulta_d3_msg: string | null
          post_consulta_d7_msg: string | null
          prompt_b: string | null
          proposal_is_free: boolean
          proposal_value: number | null
          updated_at: string
          user_id: string
          working_days: number[]
          working_hours_end: string | null
          working_hours_start: string | null
          zapsign_template_id: string | null
        }
        Insert: {
          ab_enabled?: boolean
          ab_split?: number
          calendar_enabled?: boolean
          calendar_end_hour?: number | null
          calendar_google_token?: string | null
          calendar_id?: string | null
          calendar_meeting_desc?: string | null
          calendar_meeting_title?: string | null
          calendar_slot_duration?: number | null
          calendar_start_hour?: number | null
          created_at?: string
          description?: string | null
          followup_hours?: number
          followup_msg?: string | null
          group_enabled?: boolean
          group_name_template?: string | null
          group_participants?: string[]
          group_welcome_msg?: string | null
          handoff_enabled?: boolean
          handoff_msg?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          media_audio_fechamento?: string | null
          media_video_abertura?: string | null
          media_video_conexao?: string | null
          media_video_documentos?: string | null
          medias?: Json
          name: string
          notify_phone?: string | null
          outside_hours_msg?: string | null
          persona_prompt?: string
          post_consulta_d1_msg?: string | null
          post_consulta_d3_msg?: string | null
          post_consulta_d7_msg?: string | null
          prompt_b?: string | null
          proposal_is_free?: boolean
          proposal_value?: number | null
          updated_at?: string
          user_id: string
          working_days?: number[]
          working_hours_end?: string | null
          working_hours_start?: string | null
          zapsign_template_id?: string | null
        }
        Update: {
          ab_enabled?: boolean
          ab_split?: number
          calendar_enabled?: boolean
          calendar_end_hour?: number | null
          calendar_google_token?: string | null
          calendar_id?: string | null
          calendar_meeting_desc?: string | null
          calendar_meeting_title?: string | null
          calendar_slot_duration?: number | null
          calendar_start_hour?: number | null
          created_at?: string
          description?: string | null
          followup_hours?: number
          followup_msg?: string | null
          group_enabled?: boolean
          group_name_template?: string | null
          group_participants?: string[]
          group_welcome_msg?: string | null
          handoff_enabled?: boolean
          handoff_msg?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          media_audio_fechamento?: string | null
          media_video_abertura?: string | null
          media_video_conexao?: string | null
          media_video_documentos?: string | null
          medias?: Json
          name?: string
          notify_phone?: string | null
          outside_hours_msg?: string | null
          persona_prompt?: string
          post_consulta_d1_msg?: string | null
          post_consulta_d3_msg?: string | null
          post_consulta_d7_msg?: string | null
          prompt_b?: string | null
          proposal_is_free?: boolean
          proposal_value?: number | null
          updated_at?: string
          user_id?: string
          working_days?: number[]
          working_hours_end?: string | null
          working_hours_start?: string | null
          zapsign_template_id?: string | null
        }
        Relationships: []
      }
      internal_notes: {
        Row: {
          author_name: string | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          author_name?: string | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          author_name?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      kanban_stages: {
        Row: {
          color: string
          created_at: string
          id: string
          is_lost: boolean
          is_won: boolean
          key: string
          label: string
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          key: string
          label: string
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          key?: string
          label?: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      kb_documents: {
        Row: {
          active: boolean
          category: string | null
          content: string
          created_at: string
          embedding_ready: boolean
          id: string
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          content: string
          created_at?: string
          embedding_ready?: boolean
          id?: string
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          category?: string | null
          content?: string
          created_at?: string
          embedding_ready?: boolean
          id?: string
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lead_qualifications: {
        Row: {
          case_id: string | null
          client_id: string | null
          conversation_id: string | null
          created_at: string
          description: string | null
          estimated_value: number | null
          id: string
          legal_area: string | null
          qualified: boolean
          raw_data: Json | null
          score: number | null
          updated_at: string
          urgency: string | null
          user_id: string
        }
        Insert: {
          case_id?: string | null
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          description?: string | null
          estimated_value?: number | null
          id?: string
          legal_area?: string | null
          qualified?: boolean
          raw_data?: Json | null
          score?: number | null
          updated_at?: string
          urgency?: string | null
          user_id: string
        }
        Update: {
          case_id?: string | null
          client_id?: string | null
          conversation_id?: string | null
          created_at?: string
          description?: string | null
          estimated_value?: number | null
          id?: string
          legal_area?: string | null
          qualified?: boolean
          raw_data?: Json | null
          score?: number | null
          updated_at?: string
          urgency?: string | null
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          direction: Database["public"]["Enums"]["message_direction"]
          external_id: string | null
          id: string
          last_error: string | null
          media_mime: string | null
          media_type: string | null
          media_url: string | null
          status: Database["public"]["Enums"]["message_status"]
          transcription: string | null
          user_id: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["message_direction"]
          external_id?: string | null
          id?: string
          last_error?: string | null
          media_mime?: string | null
          media_type?: string | null
          media_url?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          transcription?: string | null
          user_id: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          external_id?: string | null
          id?: string
          last_error?: string | null
          media_mime?: string | null
          media_type?: string | null
          media_url?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          transcription?: string | null
          user_id?: string
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
      processo_movimentacoes: {
        Row: {
          codigo: number | null
          complemento: string | null
          created_at: string
          data_movimentacao: string | null
          id: string
          is_new: boolean
          nome: string | null
          processo_id: string
          raw: Json | null
          user_id: string
        }
        Insert: {
          codigo?: number | null
          complemento?: string | null
          created_at?: string
          data_movimentacao?: string | null
          id?: string
          is_new?: boolean
          nome?: string | null
          processo_id: string
          raw?: Json | null
          user_id: string
        }
        Update: {
          codigo?: number | null
          complemento?: string | null
          created_at?: string
          data_movimentacao?: string | null
          id?: string
          is_new?: boolean
          nome?: string | null
          processo_id?: string
          raw?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processo_movimentacoes_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos_monitorados"
            referencedColumns: ["id"]
          },
        ]
      }
      processos_monitorados: {
        Row: {
          assunto: string | null
          ativo: boolean
          case_id: string | null
          classe: string | null
          client_id: string | null
          created_at: string
          data_ajuizamento: string | null
          grau: string | null
          id: string
          nivel_sigilo: number | null
          notas: string | null
          numero_processo: string
          orgao_julgador: string | null
          raw: Json | null
          tribunal: string
          ultima_consulta_em: string | null
          ultima_movimentacao_em: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assunto?: string | null
          ativo?: boolean
          case_id?: string | null
          classe?: string | null
          client_id?: string | null
          created_at?: string
          data_ajuizamento?: string | null
          grau?: string | null
          id?: string
          nivel_sigilo?: number | null
          notas?: string | null
          numero_processo: string
          orgao_julgador?: string | null
          raw?: Json | null
          tribunal: string
          ultima_consulta_em?: string | null
          ultima_movimentacao_em?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assunto?: string | null
          ativo?: boolean
          case_id?: string | null
          classe?: string | null
          client_id?: string | null
          created_at?: string
          data_ajuizamento?: string | null
          grau?: string | null
          id?: string
          nivel_sigilo?: number | null
          notas?: string | null
          numero_processo?: string
          orgao_julgador?: string | null
          raw?: Json | null
          tribunal?: string
          ultima_consulta_em?: string | null
          ultima_movimentacao_em?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "processos_monitorados_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_monitorados_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
          oab_number: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          oab_number?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          oab_number?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      proposals: {
        Row: {
          ai_generated: boolean
          case_id: string | null
          client_id: string | null
          created_at: string
          estimated_duration: string | null
          id: string
          payment_terms: string | null
          responded_at: string | null
          scope: string
          sent_at: string | null
          status: Database["public"]["Enums"]["proposal_status"]
          title: string
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          ai_generated?: boolean
          case_id?: string | null
          client_id?: string | null
          created_at?: string
          estimated_duration?: string | null
          id?: string
          payment_terms?: string | null
          responded_at?: string | null
          scope: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          title: string
          updated_at?: string
          user_id: string
          value?: number
        }
        Update: {
          ai_generated?: boolean
          case_id?: string | null
          client_id?: string | null
          created_at?: string
          estimated_duration?: string | null
          id?: string
          payment_terms?: string | null
          responded_at?: string | null
          scope?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          title?: string
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: []
      }
      quick_replies: {
        Row: {
          created_at: string
          id: string
          message: string
          shortcut: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          shortcut: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          shortcut?: string
          user_id?: string
        }
        Relationships: []
      }
      scheduled_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          error: string | null
          id: string
          scheduled_at: string
          sent_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          error?: string | null
          id?: string
          scheduled_at: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          error?: string | null
          id?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_integrations: {
        Row: {
          config: Json
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          evolution_api_key: string | null
          evolution_api_url: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          evolution_api_key?: string | null
          evolution_api_url?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          evolution_api_key?: string | null
          evolution_api_url?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_instances: {
        Row: {
          api_key: string | null
          api_url: string | null
          created_at: string
          funnel_id: string | null
          id: string
          instance_name: string
          is_office: boolean
          last_event_at: string | null
          office_role: string | null
          phone_number: string | null
          qr_code: string | null
          status: Database["public"]["Enums"]["whatsapp_status"]
          updated_at: string
          user_id: string
          webhook_secret: string
        }
        Insert: {
          api_key?: string | null
          api_url?: string | null
          created_at?: string
          funnel_id?: string | null
          id?: string
          instance_name: string
          is_office?: boolean
          last_event_at?: string | null
          office_role?: string | null
          phone_number?: string | null
          qr_code?: string | null
          status?: Database["public"]["Enums"]["whatsapp_status"]
          updated_at?: string
          user_id: string
          webhook_secret?: string
        }
        Update: {
          api_key?: string | null
          api_url?: string | null
          created_at?: string
          funnel_id?: string | null
          id?: string
          instance_name?: string
          is_office?: boolean
          last_event_at?: string | null
          office_role?: string | null
          phone_number?: string | null
          qr_code?: string | null
          status?: Database["public"]["Enums"]["whatsapp_status"]
          updated_at?: string
          user_id?: string
          webhook_secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "funnels"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_edges: {
        Row: {
          condition: string | null
          created_at: string
          id: string
          label: string | null
          source_node_id: string
          target_node_id: string
          user_id: string
          workflow_id: string
        }
        Insert: {
          condition?: string | null
          created_at?: string
          id?: string
          label?: string | null
          source_node_id: string
          target_node_id: string
          user_id: string
          workflow_id: string
        }
        Update: {
          condition?: string | null
          created_at?: string
          id?: string
          label?: string | null
          source_node_id?: string
          target_node_id?: string
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_edges_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "workflow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_edges_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "workflow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_edges_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_executions: {
        Row: {
          completed_at: string | null
          context: Json
          conversation_id: string | null
          created_at: string
          current_node_id: string | null
          id: string
          last_error: string | null
          next_run_at: string | null
          started_at: string
          status: Database["public"]["Enums"]["workflow_execution_status"]
          updated_at: string
          user_id: string
          workflow_id: string
        }
        Insert: {
          completed_at?: string | null
          context?: Json
          conversation_id?: string | null
          created_at?: string
          current_node_id?: string | null
          id?: string
          last_error?: string | null
          next_run_at?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["workflow_execution_status"]
          updated_at?: string
          user_id: string
          workflow_id: string
        }
        Update: {
          completed_at?: string | null
          context?: Json
          conversation_id?: string | null
          created_at?: string
          current_node_id?: string | null
          id?: string
          last_error?: string | null
          next_run_at?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["workflow_execution_status"]
          updated_at?: string
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_executions_current_node_id_fkey"
            columns: ["current_node_id"]
            isOneToOne: false
            referencedRelation: "workflow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_executions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_nodes: {
        Row: {
          config: Json
          created_at: string
          id: string
          label: string | null
          position_x: number
          position_y: number
          type: Database["public"]["Enums"]["workflow_node_type"]
          updated_at: string
          user_id: string
          workflow_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          label?: string | null
          position_x?: number
          position_y?: number
          type: Database["public"]["Enums"]["workflow_node_type"]
          updated_at?: string
          user_id: string
          workflow_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          label?: string | null
          position_x?: number
          position_y?: number
          type?: Database["public"]["Enums"]["workflow_node_type"]
          updated_at?: string
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_nodes_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          legal_area: string | null
          name: string
          persona_prompt: string
          proposal_is_free: boolean
          proposal_value: number | null
          updated_at: string
          user_id: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          legal_area?: string | null
          name: string
          persona_prompt?: string
          proposal_is_free?: boolean
          proposal_value?: number | null
          updated_at?: string
          user_id: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          legal_area?: string | null
          name?: string
          persona_prompt?: string
          proposal_is_free?: boolean
          proposal_value?: number | null
          updated_at?: string
          user_id?: string
          video_url?: string | null
        }
        Relationships: []
      }
      zapsign_templates: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
          variables: Json | null
          zapsign_template_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
          variables?: Json | null
          zapsign_template_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
          variables?: Json | null
          zapsign_template_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      case_priority: "baixa" | "media" | "alta" | "urgente"
      case_stage:
        | "lead"
        | "qualificacao"
        | "proposta"
        | "em_andamento"
        | "aguardando"
        | "concluido"
        | "arquivado"
      contract_status:
        | "pendente"
        | "enviado"
        | "visualizado"
        | "assinado"
        | "recusado"
        | "expirado"
      conversation_status: "open" | "pending" | "closed"
      legal_area:
        | "civel"
        | "trabalhista"
        | "criminal"
        | "tributario"
        | "familia"
        | "empresarial"
        | "consumidor"
        | "previdenciario"
        | "outro"
      message_direction: "inbound" | "outbound"
      message_status: "pending" | "sent" | "delivered" | "read" | "failed"
      proposal_status: "rascunho" | "enviada" | "aceita" | "recusada"
      whatsapp_status:
        | "disconnected"
        | "connecting"
        | "qr"
        | "connected"
        | "error"
      workflow_execution_status:
        | "running"
        | "paused"
        | "completed"
        | "failed"
        | "cancelled"
      workflow_node_type:
        | "start"
        | "message"
        | "video"
        | "audio"
        | "wait"
        | "question"
        | "condition"
        | "qualify"
        | "proposal"
        | "contract"
        | "handoff"
        | "end"
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
      case_priority: ["baixa", "media", "alta", "urgente"],
      case_stage: [
        "lead",
        "qualificacao",
        "proposta",
        "em_andamento",
        "aguardando",
        "concluido",
        "arquivado",
      ],
      contract_status: [
        "pendente",
        "enviado",
        "visualizado",
        "assinado",
        "recusado",
        "expirado",
      ],
      conversation_status: ["open", "pending", "closed"],
      legal_area: [
        "civel",
        "trabalhista",
        "criminal",
        "tributario",
        "familia",
        "empresarial",
        "consumidor",
        "previdenciario",
        "outro",
      ],
      message_direction: ["inbound", "outbound"],
      message_status: ["pending", "sent", "delivered", "read", "failed"],
      proposal_status: ["rascunho", "enviada", "aceita", "recusada"],
      whatsapp_status: [
        "disconnected",
        "connecting",
        "qr",
        "connected",
        "error",
      ],
      workflow_execution_status: [
        "running",
        "paused",
        "completed",
        "failed",
        "cancelled",
      ],
      workflow_node_type: [
        "start",
        "message",
        "video",
        "audio",
        "wait",
        "question",
        "condition",
        "qualify",
        "proposal",
        "contract",
        "handoff",
        "end",
      ],
    },
  },
} as const
