import React from 'react';
import { PitchView } from '../components/PitchView';
import { SorareCard, Lineup, StrategyType, LineupOptimizationFilters } from '../types';

interface PitchPageProps {
  lineup: Lineup;
  setLineup: React.Dispatch<React.SetStateAction<Lineup>>;
  cards: SorareCard[];
  onOptimizeAI: (strategy: StrategyType) => Promise<void>;
  isOptimizing: boolean;
  onOpenScout: (card: SorareCard) => void;
  onOpenAnalysis: () => void;
  onSelectSlotToSwap: (slot: 'gk' | 'def' | 'mid' | 'fwd' | 'extra') => void;
  filters: LineupOptimizationFilters;
  setFilters: React.Dispatch<React.SetStateAction<LineupOptimizationFilters>>;
  compositions: Lineup[];
  selectedCompoIndex: number;
  onSelectComposition: (index: number) => void;
}

export const PitchPage: React.FC<PitchPageProps> = (props) => {
  return <PitchView {...props} />;
};
