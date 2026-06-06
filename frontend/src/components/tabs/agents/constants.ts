import type { AgentState, GeneratedLot } from '../../../types';
import type { AgentNodeKey, InsightItem, NodePosition, SimulationStep } from './types';

export const INITIAL_AGENT_STATES: Record<string, AgentState> = {
  CategorySelector: { agent_name: 'CategorySelector', status: 'pending', tokens_used: 0 },
  Memory:           { agent_name: 'Memory',           status: 'pending', tokens_used: 0 },
  ListingAnalyzer:  { agent_name: 'ListingAnalyzer',  status: 'pending', tokens_used: 0 },
  LotGenerator:     { agent_name: 'LotGenerator',     status: 'pending', tokens_used: 0 },
  Publisher:        { agent_name: 'Publisher',         status: 'pending', tokens_used: 0 },

  // CategorySelector sub-agents
  TrendResearcher:  { agent_name: 'TrendResearcher',  status: 'pending', tokens_used: 0, parent_agent: 'CategorySelector' },
  TrendScanner:     { agent_name: 'TrendScanner',     status: 'pending', tokens_used: 0, parent_agent: 'CategorySelector' },
  MemoryReader:     { agent_name: 'MemoryReader',     status: 'pending', tokens_used: 0, parent_agent: 'CategorySelector' },
  CategoryRanker:   { agent_name: 'CategoryRanker',   status: 'pending', tokens_used: 0, parent_agent: 'CategorySelector' },

  // ListingAnalyzer sub-agents
  MarketScraper:       { agent_name: 'MarketScraper',       status: 'pending', tokens_used: 0, parent_agent: 'ListingAnalyzer' },
  WebResearcher:       { agent_name: 'WebResearcher',       status: 'pending', tokens_used: 0, parent_agent: 'ListingAnalyzer' },
  MarginAnalyst:       { agent_name: 'MarginAnalyst',       status: 'pending', tokens_used: 0, parent_agent: 'ListingAnalyzer' },
  InsightWriter:       { agent_name: 'InsightWriter',       status: 'pending', tokens_used: 0, parent_agent: 'ListingAnalyzer' },
  MarketClassifier:    { agent_name: 'MarketClassifier',    status: 'pending', tokens_used: 0, parent_agent: 'ListingAnalyzer' },

  // LotGenerator sub-agents
  SupplyStrategist:    { agent_name: 'SupplyStrategist',    status: 'pending', tokens_used: 0, parent_agent: 'LotGenerator' },
  CopywriterAgent:     { agent_name: 'CopywriterAgent',     status: 'pending', tokens_used: 0, parent_agent: 'LotGenerator' },
  PricingAgent:        { agent_name: 'PricingAgent',        status: 'pending', tokens_used: 0, parent_agent: 'LotGenerator' },
  SEOAgent:            { agent_name: 'SEOAgent',            status: 'pending', tokens_used: 0, parent_agent: 'LotGenerator' },
  ResellScout:         { agent_name: 'ResellScout',         status: 'pending', tokens_used: 0, parent_agent: 'LotGenerator' },
  DigitalIdeator:      { agent_name: 'DigitalIdeator',      status: 'pending', tokens_used: 0, parent_agent: 'LotGenerator' },

  // Publisher sub-agents
  QualityChecker:      { agent_name: 'QualityChecker',      status: 'pending', tokens_used: 0, parent_agent: 'Publisher' },
  DuplicateFilter:     { agent_name: 'DuplicateFilter',     status: 'pending', tokens_used: 0, parent_agent: 'Publisher' },
  TemplateExporter:    { agent_name: 'TemplateExporter',    status: 'pending', tokens_used: 0, parent_agent: 'Publisher' },
};

export const INITIAL_NODE_POSITIONS: Record<AgentNodeKey, NodePosition> = {
  Base:      { x: 100,  y: 250 },
  Selector:  { x: 350,  y: 120 },
  Memory:    { x: 350,  y: 380 },
  Analyzer:  { x: 600,  y: 250 },
  Generator: { x: 850,  y: 120 },
  LotsNode:  { x: 850,  y: 380 },
};

