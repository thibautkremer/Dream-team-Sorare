import React from 'react';
import { MatchupCenter } from '../components/MatchupCenter';
import { SorareCard, GameWeekInfo, StrategyType } from '../types';

interface MatchupsPageProps {
  cards: SorareCard[];
  gameWeek: GameWeekInfo;
  onOpenScout: (card: SorareCard) => void;
  strategy?: StrategyType;
}

export const MatchupsPage: React.FC<MatchupsPageProps> = (props) => {
  return <MatchupCenter {...props} />;
};
