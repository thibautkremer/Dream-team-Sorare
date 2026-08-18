export type PositionCode = 'GK' | 'DEF' | 'MID' | 'FWD';
export type SlotPosition = 'GK' | 'DEF' | 'MID' | 'FWD' | 'EXTRA';
export type PlayingStatus = 'STARTER' | 'REGULAR' | 'SUPER_SUBSTITUTE' | 'SUBSTITUTE' | 'NOT_PLAYING' | 'BENCH' | 'DOUBTFUL';
export type InjuryStatus = 'FIT' | 'DOUBTFUL' | 'QUESTIONABLE' | 'INJURED' | 'SUSPENDED';
export type StrategyType = 'BALANCED' | 'SAFE_TITULAR' | 'HIGH_CEILING' | 'PURE_FORM';
export type CardRarity = 'common' | 'limited' | 'rare' | 'super_rare' | 'unique' | 'custom' | 'COMMON' | 'LIMITED' | 'RARE' | 'SUPER_RARE' | 'UNIQUE' | string;

export interface BookmakerOdds {
  win: number; // e.g. 1.65 (60% win prob)
  draw: number; // e.g. 3.80
  loss: number; // e.g. 5.20
  cleanSheetProb: number; // 0 - 100 % (critical for DEF/GK)
  goalExpectancy: number; // Team xG e.g. 2.1
  anytimeScorerOdds?: number; // e.g. 2.10
}

export interface UpcomingFixture {
  gameWeek?: number;
  opponent: string;
  opponentSlug?: string;
  opponentLogo?: string;
  isHome: boolean;
  matchDate?: string;
  kickoffDate?: string;
  kickoffFormatted?: string;
  kickoffRelative?: string;
  hasUpcomingMatch?: boolean;
  difficultyRating: number; // 1 (Very easy) to 5 (Extremely hard)
  competitionName?: string;
  bookmaker?: BookmakerOdds;
  projectedMinutes?: number; // Expected minutes (e.g. 90, 75, 20, 0)
  projectedScore: number; // Baseline projected SO5 score (0 - 100)
}

export interface RealMatchScoreDetail {
  score: number;
  opponent: string;
  isHome: boolean;
  competitionName?: string;
  matchDate?: string;
}

export interface SorareCard {
  id: string;
  slug: string;
  name?: string;
  displayName: string;
  matchName?: string;
  position: 'Goalkeeper' | 'Defender' | 'Midfielder' | 'Forward';
  positionCode: PositionCode;
  positionName?: string;
  rarity: CardRarity;
  pictureUrl: string;
  avatarUrl?: string;
  age: number;
  club: {
    id?: string;
    name: string;
    logo?: string;
    code?: string;
    slug?: string;
    pictureUrl?: string;
    country?: string;
  };
  country?: {
    name: string;
    code: string;
    flag?: string;
  } | string;
  league?: string;
  status: PlayingStatus;
  starterConfidence: number; // 0 - 100%
  injuryStatus: InjuryStatus;
  injuryDetails?: string;
  grade?: number;
  xp?: number;
  seasonYear?: number;
  scores: {
    l5: number;
    l10?: number;
    l15: number;
    l40: number;
    last5Scores: number[];
    last10Scores?: number[];
    last15Scores?: number[];
    last40Scores?: number[];
    recentMatches?: RealMatchScoreDetail[];
    decisiveActionsRecent?: number;
    consistencyScore?: number;
    consistencyRate?: number;
    decisiveRate?: number;
  };
  upcomingFixture: UpcomingFixture;
  tacticalNotes?: string;
  isFavorite?: boolean;
  updatedAt?: string;
}

