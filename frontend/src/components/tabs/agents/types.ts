import type { AgentLog, AgentRun, AgentState, GeneratedLot } from '../../../types';

export type AgentNodeKey = 'Base' | 'Selector' | 'Memory' | 'Analyzer' | 'Generator' | 'LotsNode';
export type AgentCardTab = 'preview' | 'params' | 'ai';
export type LaunchMode = 'auto' | 'manual';

export interface InsightItem {
  id: number;
  game: string;
  category: string;
  trend: string;
  similarity: string;
  text: string;
  tags: string[];
  date: string;
}

export interface SimulationStep {
  label: string;
  desc: string;
}

export interface NodePosition {
  x: number;
  y: number;
}

export interface NodeDetails {
  title: string;
  desc: string;
  color: string;
  status?: AgentState['status'];
  task?: string;
  tokens?: number;
}

export interface SimulationState {
  lot: GeneratedLot | null;
  step: number;
  progress: number;
}

export interface AgentsRunSnapshot {
  activeRun: AgentRun | null;
  agentStates: Record<string, AgentState>;
  logs: AgentLog[];
  generatedLots: GeneratedLot[];
  pastRuns: AgentRun[];
}
