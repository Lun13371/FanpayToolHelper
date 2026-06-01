export interface User {
  id: number;
  username: string;
  role: 'admin' | 'owner' | 'manager';
  is_approved: boolean;
  is_active: boolean;
}

export interface FanpayAccount {
  id: number;
  name: string;
  is_active: boolean;
  last_status: string;
  proxy_url?: string;
  golden_key?: string;
  system_prompt: string;
  fallback_template: string;
  
  // Новые настройки сессии и ИИ
  always_online: boolean;
  auto_raise_active: boolean;
  auto_delivery_active: boolean;
  ai_reply_active: boolean;
  operator_snooze_minutes: number;
  review_followup_active: boolean;

  funpay_user_id?: string;
  balance?: number;
  rating?: number;
  reviews_count?: number;
  last_raised?: string;
  last_synced?: string;
  next_raise?: string;
  telegram_chat_id?: string;
  lots_cache?: any[];
  global_damping_active?: boolean;
  global_undercut_value?: number;
  global_min_price?: number;
  created_at: string;
}

export interface LotTemplate {
  id: number;
  user_id: number;
  name: string;
  min_price: number;
  undercut_value: number;
  is_active: boolean;
  created_at: string;
}

export interface LotCreationTemplate {
  id: number;
  user_id: number;
  name: string;
  node_id: string;
  game_name: string;
  subcategory_name: string;
  fields: Record<string, any>;
  created_at: string;
}

export interface LogMessage {
  timestamp: string;
  level: string;
  message: string;
}

export interface LotSettings {
  id: number;
  account_id: number;
  lot_id: string;
  lot_name: string;
  min_price: number;
  undercut_value: number;
  is_active: boolean;
}

export interface WarehouseItem {
  id: number;
  account_id: number;
  lot_name: string;
  content: string;
  is_multi_use: boolean;
  is_sold: boolean;
}

export interface ReviewTemplate {
  id: number;
  account_id: number;
  text: string;
}

export interface AIKey {
  id: number;
  key_value: string;
  is_active: boolean;
  total_calls: number;
  error_count: number;
  last_used_at: string;
}