export const MOCK_INSIGHTS: InsightItem[] = [
  {
    id: 1,
    game: 'World of Warcraft',
    category: 'Валюта',
    trend: 'Рост спроса +24%',
    similarity: '98.7%',
    text: 'Цены на золото в WoW Retail на европейских серверах выросли после релиза нового рейда. Среднее время выкупа — 8 минут.',
    tags: ['WoW', 'Gold', 'EU', 'High-Demand'],
    date: 'Сегодня, 14:12',
  },
  {
    id: 2,
    game: 'Counter-Strike 2',
    category: 'Услуги',
    trend: 'Высокая маржа',
    similarity: '96.4%',
    text: 'Калибровка аккаунтов CS2 показывает стабильный спрос по выходным. Рекомендуется продавать с акцентом на срок выполнения и гарантию.',
    tags: ['CS2', 'Boost', 'Premier'],
    date: 'Сегодня, 11:35',
  },
  {
    id: 3,
    game: 'GTA V',
    category: 'Аккаунты',
    trend: 'Стабильный спрос',
    similarity: '94.2%',
    text: 'Аккаунты Social Club с высоким балансом GTA Online имеют высокий чек, но чувствительны к качеству описания и наличию смены почты.',
    tags: ['GTA5', 'Accounts', 'High-Margin'],
    date: 'Вчера, 18:24',
  },
  {
    id: 4,
    game: 'Genshin Impact',
    category: 'Предметы',
    trend: 'Взрывной интерес',
    similarity: '97.5%',
    text: 'Всплеск спроса на внутриигровую валюту и донат-услуги после выхода нового персонажа. Хорошо работают безопасные офферы с понятными условиями.',
    tags: ['Genshin', 'Donate', 'Crystals'],
    date: 'Вчера, 15:10',
  },
];

export const getSimulationSteps = (lot: GeneratedLot | null): SimulationStep[] => [
  { label: 'Подготовка шаблона',  desc: 'Проверяем структуру карточки и заполняем обязательные поля шаблона.' },
  { label: 'Сбор параметров',     desc: 'Подтягиваем категорию, цену, количество и дополнительные поля лота.' },
  { label: 'Формирование описания', desc: 'Переносим заголовок и описание в шаблон публикации.' },
  { label: 'Проверка значений',   desc: `Сверяем цену ${lot?.price ?? 0} ₽ и количество ${lot?.amount ?? 1} шт. перед сохранением.` },
  { label: 'Сохранение шаблона',  desc: 'Создаём или обновляем рабочий шаблон в системе.' },
  { label: 'Готово',              desc: 'Лот сохранён в шаблоны и готов к дальнейшей публикации.' },
];

// ─── Метаданные типов лотов ────────────────────────────────────────────────
export type LotTypeMeta = {
  label: string;
  emoji: string;
  badgeCls: string;          // Tailwind-классы для бейджа
  iconBg: string;            // фон иконки карточки
  iconText: string;          // цвет иконки карточки
  borderActive: string;      // бордер при раскрытой карточке
  description: string;       // подсказка
};

export const LOT_TYPE_META: Record<string, LotTypeMeta> = {
  classic: {
    label: 'Классик',
    emoji: '🎮',
    badgeCls: 'bg-slate-400/10 text-slate-300 border-slate-400/20',
    iconBg: 'bg-slate-400/10',
    iconText: 'text-slate-400',
    borderActive: 'border-slate-400/25',
    description: 'Обычный лот — валюта, ресурсы, аккаунт',
  },
  digital: {
    label: 'Цифровой',
    emoji: '📄',
    badgeCls: 'bg-violet-400/10 text-violet-300 border-violet-400/20',
    iconBg: 'bg-violet-500/10',
    iconText: 'text-violet-400',
    borderActive: 'border-violet-400/25',
    description: 'PDF, гайд, чеклист, шаблон — без игрового аккаунта',
  },
  resell: {
    label: 'Перепродажа',
    emoji: '🔄',
    badgeCls: 'bg-amber-400/10 text-amber-300 border-amber-400/20',
    iconBg: 'bg-amber-500/10',
    iconText: 'text-amber-400',
    borderActive: 'border-amber-400/25',
    description: 'Покупаешь у поставщика дешевле → продаёшь дороже',
  },
  service: {
    label: 'Услуга',
    emoji: '🛠',
    badgeCls: 'bg-sky-400/10 text-sky-300 border-sky-400/20',
    iconBg: 'bg-sky-500/10',
    iconText: 'text-sky-400',
    borderActive: 'border-sky-400/25',
    description: 'Консультация, помощь, буст — без передачи аккаунта',
  },
};

// Хелпер: возвращает мета объект, fallback на classic
export function getLotTypeMeta(type?: string | null): LotTypeMeta {
  return LOT_TYPE_META[type ?? 'classic'] ?? LOT_TYPE_META.classic;
}
