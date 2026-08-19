import React from 'react';
import { GalleryView } from '../components/GalleryView';
import { SorareCard, Lineup } from '../types';

interface GalleryPageProps {
  cards: SorareCard[];
  onOpenScout: (card: SorareCard) => void;
  onAssignToSlot: (card: SorareCard, slot: 'gk' | 'def' | 'mid' | 'fwd' | 'extra') => void;
  onAddCard: (card: SorareCard) => void;
  compositions?: Lineup[];
  onReplacePlayerInCompo?: (compoIndex: number, slot: 'gk' | 'def' | 'mid' | 'fwd' | 'extra', player: SorareCard) => void;
}

export const GalleryPage: React.FC<GalleryPageProps> = (props) => {
  return <GalleryView {...props} />;
};