export interface LineupOptimizationFilters {
  rarity?: string; // 'ALL' | 'COMMON' | 'LIMITED' | 'RARE' | 'SUPER_RARE' | 'UNIQUE'
  ageCategory?: 'ALL' | 'U23' | 'OVER_23'; // U23 = age <= 23
  starterOnly?: boolean; // Only STARTER status (100% Floor)
  minStarterConfidence?: number; // 0, 70, 85, 95%
  homeOnly?: boolean; // Only players playing at home (🏠)
  maxFixtureDifficulty?: number; // 1 to 5 (e.g. 3 = only easy/medium FDR <= 3)
  minL5?: number; // 0, 40, 45, 50, 55, 60
  minL15?: number; // 0, 40, 45, 50, 55, 60
  preferredExtraPosition?: 'AUTO' | 'FWD' | 'MID' | 'DEF'; // Choice of extra slot
  selectedClub?: string; // e.g. 'ALL' or specific club name
  onlyWithUpcomingMatch?: boolean; // Must have an upcoming fixture in GW
  stackClub?: boolean; // Favor teammates / team stack
  maxMatchDate?: string; // YYYY-MM-DD
  minWinProb?: number; // 25, 30, 35, 40, 45, 50
}

export interface LineupSlotData {
  slot: SlotPosition;
  player: SorareCard | null;
  isCaptain: boolean;
  projectedScore: number;
  captainBonus: number; // +20% score if captain
  tacticalJustification?: string;
  riskFactor?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface Lineup {
  id: string;
  name: string;
  strategy: StrategyType;
  gameWeek: number;
  slots: {
    gk: SorareCard | null;
    def: SorareCard | null;
    mid: SorareCard | null;
    fwd: SorareCard | null;
    extra: SorareCard | null;
  };
  captainSlot: 'gk' | 'def' | 'mid' | 'fwd' | 'extra';
  projectedTotal: number;
  projectedTotalWithCaptain: number;
  filtersUsed?: LineupOptimizationFilters;
  analysis: {
    summary: string;
    strengths: string[];
    risks: string[];
    captainReasoning: string;
    cleanSheetOutlook: string;
    tacticalPerPosition: {
      gk: string;
      def: string;
      mid: string;
      fwd: string;
      extra: string;
    };
  };
  createdAt: string;
  isLocked?: boolean;
}

export interface GameWeekInfo {
  number: number;
  label: string;
  startDate: string;
  endDate: string;
  deadline?: string;
  isOpen?: boolean;
  status?: string;
  activeLeagues?: string[];
}

export interface MatchPerformanceDetail {
  matchIndex: number; // 1 to 15 (15 being most recent)
  matchLabel: string; // e.g. "Match 15"
  totalScore: number; // 0 to 100
  isDNP: boolean; // Did Not Play (0 min, bench / injured / out)
  minutesPlayed: number;
  opponent: string;
  isHome: boolean;
  result: string;
  
  // Green Decisive Score Part (Vert)
  decisiveScore: number;
  decisiveActions: string[];
  
  // White All-Around Score Part (Blanc)
  allAroundScore: number;
  allAroundDetails: string[];
  
  // Red Negative Actions & Malus Part (Rouge)
  negativeMalus: number;
  negativeActions: string[];
}

export interface UserGalleryState {
  username: string;
  formattedSlug: string;
  lastSynced: string | null;
  cards: SorareCard[];
  totalCards: number;
  selectedGameWeek: number;
  filterPosition: PositionCode | 'ALL';
  filterStatus: PlayingStatus | 'ALL';
  filterRarity: CardRarity | 'ALL';
  searchTerm: string;
  sortBy: 'L5_DESC' | 'L15_DESC' | 'L40_DESC' | 'PROJ_DESC' | 'NAME_ASC' | 'DIFFICULTY_ASC';
}

export interface AIAnalysisResponse {
  recommendedLineup: {
    gkId: string;
    defId: string;
    midId: string;
    fwdId: string;
    extraId: string;
    captainSlot: 'gk' | 'def' | 'mid' | 'fwd' | 'extra';
  };
  projectedTotalScore: number;
  summary: string;
  strengths: string[];
  risks: string[];
  captainReasoning: string;
  cleanSheetOutlook: string;
  differentialValue: string;
  tacticalPerPosition: {
    gk: string;
    def: string;
    mid: string;
    fwd: string;
    extra: string;
  };
  alternativeOptions: {
    slot: SlotPosition;
    alternativePlayerId: string;
    rationale: string;
  }[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  suggestedActions?: string[];
  referencedPlayerIds?: string[];
}
