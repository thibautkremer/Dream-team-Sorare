import React from 'react';
import { MatchupCenter } from '../components/MatchupCenter';
import { SorareCard, GameWeek } from '../types';

interface MatchupsPageProps {
  cards: SorareCard[];
  gameWeek: GameWeek;
  onOpenScout: (card: SorareCard) => void;
}

export const MatchupsPage: React.FC<MatchupsPageProps> = (props) => {
  return <MatchupCenter {...props} />;
};
