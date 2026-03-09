export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      admin_settings: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          key: string;
          updated_at: string | null;
          value: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          key: string;
          updated_at?: string | null;
          value: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          key?: string;
          updated_at?: string | null;
          value?: string;
        };
        Relationships: [];
      };
      assistant_collections: {
        Row: {
          assistant_id: string;
          collection_id: string;
          created_at: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          assistant_id: string;
          collection_id: string;
          created_at?: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          assistant_id?: string;
          collection_id?: string;
          created_at?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assistant_collections_assistant_id_fkey";
            columns: ["assistant_id"];
            isOneToOne: false;
            referencedRelation: "assistants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assistant_collections_collection_id_fkey";
            columns: ["collection_id"];
            isOneToOne: false;
            referencedRelation: "collections";
            referencedColumns: ["id"];
          },
        ];
      };
      assistant_files: {
        Row: {
          assistant_id: string;
          created_at: string;
          file_id: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          assistant_id: string;
          created_at?: string;
          file_id: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          assistant_id?: string;
          created_at?: string;
          file_id?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assistant_files_assistant_id_fkey";
            columns: ["assistant_id"];
            isOneToOne: false;
            referencedRelation: "assistants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assistant_files_file_id_fkey";
            columns: ["file_id"];
            isOneToOne: false;
            referencedRelation: "files";
            referencedColumns: ["id"];
          },
        ];
      };
      assistant_tools: {
        Row: {
          assistant_id: string;
          created_at: string;
          tool_id: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          assistant_id: string;
          created_at?: string;
          tool_id: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          assistant_id?: string;
          created_at?: string;
          tool_id?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assistant_tools_assistant_id_fkey";
            columns: ["assistant_id"];
            isOneToOne: false;
            referencedRelation: "assistants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assistant_tools_tool_id_fkey";
            columns: ["tool_id"];
            isOneToOne: false;
            referencedRelation: "tools";
            referencedColumns: ["id"];
          },
        ];
      };
      assistant_workspaces: {
        Row: {
          assistant_id: string;
          created_at: string;
          updated_at: string | null;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          assistant_id: string;
          created_at?: string;
          updated_at?: string | null;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          assistant_id?: string;
          created_at?: string;
          updated_at?: string | null;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assistant_workspaces_assistant_id_fkey";
            columns: ["assistant_id"];
            isOneToOne: false;
            referencedRelation: "assistants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "assistant_workspaces_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      assistants: {
        Row: {
          author: string | null;
          context_length: number;
          created_at: string;
          description: string;
          embeddings_provider: string;
          folder_id: string | null;
          group_id: string | null;
          id: string;
          image_model: string | null;
          image_path: string;
          include_profile_context: boolean;
          include_workspace_instructions: boolean;
          is_confidential: boolean | null;
          model: string;
          name: string;
          prompt: string;
          role: string | null;
          sharing: string;
          temperature: number;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          author?: string | null;
          context_length: number;
          created_at?: string;
          description: string;
          embeddings_provider: string;
          folder_id?: string | null;
          group_id?: string | null;
          id?: string;
          image_model?: string | null;
          image_path: string;
          include_profile_context: boolean;
          include_workspace_instructions: boolean;
          is_confidential?: boolean | null;
          model: string;
          name: string;
          prompt: string;
          role?: string | null;
          sharing?: string;
          temperature: number;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          author?: string | null;
          context_length?: number;
          created_at?: string;
          description?: string;
          embeddings_provider?: string;
          folder_id?: string | null;
          group_id?: string | null;
          id?: string;
          image_model?: string | null;
          image_path?: string;
          include_profile_context?: boolean;
          include_workspace_instructions?: boolean;
          is_confidential?: boolean | null;
          model?: string;
          name?: string;
          prompt?: string;
          role?: string | null;
          sharing?: string;
          temperature?: number;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "assistants_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
        ];
      };
      azure_groups: {
        Row: {
          created_at: string;
          email: string | null;
          group_id: string;
          group_status: boolean | null;
          id: string;
          name: string | null;
          role: string | null;
          type: string | null;
        };
        Insert: {
          created_at?: string;
          email?: string | null;
          group_id: string;
          group_status?: boolean | null;
          id?: string;
          name?: string | null;
          role?: string | null;
          type?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string | null;
          group_id?: string;
          group_status?: boolean | null;
          id?: string;
          name?: string | null;
          role?: string | null;
          type?: string | null;
        };
        Relationships: [];
      };
      chat_files: {
        Row: {
          chat_id: string;
          created_at: string;
          file_id: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          chat_id: string;
          created_at?: string;
          file_id: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          chat_id?: string;
          created_at?: string;
          file_id?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chat_files_chat_id_fkey";
            columns: ["chat_id"];
            isOneToOne: false;
            referencedRelation: "chats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chat_files_file_id_fkey";
            columns: ["file_id"];
            isOneToOne: false;
            referencedRelation: "files";
            referencedColumns: ["id"];
          },
        ];
      };
      chats: {
        Row: {
          assistant_id: string | null;
          context_length: number;
          created_at: string;
          embeddings_provider: string;
          folder_id: string | null;
          group_id: string | null;
          id: string;
          image_model: string | null;
          include_profile_context: boolean;
          include_workspace_instructions: boolean;
          is_temp_chat: boolean | null;
          model: string | null;
          name: string;
          prompt: string;
          sharing: string;
          temperature: number;
          updated_at: string | null;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          assistant_id?: string | null;
          context_length: number;
          created_at?: string;
          embeddings_provider: string;
          folder_id?: string | null;
          group_id?: string | null;
          id?: string;
          image_model?: string | null;
          include_profile_context: boolean;
          include_workspace_instructions: boolean;
          is_temp_chat?: boolean | null;
          model?: string | null;
          name: string;
          prompt: string;
          sharing?: string;
          temperature: number;
          updated_at?: string | null;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          assistant_id?: string | null;
          context_length?: number;
          created_at?: string;
          embeddings_provider?: string;
          folder_id?: string | null;
          group_id?: string | null;
          id?: string;
          image_model?: string | null;
          include_profile_context?: boolean;
          include_workspace_instructions?: boolean;
          is_temp_chat?: boolean | null;
          model?: string | null;
          name?: string;
          prompt?: string;
          sharing?: string;
          temperature?: number;
          updated_at?: string | null;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "chats_assistant_id_fkey";
            columns: ["assistant_id"];
            isOneToOne: false;
            referencedRelation: "assistants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chats_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chats_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      collection_files: {
        Row: {
          collection_id: string;
          created_at: string;
          file_id: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          collection_id: string;
          created_at?: string;
          file_id: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          collection_id?: string;
          created_at?: string;
          file_id?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "collection_files_collection_id_fkey";
            columns: ["collection_id"];
            isOneToOne: false;
            referencedRelation: "collections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collection_files_file_id_fkey";
            columns: ["file_id"];
            isOneToOne: false;
            referencedRelation: "files";
            referencedColumns: ["id"];
          },
        ];
      };
      collection_workspaces: {
        Row: {
          collection_id: string;
          created_at: string;
          updated_at: string | null;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          collection_id: string;
          created_at?: string;
          updated_at?: string | null;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          collection_id?: string;
          created_at?: string;
          updated_at?: string | null;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "collection_workspaces_collection_id_fkey";
            columns: ["collection_id"];
            isOneToOne: false;
            referencedRelation: "collections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collection_workspaces_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      collections: {
        Row: {
          created_at: string;
          description: string;
          folder_id: string | null;
          group_id: string | null;
          id: string;
          name: string;
          sharing: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          description: string;
          folder_id?: string | null;
          group_id?: string | null;
          id?: string;
          name: string;
          sharing?: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          folder_id?: string | null;
          group_id?: string | null;
          id?: string;
          name?: string;
          sharing?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "collections_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
        ];
      };
      custom_prompts: {
        Row: {
          content: string;
          created_at: string;
          folder_id: string | null;
          group_id: string | null;
          id: string;
          name: string;
          sharing: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          folder_id?: string | null;
          group_id?: string | null;
          id?: string;
          name: string;
          sharing?: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          folder_id?: string | null;
          group_id?: string | null;
          id?: string;
          name?: string;
          sharing?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      file_items: {
        Row: {
          chunk_index: number | null;
          content: string;
          created_at: string;
          file_id: string;
          id: string;
          local_embedding: string | null;
          openai_embedding: string | null;
          original_content: string | null;
          pii_entities: Json | null;
          pii_token_map: Json | null;
          sharing: string;
          tokens: number;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          chunk_index?: number | null;
          content: string;
          created_at?: string;
          file_id: string;
          id?: string;
          local_embedding?: string | null;
          openai_embedding?: string | null;
          original_content?: string | null;
          pii_entities?: Json | null;
          pii_token_map?: Json | null;
          sharing?: string;
          tokens: number;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          chunk_index?: number | null;
          content?: string;
          created_at?: string;
          file_id?: string;
          id?: string;
          local_embedding?: string | null;
          openai_embedding?: string | null;
          original_content?: string | null;
          pii_entities?: Json | null;
          pii_token_map?: Json | null;
          sharing?: string;
          tokens?: number;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "file_items_file_id_fkey";
            columns: ["file_id"];
            isOneToOne: false;
            referencedRelation: "files";
            referencedColumns: ["id"];
          },
        ];
      };
      file_workspaces: {
        Row: {
          created_at: string;
          file_id: string;
          updated_at: string | null;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          file_id: string;
          updated_at?: string | null;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          file_id?: string;
          updated_at?: string | null;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "file_workspaces_file_id_fkey";
            columns: ["file_id"];
            isOneToOne: false;
            referencedRelation: "files";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "file_workspaces_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      files: {
        Row: {
          created_at: string;
          description: string;
          error_message: string | null;
          file_path: string;
          folder_id: string | null;
          id: string;
          name: string;
          original_file_path: string | null;
          original_type: string | null;
          processing_progress: number | null;
          processing_status: string | null;
          sharing: string;
          size: number;
          tokens: number;
          type: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          description: string;
          error_message?: string | null;
          file_path: string;
          folder_id?: string | null;
          id?: string;
          name: string;
          original_file_path?: string | null;
          original_type?: string | null;
          processing_progress?: number | null;
          processing_status?: string | null;
          sharing?: string;
          size: number;
          tokens: number;
          type: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          error_message?: string | null;
          file_path?: string;
          folder_id?: string | null;
          id?: string;
          name?: string;
          original_file_path?: string | null;
          original_type?: string | null;
          processing_progress?: number | null;
          processing_status?: string | null;
          sharing?: string;
          size?: number;
          tokens?: number;
          type?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "files_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
        ];
      };
      folders: {
        Row: {
          created_at: string;
          description: string;
          group_id: string | null;
          id: string;
          name: string;
          type: string;
          updated_at: string | null;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          description: string;
          group_id?: string | null;
          id?: string;
          name: string;
          type: string;
          updated_at?: string | null;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          group_id?: string | null;
          id?: string;
          name?: string;
          type?: string;
          updated_at?: string | null;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "folders_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      managed_user_groups: {
        Row: {
          created_at: string;
          group_id: string;
          id: string;
          is_selected: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          group_id: string;
          id?: string;
          is_selected?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          id?: string;
          is_selected?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "managed_user_groups_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "azure_groups";
            referencedColumns: ["group_id"];
          },
          {
            foreignKeyName: "managed_user_groups_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      message_file_items: {
        Row: {
          created_at: string;
          file_item_id: string;
          message_id: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          file_item_id: string;
          message_id: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          file_item_id?: string;
          message_id?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "message_file_items_file_item_id_fkey";
            columns: ["file_item_id"];
            isOneToOne: false;
            referencedRelation: "file_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "message_file_items_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          assistant_id: string | null;
          chat_id: string;
          content: string;
          created_at: string;
          id: string;
          image_paths: string[];
          is_pin: boolean | null;
          model: string;
          original_content: string | null;
          pii_entities: Json | null;
          pii_token_map: Json | null;
          pin_metadata: string | null;
          role: string;
          sequence_number: number;
          session_id: string | null;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          assistant_id?: string | null;
          chat_id: string;
          content: string;
          created_at?: string;
          id?: string;
          image_paths: string[];
          is_pin?: boolean | null;
          model: string;
          original_content?: string | null;
          pii_entities?: Json | null;
          pii_token_map?: Json | null;
          pin_metadata?: string | null;
          role: string;
          sequence_number: number;
          session_id?: string | null;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          assistant_id?: string | null;
          chat_id?: string;
          content?: string;
          created_at?: string;
          id?: string;
          image_paths?: string[];
          is_pin?: boolean | null;
          model?: string;
          original_content?: string | null;
          pii_entities?: Json | null;
          pii_token_map?: Json | null;
          pin_metadata?: string | null;
          role?: string;
          sequence_number?: number;
          session_id?: string | null;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_assistant_id_fkey";
            columns: ["assistant_id"];
            isOneToOne: false;
            referencedRelation: "assistants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_chat_id_fkey";
            columns: ["chat_id"];
            isOneToOne: false;
            referencedRelation: "chats";
            referencedColumns: ["id"];
          },
        ];
      };
      model_restrictions: {
        Row: {
          created_at: string;
          created_by: string | null;
          group_id: string;
          id: string;
          is_allowed: boolean | null;
          model_id: string;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          group_id: string;
          id?: string;
          is_allowed?: boolean | null;
          model_id: string;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          group_id?: string;
          id?: string;
          is_allowed?: boolean | null;
          model_id?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      model_workspaces: {
        Row: {
          created_at: string;
          model_id: string;
          updated_at: string | null;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          model_id: string;
          updated_at?: string | null;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          model_id?: string;
          updated_at?: string | null;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "model_workspaces_model_id_fkey";
            columns: ["model_id"];
            isOneToOne: false;
            referencedRelation: "models";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "model_workspaces_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      models: {
        Row: {
          api_key: string;
          base_url: string;
          context_length: number;
          created_at: string;
          description: string;
          folder_id: string | null;
          id: string;
          model_id: string;
          name: string;
          sharing: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          api_key: string;
          base_url: string;
          context_length?: number;
          created_at?: string;
          description: string;
          folder_id?: string | null;
          id?: string;
          model_id: string;
          name: string;
          sharing?: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          api_key?: string;
          base_url?: string;
          context_length?: number;
          created_at?: string;
          description?: string;
          folder_id?: string | null;
          id?: string;
          model_id?: string;
          name?: string;
          sharing?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "models_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
        ];
      };
      n8n_webhook_assignments: {
        Row: {
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
          user_id: string;
          webhook_id: string;
        };
        Insert: {
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: string;
          user_id: string;
          webhook_id: string;
        };
        Update: {
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          user_id?: string;
          webhook_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "n8n_webhook_assignments_webhook_id_fkey";
            columns: ["webhook_id"];
            isOneToOne: false;
            referencedRelation: "n8n_webhooks";
            referencedColumns: ["id"];
          },
        ];
      };
      n8n_webhook_logs: {
        Row: {
          assistant_id: string | null;
          chat_id: string | null;
          created_at: string;
          error_message: string | null;
          execution_time_ms: number | null;
          http_status_code: number | null;
          id: string;
          model_id: string | null;
          request_data: Json | null;
          response_data: Json | null;
          status: string;
          user_id: string;
          webhook_id: string;
        };
        Insert: {
          assistant_id?: string | null;
          chat_id?: string | null;
          created_at?: string;
          error_message?: string | null;
          execution_time_ms?: number | null;
          http_status_code?: number | null;
          id?: string;
          model_id?: string | null;
          request_data?: Json | null;
          response_data?: Json | null;
          status: string;
          user_id: string;
          webhook_id: string;
        };
        Update: {
          assistant_id?: string | null;
          chat_id?: string | null;
          created_at?: string;
          error_message?: string | null;
          execution_time_ms?: number | null;
          http_status_code?: number | null;
          id?: string;
          model_id?: string | null;
          request_data?: Json | null;
          response_data?: Json | null;
          status?: string;
          user_id?: string;
          webhook_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "n8n_webhook_logs_assistant_id_fkey";
            columns: ["assistant_id"];
            isOneToOne: false;
            referencedRelation: "assistants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "n8n_webhook_logs_chat_id_fkey";
            columns: ["chat_id"];
            isOneToOne: false;
            referencedRelation: "chats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "n8n_webhook_logs_webhook_id_fkey";
            columns: ["webhook_id"];
            isOneToOne: false;
            referencedRelation: "n8n_webhooks";
            referencedColumns: ["id"];
          },
        ];
      };
      n8n_webhooks: {
        Row: {
          created_at: string;
          custom_headers: Json | null;
          description: string | null;
          http_method: string;
          id: string;
          name: string;
          schema: Json;
          status: string;
          updated_at: string | null;
          user_id: string;
          webhook_url: string;
          thinking_steps_enabled: boolean;
          timeout_minutes: number;
        };
        Insert: {
          created_at?: string;
          custom_headers?: Json | null;
          description?: string | null;
          http_method?: string;
          id?: string;
          name: string;
          schema: Json;
          status?: string;
          updated_at?: string | null;
          user_id: string;
          webhook_url: string;
          thinking_steps_enabled: boolean;
          timeout_minutes: number;
        };
        Update: {
          created_at?: string;
          custom_headers?: Json | null;
          description?: string | null;
          http_method?: string;
          id?: string;
          name?: string;
          schema?: Json;
          status?: string;
          updated_at?: string | null;
          user_id?: string;
          webhook_url?: string;
          thinking_steps_enabled: boolean;
          timeout_minutes: number;
        };
        Relationships: [];
      };
      n8n_workflow_executions: {
        Row: {
          chat_id: string | null;
          completed_at: string | null;
          created_at: string | null;
          current_step: number | null;
          error_message: string | null;
          expires_at: string | null;
          id: string;
          n8n_execution_id: string | null;
          request_data: Json | null;
          result: Json | null;
          started_at: string | null;
          status: string;
          total_steps: number | null;
          user_id: string;
          webhook_id: string;
        };
        Insert: {
          chat_id?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          current_step?: number | null;
          error_message?: string | null;
          expires_at?: string | null;
          id?: string;
          n8n_execution_id?: string | null;
          request_data?: Json | null;
          result?: Json | null;
          started_at?: string | null;
          status?: string;
          total_steps?: number | null;
          user_id: string;
          webhook_id: string;
        };
        Update: {
          chat_id?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          current_step?: number | null;
          error_message?: string | null;
          expires_at?: string | null;
          id?: string;
          n8n_execution_id?: string | null;
          request_data?: Json | null;
          result?: Json | null;
          started_at?: string | null;
          status?: string;
          total_steps?: number | null;
          user_id?: string;
          webhook_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "n8n_workflow_executions_chat_id_fkey";
            columns: ["chat_id"];
            isOneToOne: false;
            referencedRelation: "chats";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "n8n_workflow_executions_webhook_id_fkey";
            columns: ["webhook_id"];
            isOneToOne: false;
            referencedRelation: "n8n_webhooks";
            referencedColumns: ["id"];
          },
        ];
      };
      n8n_workflow_steps: {
        Row: {
          completed_at: string | null;
          created_at: string | null;
          duration_ms: number | null;
          execution_id: string;
          id: string;
          metadata: Json | null;
          started_at: string | null;
          status: string;
          step_name: string;
          step_number: number;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string | null;
          duration_ms?: number | null;
          execution_id: string;
          id?: string;
          metadata?: Json | null;
          started_at?: string | null;
          status?: string;
          step_name: string;
          step_number: number;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string | null;
          duration_ms?: number | null;
          execution_id?: string;
          id?: string;
          metadata?: Json | null;
          started_at?: string | null;
          status?: string;
          step_name?: string;
          step_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: "n8n_workflow_steps_execution_id_fkey";
            columns: ["execution_id"];
            isOneToOne: false;
            referencedRelation: "n8n_workflow_executions";
            referencedColumns: ["id"];
          },
        ];
      };
      pii_audit_logs: {
        Row: {
          created_at: string;
          detection_engine: string | null;
          id: string;
          model_id: string;
          pii_action: string;
          pii_type: string;
          user_email: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          detection_engine?: string | null;
          id?: string;
          model_id: string;
          pii_action: string;
          pii_type: string;
          user_email: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          detection_engine?: string | null;
          id?: string;
          model_id?: string;
          pii_action?: string;
          pii_type?: string;
          user_email?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      pii_protection_settings: {
        Row: {
          audit_log_enabled: boolean | null;
          audit_log_retention_days: number | null;
          categories: Json | null;
          created_at: string | null;
          custom_patterns: Json | null;
          detection_engine: string | null;
          doc_processing: boolean | null;
          enabled: boolean | null;
          id: string;
          image_processing: boolean | null;
          max_sensitivity_level: string | null;
          model_id: string;
          updated_at: string | null;
        };
        Insert: {
          audit_log_enabled?: boolean | null;
          audit_log_retention_days?: number | null;
          categories?: Json | null;
          created_at?: string | null;
          custom_patterns?: Json | null;
          detection_engine?: string | null;
          doc_processing?: boolean | null;
          enabled?: boolean | null;
          id?: string;
          image_processing?: boolean | null;
          max_sensitivity_level?: string | null;
          model_id: string;
          updated_at?: string | null;
        };
        Update: {
          audit_log_enabled?: boolean | null;
          audit_log_retention_days?: number | null;
          categories?: Json | null;
          created_at?: string | null;
          custom_patterns?: Json | null;
          detection_engine?: string | null;
          doc_processing?: boolean | null;
          enabled?: boolean | null;
          id?: string;
          image_processing?: boolean | null;
          max_sensitivity_level?: string | null;
          model_id?: string;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      preset_workspaces: {
        Row: {
          created_at: string;
          preset_id: string;
          updated_at: string | null;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          preset_id: string;
          updated_at?: string | null;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          preset_id?: string;
          updated_at?: string | null;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "preset_workspaces_preset_id_fkey";
            columns: ["preset_id"];
            isOneToOne: false;
            referencedRelation: "presets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "preset_workspaces_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      presets: {
        Row: {
          context_length: number;
          created_at: string;
          description: string;
          embeddings_provider: string;
          folder_id: string | null;
          id: string;
          image_model: string | null;
          include_profile_context: boolean;
          include_workspace_instructions: boolean;
          model: string;
          name: string;
          prompt: string;
          sharing: string;
          temperature: number;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          context_length: number;
          created_at?: string;
          description: string;
          embeddings_provider: string;
          folder_id?: string | null;
          id?: string;
          image_model?: string | null;
          include_profile_context: boolean;
          include_workspace_instructions: boolean;
          model: string;
          name: string;
          prompt: string;
          sharing?: string;
          temperature: number;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          context_length?: number;
          created_at?: string;
          description?: string;
          embeddings_provider?: string;
          folder_id?: string | null;
          id?: string;
          image_model?: string | null;
          include_profile_context?: boolean;
          include_workspace_instructions?: boolean;
          model?: string;
          name?: string;
          prompt?: string;
          sharing?: string;
          temperature?: number;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "presets_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_images: {
        Row: {
          profile_image: string;
          user_id: string;
        };
        Insert: {
          profile_image: string;
          user_id: string;
        };
        Update: {
          profile_image?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          anthropic_api_key: string | null;
          azure_openai_35_turbo_id: string | null;
          azure_openai_45_turbo_id: string | null;
          azure_openai_45_vision_id: string | null;
          azure_openai_api_key: string | null;
          azure_openai_embeddings_id: string | null;
          azure_openai_endpoint: string | null;
          azure_openai_gpt5_id: string | null;
          azure_user_id: string | null;
          bio: string;
          created_at: string;
          dalle_api_key: string | null;
          deepseek_api_service_account: string | null;
          developer_mode: boolean | null;
          display_name: string;
          flux1_api_key: string | null;
          google_gemini_api_key: string | null;
          groq_api_key: string | null;
          has_onboarded: boolean;
          id: string;
          image_path: string;
          image_url: string;
          is_tempchat_popup: boolean | null;
          mistral_api_key: string | null;
          n8n_api_key: string | null;
          n8n_url: string | null;
          o1_preview_api_key: string | null;
          openai_api_key: string | null;
          openai_organization_id: string | null;
          openrouter_api_key: string | null;
          perplexity_api_key: string | null;
          profile_context: string;
          updated_at: string | null;
          use_azure_openai: boolean;
          user_id: string;
          username: string;
          azure_openai_o3_mini_id: string | null;
        };
        Insert: {
          anthropic_api_key?: string | null;
          azure_openai_35_turbo_id?: string | null;
          azure_openai_45_turbo_id?: string | null;
          azure_openai_45_vision_id?: string | null;
          azure_openai_api_key?: string | null;
          azure_openai_embeddings_id?: string | null;
          azure_openai_endpoint?: string | null;
          azure_openai_gpt5_id?: string | null;
          azure_user_id?: string | null;
          bio: string;
          created_at?: string;
          dalle_api_key?: string | null;
          deepseek_api_service_account?: string | null;
          developer_mode?: boolean | null;
          display_name: string;
          flux1_api_key?: string | null;
          google_gemini_api_key?: string | null;
          groq_api_key?: string | null;
          has_onboarded?: boolean;
          id?: string;
          image_path: string;
          image_url: string;
          is_tempchat_popup?: boolean | null;
          mistral_api_key?: string | null;
          n8n_api_key?: string | null;
          n8n_url?: string | null;
          o1_preview_api_key?: string | null;
          openai_api_key?: string | null;
          openai_organization_id?: string | null;
          openrouter_api_key?: string | null;
          perplexity_api_key?: string | null;
          profile_context: string;
          updated_at?: string | null;
          use_azure_openai: boolean;
          user_id: string;
          username: string;
          azure_openai_o3_mini_id?: string | null;
        };
        Update: {
          anthropic_api_key?: string | null;
          azure_openai_35_turbo_id?: string | null;
          azure_openai_45_turbo_id?: string | null;
          azure_openai_45_vision_id?: string | null;
          azure_openai_api_key?: string | null;
          azure_openai_embeddings_id?: string | null;
          azure_openai_endpoint?: string | null;
          azure_openai_gpt5_id?: string | null;
          azure_user_id?: string | null;
          bio?: string;
          created_at?: string;
          dalle_api_key?: string | null;
          deepseek_api_service_account?: string | null;
          developer_mode?: boolean | null;
          display_name?: string;
          flux1_api_key?: string | null;
          google_gemini_api_key?: string | null;
          groq_api_key?: string | null;
          has_onboarded?: boolean;
          id?: string;
          image_path?: string;
          image_url?: string;
          is_tempchat_popup?: boolean | null;
          mistral_api_key?: string | null;
          n8n_api_key?: string | null;
          n8n_url?: string | null;
          o1_preview_api_key?: string | null;
          openai_api_key?: string | null;
          openai_organization_id?: string | null;
          openrouter_api_key?: string | null;
          perplexity_api_key?: string | null;
          profile_context?: string;
          updated_at?: string | null;
          use_azure_openai?: boolean;
          user_id?: string;
          username?: string;
          azure_openai_o3_mini_id?: string | null;
        };
        Relationships: [];
      };
      prompt_workspaces: {
        Row: {
          created_at: string;
          prompt_id: string;
          updated_at: string | null;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          prompt_id: string;
          updated_at?: string | null;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          prompt_id?: string;
          updated_at?: string | null;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prompt_workspaces_prompt_id_fkey";
            columns: ["prompt_id"];
            isOneToOne: false;
            referencedRelation: "prompts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prompt_workspaces_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      prompts: {
        Row: {
          content: string;
          created_at: string;
          folder_id: string | null;
          id: string;
          name: string;
          sharing: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          folder_id?: string | null;
          id?: string;
          name: string;
          sharing?: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          folder_id?: string | null;
          id?: string;
          name?: string;
          sharing?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prompts_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
        ];
      };
      tool_workspaces: {
        Row: {
          created_at: string;
          tool_id: string;
          updated_at: string | null;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          tool_id: string;
          updated_at?: string | null;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          tool_id?: string;
          updated_at?: string | null;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tool_workspaces_tool_id_fkey";
            columns: ["tool_id"];
            isOneToOne: false;
            referencedRelation: "tools";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tool_workspaces_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      tools: {
        Row: {
          created_at: string;
          custom_headers: Json;
          description: string;
          folder_id: string | null;
          id: string;
          name: string;
          schema: Json;
          sharing: string;
          updated_at: string | null;
          url: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          custom_headers?: Json;
          description: string;
          folder_id?: string | null;
          id?: string;
          name: string;
          schema?: Json;
          sharing?: string;
          updated_at?: string | null;
          url: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          custom_headers?: Json;
          description?: string;
          folder_id?: string | null;
          id?: string;
          name?: string;
          schema?: Json;
          sharing?: string;
          updated_at?: string | null;
          url?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tools_folder_id_fkey";
            columns: ["folder_id"];
            isOneToOne: false;
            referencedRelation: "folders";
            referencedColumns: ["id"];
          },
        ];
      };
      user_groups: {
        Row: {
          azure_user_id: string;
          group_id: string;
          joined_at: string | null;
          user_id: string;
        };
        Insert: {
          azure_user_id: string;
          group_id: string;
          joined_at?: string | null;
          user_id: string;
        };
        Update: {
          azure_user_id?: string;
          group_id?: string;
          joined_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_groups_azure_user_id_fkey";
            columns: ["azure_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["azure_user_id"];
          },
          {
            foreignKeyName: "user_groups_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "azure_groups";
            referencedColumns: ["group_id"];
          },
          {
            foreignKeyName: "user_groups_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["user_id"];
          },
        ];
      };
      workspaces: {
        Row: {
          created_at: string;
          default_context_length: number;
          default_image_model: string | null;
          default_model: string;
          default_prompt: string;
          default_temperature: number;
          description: string;
          embeddings_provider: string;
          id: string;
          image_path: string;
          include_profile_context: boolean;
          include_workspace_instructions: boolean;
          instructions: string;
          is_home: boolean;
          name: string;
          sharing: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          default_context_length: number;
          default_image_model?: string | null;
          default_model: string;
          default_prompt: string;
          default_temperature: number;
          description: string;
          embeddings_provider: string;
          id?: string;
          image_path?: string;
          include_profile_context: boolean;
          include_workspace_instructions: boolean;
          instructions: string;
          is_home?: boolean;
          name: string;
          sharing?: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          default_context_length?: number;
          default_image_model?: string | null;
          default_model?: string;
          default_prompt?: string;
          default_temperature?: number;
          description?: string;
          embeddings_provider?: string;
          id?: string;
          image_path?: string;
          include_profile_context?: boolean;
          include_workspace_instructions?: boolean;
          instructions?: string;
          is_home?: boolean;
          name?: string;
          sharing?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      check_azure_groups_exists: {
        Args: { group_ids: string[] };
        Returns: boolean;
      };
      cleanup_old_n8n_logs: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      complete_last_thinkingcallback_step: {
        Args: {
          p_execution_id: string;
        };
        Returns: boolean;
      };
      create_duplicate_messages_for_new_chat: {
        Args: { new_chat_id: string; new_user_id: string; old_chat_id: string };
        Returns: undefined;
      };
      create_session_group_and_manage: {
        Args: {
          p_group_email?: string;
          p_group_id: string;
          p_group_name?: string;
          p_group_type?: string;
          p_is_selected?: boolean;
          p_user_id: string;
        };
        Returns: boolean;
      };
      create_workflow_execution: {
        Args: {
          p_webhook_id: string;
          p_user_id: string;
          p_chat_id?: string;
          p_request_data?: Json;
          p_timeout_minutes?: number;
        };
        Returns: string;
      };
      delete_expired_pii_audit_logs: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      delete_message_including_and_after: {
        Args: {
          p_chat_id: string;
          p_sequence_number: number;
          p_user_id: string;
        };
        Returns: undefined;
      };
      delete_messages_including_and_after: {
        Args: {
          p_chat_id: string;
          p_sequence_number: number;
          p_user_id: string;
        };
        Returns: undefined;
      };
      delete_storage_object: {
        Args: { bucket: string; object: string };
        Returns: Record<string, unknown>;
      };
      delete_storage_object_from_bucket: {
        Args: { bucket_name: string; object_path: string };
        Returns: Record<string, unknown>;
      };
      fetch_user_analytics: {
        Args: { end_date?: string; start_date?: string };
        Returns: {
          aiAssistantUses: number;
          aiModelRequests: Json;
          id: string;
          lastSignIn: string;
          username: string;
        }[];
      };
      get_active_users_by_date_range: {
        Args: { end_date: string; start_date: string };
        Returns: {
          chat_date: string;
          user_count: number;
        }[];
      };
      get_allowed_models_for_group: {
        Args: { p_group_id: string };
        Returns: {
          is_allowed: boolean;
          model_id: string;
        }[];
      };
      get_assistant_stats: {
        Args: Record<PropertyKey, never>;
        Returns: {
          id: string;
          name: string;
          description: string;
          created_at: string;
          group_id: string;
          group_name: string;
          email: string;
          chat_count: number;
        }[];
      };
      get_execution_with_steps: {
        Args: {
          p_execution_id: string;
          p_user_id: string;
        };
        Returns: {
          execution_id: string;
          webhook_id: string;
          status: string;
          current_step: number;
          total_steps: number;
          result: Json;
          error_message: string;
          started_at: string;
          completed_at: string;
          is_expired: boolean;
          steps: Json;
        }[];
      };
      get_model_counts: {
        Args: { model_name?: string; role_param: string; time_period: string };
        Returns: {
          count: number;
          model: string;
        }[];
      };
      get_model_stats: {
        Args:
          | { model_name?: string; role_param: string; time_period: string }
          | { role_param: string; time_period: string };
        Returns: {
          created_at: string;
          model: string;
        }[];
      };
      get_model_stats_aggregated: {
        Args: { model_name?: string; role_param: string; time_period: string };
        Returns: {
          count: number;
          date_key: string;
          model: string;
        }[];
      };
      get_monthly_active_users: {
        Args: { end_date: string; start_date: string };
        Returns: {
          month_start: string;
          user_count: number;
        }[];
      };
      get_request_count: {
        Args: { model_param: string; role_param: string; time_period: string };
        Returns: number;
      };
      get_top_users: {
        Args: {
          limit_param: number;
          model_param: string;
          role_param: string;
          time_period: string;
        };
        Returns: {
          email: string;
          message_count: number;
          user_id: string;
          username: string;
        }[];
      };
      get_user_selected_groups: {
        Args: { p_user_id: string };
        Returns: {
          email: string;
          group_id: string;
          name: string;
          type: string;
        }[];
      };
      get_user_stats: {
        Args: {
          model_param: string;
          page_param: number;
          per_page?: number;
          role_param: string;
          time_period: string;
        };
        Returns: {
          email: string;
          message_count: number;
          user_id: string;
          username: string;
        }[];
      };
      get_webhook_statistics: {
        Args: { p_days?: number; p_user_id: string };
        Returns: {
          active_webhooks: number;
          avg_execution_time_ms: number;
          failed_calls: number;
          success_rate: number;
          successful_calls: number;
          total_calls: number;
          total_webhooks: number;
        }[];
      };
      get_webhook_usage_by_model: {
        Args: { p_days?: number; p_user_id: string };
        Returns: {
          model_id: string;
          success_rate: number;
          webhook_calls: number;
        }[];
      };
      get_webhooks_for_assistant: {
        Args: { p_assistant_id: string; p_user_id: string };
        Returns: {
          custom_headers: Json;
          description: string;
          http_method: string;
          id: string;
          name: string;
          schema: Json;
          status: string;
          webhook_url: string;
          thinking_steps_enabled: boolean;
          timeout_minutes: number;
        }[];
      };
      get_webhooks_for_model: {
        Args: { p_model_id: string; p_user_id: string };
        Returns: {
          custom_headers: Json;
          description: string;
          http_method: string;
          id: string;
          name: string;
          schema: Json;
          status: string;
          webhook_url: string;
          thinking_steps_enabled: boolean;
          timeout_minutes: number;
        }[];
      };
      get_weekly_active_users: {
        Args: { end_date: string; start_date: string };
        Returns: {
          user_count: number;
          week_start: string;
        }[];
      };
      initialize_managed_groups_for_user: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      is_admin: {
        Args: { user_id: string };
        Returns: boolean;
      };
      is_model_allowed_for_group: {
        Args: { p_group_id: string; p_model_id: string };
        Returns: boolean;
      };
      log_async_execution_completion: {
        Args: {
          p_execution_id: string;
          p_status: string;
          p_error_message?: string;
          p_response_data?: Json;
        };
        Returns: string;
      };
      log_webhook_execution: {
        Args: {
          p_assistant_id: string;
          p_chat_id: string;
          p_error_message: string;
          p_execution_time_ms: number;
          p_http_status_code: number;
          p_model_id: string;
          p_request_data: Json;
          p_response_data: Json;
          p_status: string;
          p_user_id: string;
          p_webhook_id: string;
        };
        Returns: string;
      };
      match_file_items_local: {
        Args: {
          file_ids?: string[];
          match_count?: number;
          query_embedding: string;
        };
        Returns: {
          content: string;
          file_id: string;
          id: string;
          similarity: number;
          tokens: number;
        }[];
      };
      match_file_items_openai: {
        Args: {
          file_ids?: string[];
          match_count?: number;
          query_embedding: string;
        };
        Returns: {
          content: string;
          file_id: string;
          id: string;
          similarity: number;
          tokens: number;
        }[];
      };
      non_private_assistant_exists: {
        Args: { p_name: string };
        Returns: boolean;
      };
      non_private_file_exists: {
        Args: { p_name: string };
        Returns: boolean;
      };
      non_private_workspace_exists: {
        Args: { p_name: string };
        Returns: boolean;
      };
      update_execution_from_callback: {
        Args: {
          p_execution_id: string;
          p_status?: string;
          p_current_step?: number;
          p_total_steps?: number;
          p_result?: Json;
          p_error_message?: string;
          p_n8n_execution_id?: string;
        };
        Returns: boolean;
      };
      upsert_thinkingcallback_step: {
        Args: {
          p_execution_id: string;
          p_step_value: string;
        };
        Returns: string;
      };
      upsert_workflow_step: {
        Args: {
          p_execution_id: string;
          p_step_number: number;
          p_step_name: string;
          p_status: string;
          p_metadata?: Json;
        };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null;
          avif_autodetection: boolean | null;
          created_at: string | null;
          file_size_limit: number | null;
          id: string;
          name: string;
          owner: string | null;
          owner_id: string | null;
          public: boolean | null;
          type: Database["storage"]["Enums"]["buckettype"];
          updated_at: string | null;
        };
        Insert: {
          allowed_mime_types?: string[] | null;
          avif_autodetection?: boolean | null;
          created_at?: string | null;
          file_size_limit?: number | null;
          id: string;
          name: string;
          owner?: string | null;
          owner_id?: string | null;
          public?: boolean | null;
          type?: Database["storage"]["Enums"]["buckettype"];
          updated_at?: string | null;
        };
        Update: {
          allowed_mime_types?: string[] | null;
          avif_autodetection?: boolean | null;
          created_at?: string | null;
          file_size_limit?: number | null;
          id?: string;
          name?: string;
          owner?: string | null;
          owner_id?: string | null;
          public?: boolean | null;
          type?: Database["storage"]["Enums"]["buckettype"];
          updated_at?: string | null;
        };
        Relationships: [];
      };
      buckets_analytics: {
        Row: {
          created_at: string;
          format: string;
          id: string;
          type: Database["storage"]["Enums"]["buckettype"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          format?: string;
          id: string;
          type?: Database["storage"]["Enums"]["buckettype"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          format?: string;
          id?: string;
          type?: Database["storage"]["Enums"]["buckettype"];
          updated_at?: string;
        };
        Relationships: [];
      };
      iceberg_namespaces: {
        Row: {
          bucket_id: string;
          created_at: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_bucket_id_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "buckets_analytics";
            referencedColumns: ["id"];
          },
        ];
      };
      iceberg_tables: {
        Row: {
          bucket_id: string;
          created_at: string;
          id: string;
          location: string;
          name: string;
          namespace_id: string;
          updated_at: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          id?: string;
          location: string;
          name: string;
          namespace_id: string;
          updated_at?: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          id?: string;
          location?: string;
          name?: string;
          namespace_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_bucket_id_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "buckets_analytics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey";
            columns: ["namespace_id"];
            isOneToOne: false;
            referencedRelation: "iceberg_namespaces";
            referencedColumns: ["id"];
          },
        ];
      };
      migrations: {
        Row: {
          executed_at: string | null;
          hash: string;
          id: number;
          name: string;
        };
        Insert: {
          executed_at?: string | null;
          hash: string;
          id: number;
          name: string;
        };
        Update: {
          executed_at?: string | null;
          hash?: string;
          id?: number;
          name?: string;
        };
        Relationships: [];
      };
      objects: {
        Row: {
          bucket_id: string | null;
          created_at: string | null;
          id: string;
          last_accessed_at: string | null;
          level: number | null;
          metadata: Json | null;
          name: string | null;
          owner: string | null;
          owner_id: string | null;
          path_tokens: string[] | null;
          updated_at: string | null;
          user_metadata: Json | null;
          version: string | null;
        };
        Insert: {
          bucket_id?: string | null;
          created_at?: string | null;
          id?: string;
          last_accessed_at?: string | null;
          level?: number | null;
          metadata?: Json | null;
          name?: string | null;
          owner?: string | null;
          owner_id?: string | null;
          path_tokens?: string[] | null;
          updated_at?: string | null;
          user_metadata?: Json | null;
          version?: string | null;
        };
        Update: {
          bucket_id?: string | null;
          created_at?: string | null;
          id?: string;
          last_accessed_at?: string | null;
          level?: number | null;
          metadata?: Json | null;
          name?: string | null;
          owner?: string | null;
          owner_id?: string | null;
          path_tokens?: string[] | null;
          updated_at?: string | null;
          user_metadata?: Json | null;
          version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "buckets";
            referencedColumns: ["id"];
          },
        ];
      };
      prefixes: {
        Row: {
          bucket_id: string;
          created_at: string | null;
          level: number;
          name: string;
          updated_at: string | null;
        };
        Insert: {
          bucket_id: string;
          created_at?: string | null;
          level?: number;
          name: string;
          updated_at?: string | null;
        };
        Update: {
          bucket_id?: string;
          created_at?: string | null;
          level?: number;
          name?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "prefixes_bucketId_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "buckets";
            referencedColumns: ["id"];
          },
        ];
      };
      s3_multipart_uploads: {
        Row: {
          bucket_id: string;
          created_at: string;
          id: string;
          in_progress_size: number;
          key: string;
          owner_id: string | null;
          upload_signature: string;
          user_metadata: Json | null;
          version: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          id: string;
          in_progress_size?: number;
          key: string;
          owner_id?: string | null;
          upload_signature: string;
          user_metadata?: Json | null;
          version: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          id?: string;
          in_progress_size?: number;
          key?: string;
          owner_id?: string | null;
          upload_signature?: string;
          user_metadata?: Json | null;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "buckets";
            referencedColumns: ["id"];
          },
        ];
      };
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string;
          created_at: string;
          etag: string;
          id: string;
          key: string;
          owner_id: string | null;
          part_number: number;
          size: number;
          upload_id: string;
          version: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          etag: string;
          id?: string;
          key: string;
          owner_id?: string | null;
          part_number: number;
          size?: number;
          upload_id: string;
          version: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          etag?: string;
          id?: string;
          key?: string;
          owner_id?: string | null;
          part_number?: number;
          size?: number;
          upload_id?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey";
            columns: ["bucket_id"];
            isOneToOne: false;
            referencedRelation: "buckets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: false;
            referencedRelation: "s3_multipart_uploads";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_prefixes: {
        Args: { _bucket_id: string; _name: string };
        Returns: undefined;
      };
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string };
        Returns: undefined;
      };
      delete_leaf_prefixes: {
        Args: { bucket_ids: string[]; names: string[] };
        Returns: undefined;
      };
      delete_prefix: {
        Args: { _bucket_id: string; _name: string };
        Returns: boolean;
      };
      extension: {
        Args: { name: string };
        Returns: string;
      };
      filename: {
        Args: { name: string };
        Returns: string;
      };
      foldername: {
        Args: { name: string };
        Returns: string[];
      };
      get_level: {
        Args: { name: string };
        Returns: number;
      };
      get_prefix: {
        Args: { name: string };
        Returns: string;
      };
      get_prefixes: {
        Args: { name: string };
        Returns: string[];
      };
      get_size_by_bucket: {
        Args: Record<PropertyKey, never>;
        Returns: {
          bucket_id: string;
          size: number;
        }[];
      };
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string;
          delimiter_param: string;
          max_keys?: number;
          next_key_token?: string;
          next_upload_token?: string;
          prefix_param: string;
        };
        Returns: {
          created_at: string;
          id: string;
          key: string;
        }[];
      };
      list_objects_with_delimiter: {
        Args: {
          bucket_id: string;
          delimiter_param: string;
          max_keys?: number;
          next_token?: string;
          prefix_param: string;
          start_after?: string;
        };
        Returns: {
          id: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
      lock_top_prefixes: {
        Args: { bucket_ids: string[]; names: string[] };
        Returns: undefined;
      };
      operation: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      search: {
        Args: {
          bucketname: string;
          levels?: number;
          limits?: number;
          offsets?: number;
          prefix: string;
          search?: string;
          sortcolumn?: string;
          sortorder?: string;
        };
        Returns: {
          created_at: string;
          id: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
      search_legacy_v1: {
        Args: {
          bucketname: string;
          levels?: number;
          limits?: number;
          offsets?: number;
          prefix: string;
          search?: string;
          sortcolumn?: string;
          sortorder?: string;
        };
        Returns: {
          created_at: string;
          id: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
      search_v1_optimised: {
        Args: {
          bucketname: string;
          levels?: number;
          limits?: number;
          offsets?: number;
          prefix: string;
          search?: string;
          sortcolumn?: string;
          sortorder?: string;
        };
        Returns: {
          created_at: string;
          id: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
      search_v2: {
        Args: {
          bucket_name: string;
          levels?: number;
          limits?: number;
          prefix: string;
          sort_column?: string;
          sort_column_after?: string;
          sort_order?: string;
          start_after?: string;
        };
        Returns: {
          created_at: string;
          id: string;
          key: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
    };
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS"],
    },
  },
} as const;
