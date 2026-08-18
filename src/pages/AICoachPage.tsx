import React from 'react';
import { AICoachChat } from '../components/AICoachChat';
import { SorareCard } from '../types';

interface AICoachPageProps {
  cards: SorareCard[];
  gameWeekNumber: number;
}

export const AICoachPage: React.FC<AICoachPageProps> = (props) => {
  return <AICoachChat {...props} />;
};
