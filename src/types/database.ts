export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          name: string;
          username: string | null;
          avatar_url: string | null;
          timezone: string;
          onboarding_status: Database['public']['Enums']['onboarding_status'];
          current_streak: number;
          longest_streak: number;
          last_quest_completed_on: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          name?: string;
          username?: string | null;
          avatar_url?: string | null;
          timezone?: string;
          onboarding_status?: Database['public']['Enums']['onboarding_status'];
          current_streak?: number;
          longest_streak?: number;
          last_quest_completed_on?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      onboarding_sessions: {
        Row: {
          id: string;
          user_id: string;
          status: Database['public']['Enums']['onboarding_status'];
          current_step: string | null;
          answers: Json;
          selected_attributes: string[];
          generated_future_self: Json | null;
          ai_provider: Database['public']['Enums']['ai_provider'] | null;
          created_at: string;
          completed_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          status?: Database['public']['Enums']['onboarding_status'];
          current_step?: string | null;
          answers?: Json;
          selected_attributes?: string[];
          generated_future_self?: Json | null;
          ai_provider?: Database['public']['Enums']['ai_provider'] | null;
          created_at?: string;
          completed_at?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['onboarding_sessions']['Insert']>;
      };
      future_self: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          archetype: string;
          level: number;
          current_xp: number;
          total_xp: number;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          archetype?: string;
          level?: number;
          current_xp?: number;
          total_xp?: number;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['future_self']['Insert']>;
      };
      attributes: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          slug: string;
          level: number;
          xp: number;
          total_xp: number;
          icon: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          slug: string;
          level?: number;
          xp?: number;
          total_xp?: number;
          icon?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['attributes']['Insert']>;
      };
      goals: {
        Row: {
          id: string;
          user_id: string;
          attribute_id: string | null;
          title: string;
          description: string | null;
          status: Database['public']['Enums']['goal_status'];
          progress: number;
          target_date: string | null;
          desired_result: string | null;
          deadline: string | null;
          priority: Database['public']['Enums']['goal_priority'];
          completed_at: string | null;
          archived_at: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          attribute_id?: string | null;
          title: string;
          description?: string | null;
          status?: Database['public']['Enums']['goal_status'];
          progress?: number;
          target_date?: string | null;
          desired_result?: string | null;
          deadline?: string | null;
          priority?: Database['public']['Enums']['goal_priority'];
          completed_at?: string | null;
          archived_at?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['goals']['Insert']>;
      };
      goal_steps: {
        Row: {
          id: string;
          goal_id: string;
          title: string;
          status: Database['public']['Enums']['goal_step_status'];
          sort_order: number;
          xp_reward: number;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          goal_id: string;
          title: string;
          status?: Database['public']['Enums']['goal_step_status'];
          sort_order?: number;
          xp_reward?: number;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['goal_steps']['Insert']>;
      };
      goal_milestones: {
        Row: {
          id: string;
          goal_id: string;
          user_id: string;
          title: string;
          description: string | null;
          deadline: string | null;
          status: Database['public']['Enums']['goal_milestone_status'];
          position: number;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          goal_id: string;
          user_id: string;
          title: string;
          description?: string | null;
          deadline?: string | null;
          status?: Database['public']['Enums']['goal_milestone_status'];
          position?: number;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['goal_milestones']['Insert']>;
      };
      goal_actions: {
        Row: {
          id: string;
          goal_id: string;
          milestone_id: string | null;
          user_id: string;
          title: string;
          description: string | null;
          due_date: string | null;
          estimated_minutes: number | null;
          importance: Database['public']['Enums']['goal_action_importance'];
          status: Database['public']['Enums']['goal_action_status'];
          position: number;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          goal_id: string;
          milestone_id?: string | null;
          user_id: string;
          title: string;
          description?: string | null;
          due_date?: string | null;
          estimated_minutes?: number | null;
          importance?: Database['public']['Enums']['goal_action_importance'];
          status?: Database['public']['Enums']['goal_action_status'];
          position?: number;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['goal_actions']['Insert']>;
      };
      goal_routines: {
        Row: {
          id: string;
          goal_id: string;
          user_id: string;
          title: string;
          metric_type: Database['public']['Enums']['goal_routine_metric_type'];
          target_value: number;
          frequency_type: Database['public']['Enums']['goal_routine_frequency_type'];
          weekdays: number[];
          start_date: string;
          end_date: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          goal_id: string;
          user_id: string;
          title: string;
          metric_type?: Database['public']['Enums']['goal_routine_metric_type'];
          target_value?: number;
          frequency_type?: Database['public']['Enums']['goal_routine_frequency_type'];
          weekdays?: number[];
          start_date?: string;
          end_date?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['goal_routines']['Insert']>;
      };
      goal_routine_logs: {
        Row: {
          id: string;
          routine_id: string;
          goal_id: string;
          user_id: string;
          log_date: string;
          value: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          routine_id: string;
          goal_id: string;
          user_id: string;
          log_date: string;
          value?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['goal_routine_logs']['Insert']>;
      };
      quests: {
        Row: {
          id: string;
          user_id: string;
          goal_id: string | null;
          goal_step_id: string | null;
          attribute_id: string | null;
          title: string;
          description: string | null;
          xp_reward: number;
          difficulty: Database['public']['Enums']['quest_difficulty'];
          status: Database['public']['Enums']['quest_status'];
          due_date: string;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          goal_id?: string | null;
          goal_step_id?: string | null;
          attribute_id?: string | null;
          title: string;
          description?: string | null;
          xp_reward?: number;
          difficulty?: Database['public']['Enums']['quest_difficulty'];
          status?: Database['public']['Enums']['quest_status'];
          due_date: string;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['quests']['Insert']>;
      };
      xp_transactions: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          type: Database['public']['Enums']['xp_transaction_type'];
          source_type: Database['public']['Enums']['xp_source_type'];
          source_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount: number;
          type: Database['public']['Enums']['xp_transaction_type'];
          source_type: Database['public']['Enums']['xp_source_type'];
          source_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['xp_transactions']['Insert']>;
      };
      journal_entries: {
        Row: {
          id: string;
          user_id: string | null;
          owner_key: string;
          content: string;
          mood: Database['public']['Enums']['journal_mood'] | null;
          entry_date: string;
          sleep_start_time: string | null;
          wake_time: string | null;
          sleep_duration_minutes: number | null;
          day_tags: string[];
          ai_insight: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          owner_key?: string;
          content: string;
          mood?: Database['public']['Enums']['journal_mood'] | null;
          entry_date?: string;
          sleep_start_time?: string | null;
          wake_time?: string | null;
          sleep_duration_minutes?: number | null;
          day_tags?: string[];
          ai_insight?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['journal_entries']['Insert']>;
      };
    };
    Enums: {
      onboarding_status: 'not_started' | 'in_progress' | 'completed' | 'skipped';
      goal_status: 'active' | 'completed' | 'paused' | 'archived';
      goal_priority: 'main' | 'important' | 'supporting';
      goal_milestone_status: 'not_started' | 'in_progress' | 'completed';
      goal_action_status: 'pending' | 'completed';
      goal_action_importance: 'normal' | 'key';
      goal_routine_metric_type: 'boolean' | 'minutes' | 'count';
      goal_routine_frequency_type: 'daily' | 'weekly' | 'monthly' | 'selected_weekdays';
      goal_step_status: 'pending' | 'completed' | 'skipped';
      quest_status: 'pending' | 'completed' | 'skipped' | 'expired';
      quest_difficulty: 'micro' | 'easy' | 'medium' | 'hard' | 'keystone';
      xp_transaction_type: 'quest_completed' | 'bonus' | 'manual_adjustment' | 'level_reward';
      xp_source_type: 'quest' | 'goal' | 'attribute' | 'system';
      journal_mood: 'bad' | 'low' | 'neutral' | 'good' | 'great';
      ai_provider: 'gemini' | 'openrouter' | 'rules';
    };
    Functions: {
      get_email_by_username: {
        Args: { login_value: string };
        Returns: string | null;
      };
    };
  };
};

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type Inserts<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type Updates<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
