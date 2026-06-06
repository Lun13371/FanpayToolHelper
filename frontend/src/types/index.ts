export interface User {
  id: number;
  username: string;
  role: string;
  is_approved?: boolean;
  created_at?: string;
}

export interface FanpayAccount {
  id: number;
  name: string;
  golden_key?: string;
  proxy_url?: string | null;
  telegram_chat_id?: string | null;
  active?: boolean;
  is_active?: boolean;
  last_status: string;
  next_raise?: string | null;
  last_synced?: string | null;
  last_raised?: string | null;
  balance?: number | null;
  rating?: number | null;
  reviews_count?: number | null;
  system_prompt?: string | null;
  fallback_template?: string | null;
  always_online?: boolean;
  auto_raise_active?: boolean;
  auto_delivery_active?: boolean;
  ai_reply_active?: boolean;
  operator_snooze_minutes?: number;
  review_followup_active?: boolean;
  global_damping_active?: boolean;
  global_undercut_value?: number;
  global_min_price?: number;
  created_at?: string;
  updated_at?: string;
}

export interface LogMessage {
  timestamp: string;
  level: string;
  message: string;
}

export interface AIKey {
  id: number;
  key_value: string;
  is_active: boolean;
  total_calls?: number;
  error_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface WarehouseItem {
  id: number;
  account_id?: number;
  lot_name: string;
  content: string;
  is_multi_use: boolean;
  is_sold?: boolean;
  created_at?: string;
}

export interface ReviewTemplate {
  id: number;
  account_id?: number;
  text: string;
  created_at?: string;
}

export interface LotSettings {
  id: number;
  account_id: number;
  lot_id: string;
  lot_name: string;
  min_price: number;
  undercut_value: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LotTemplate {
  id: number;
  name: string;
  min_price: number;
  undercut_value: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LotCreationTemplate {
  id: number;
  name: string;
  node_id: string;
  game_name: string;
  subcategory_name: string;
  fields: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface AgentRun {
  id: number;
  status: 'idle' | 'running' | 'completed' | 'failed';
  mode: 'auto' | 'manual' | 'full';
  limit_categories: number;
  target_account_id?: number;
  total_cost_tokens: number;
  created_at: string;
  completed_at?: string;
  lots_count?: number;
  categories_done?: number;
  categories_total?: number;
}

export interface AgentState {
  id?: number;
  agent_name: string;
  parent_agent?: string | null;
  category_context?: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  current_task?: string;
  progress?: number;
  tokens_used: number;
  retry_count?: number;
  error_message?: string | null;
  updated_at?: string;
}

export interface AgentLog {
  id: number;
  run_id?: number;
  agent_name: string;
  parent_agent?: string | null;
  category_context?: string | null;
  message: string;
  level: 'info' | 'warning' | 'error' | 'success';
  created_at: string;
}

export interface GeneratedLot {
  id: number;
  run_id: number;
  game_name: string;
  subcategory_name: string;
  title: string;
  description: string;
  price: number;
  amount: number;
  fields_json: Record<string, any>;
  ai_reasoning: string;
  price_min_market?: number | null;
  price_max_market?: number | null;
  price_avg_market?: number | null;
  price_strategy?: string | null;
  created_at?: string;
}
