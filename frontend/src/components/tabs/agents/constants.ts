import type { AgentState, GeneratedLot } from '../../../types';
import type { AgentNodeKey, InsightItem, NodePosition, SimulationStep } from './types';

export const INITIAL_AGENT_STATES: Record<string, AgentState> = {
  CategorySelector: { status: 'pending', tokens_used: 0 },
  Memory:           { status: 'pending', tokens_used: 0 },
  ListingAnalyzer:  { status: 'pending', tokens_used: 0 },
  LotGenerator:     { status: 'pending', tokens_used: 0 },
  Publisher:        { status: 'pending', tokens_used: 0 },
};

export const INITIAL_NODE_POSITIONS: Record<AgentNodeKey, NodePosition> = {
  Base: { x: 100, y: 250 },
  Selector: { x: 350, y: 120 },
  Memory: { x: 350, y: 380 },
  Analyzer: { x: 600, y: 250 },
  Generator: { x: 850, y: 120 },
  LotsNode: { x: 850, y: 380 },
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
  { label: 'Подготовка шаблона', desc: 'Проверяем структуру карточки и заполняем обязательные поля шаблона.' },
  { label: 'Сбор параметров', desc: 'Подтягиваем категорию, цену, количество и дополнительные поля лота.' },
  { label: 'Формирование описания', desc: 'Переносим заголовок и описание в шаблон публикации.' },
  { label: 'Проверка значений', desc: `Сверяем цену ${lot?.price ?? 0} ₽ и количество ${lot?.amount ?? 1} шт. перед сохранением.` },
  { label: 'Сохранение шаблона', desc: 'Создаём или обновляем рабочий шаблон в системе.' },
  { label: 'Готово', desc: 'Лот сохранён в шаблоны и готов к дальнейшей публикации.' },
];
