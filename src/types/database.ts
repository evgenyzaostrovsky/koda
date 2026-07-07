export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          name: string;
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
          user_id: string;
          content: string;
          mood: Database['public']['Enums']['journal_mood'] | null;
          ai_insight: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          content: string;
          mood?: Database['public']['Enums']['journal_mood'] | null;
          ai_insight?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['journal_entries']['Insert']>;
      };
    };
    Enums: {
      onboarding_status: 'not_started' | 'in_progress' | 'completed' | 'skipped';
      goal_status: 'active' | 'completed' | 'paused' | 'archived';
      goal_step_status: 'pending' | 'completed' | 'skipped';
      quest_status: 'pending' | 'completed' | 'skipped' | 'expired';
      quest_difficulty: 'micro' | 'easy' | 'medium' | 'hard' | 'keystone';
      xp_transaction_type: 'quest_completed' | 'bonus' | 'manual_adjustment' | 'level_reward';
      xp_source_type: 'quest' | 'goal' | 'attribute' | 'system';
      journal_mood: 'bad' | 'low' | 'neutral' | 'good' | 'great';
      ai_provider: 'gemini' | 'openrouter' | 'rules';
    };
  };
};

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type Inserts<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type Updates<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
