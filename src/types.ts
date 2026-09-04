export type PositionCode = 'GK' | 'DEF' | 'MID' | 'FWD';
export type SlotPosition = 'GK' | 'DEF' | 'MID' | 'FWD' | 'EXTRA';
export type PlayingStatus = 'STARTER' | 'REGULAR' | 'SUPER_SUBSTITUTE' | 'SUBSTITUTE' | 'NOT_PLAYING' | 'BENCH' | 'DOUBTFUL' | 'CONFIRMED' | string;
export type InjuryStatus = 'FIT' | 'DOUBTFUL' | 'QUESTIONABLE' | 'INJURED' | 'SUSPENDED' | string;
export type StrategyType = 'BALANCED' | 'SAFE_TITULAR' | 'HIGH_CEILING' | 'PURE_FORM';
export type ScoringFocus = 'BALANCED' | 'AAS' | 'DS';
export type CardRarity = 'common' | 'limited' | 'rare' | 'super_rare' | 'unique' | 'custom' | 'COMMON' | 'LIMITED' | 'RARE' | 'SUPER_RARE' | 'UNIQUE' | string;

export interface BookmakerOdds {
  win?: number; // e.g. 1.65 (60% win prob)
  draw?: number; // e.g. 3.80
  loss?: number; // e.g. 5.20
  homeWinOdds?: number;
  awayWinOdds?: number;
  cleanSheetProb?: number; // 0 - 100 % (critical for DEF/GK)
  opponentCleanSheetProb?: number;
  goalExpectancy?: number; // Team xG e.g. 2.1
  opponentGoalExpectancy?: number; // Opponent xG e.g. 0.8
  anytimeScorerOdds?: number; // e.g. 2.10
  anytimeAssistOdds?: number; // e.g. 3.40
  winProbability?: number;
  drawProbability?: number;
  lossProbability?: number;
  homeTeamName?: string;
  awayTeamName?: string;
  source?: string;
  sourceType?: 'gemini_search' | 'odds_api' | 'verified_bookmaker' | 'estimated_mirror';
  groundingUrls?: string[];
  topScorers?: Array<{ name: string; team: string; anytimeScorerOdds: number }>;
  topAssisters?: Array<{ name: string; team: string; anytimeAssistOdds: number }>;
}

export interface WeatherCondition {
  temp?: number;
  temperature?: number;
  description?: string;
  wind?: number;
  city?: string;
  source?: string;
  isRainy?: boolean;
  precipitation?: number;
}

export interface UpcomingFixture {
  gameWeek?: number;
  opponent: string;
  opponentSlug?: string;
  opponentLogo?: string;
  opponentLogoUrl?: string;
  isHome: boolean;
  matchDate?: string;
  kickoffDate?: string;
  kickoffFormatted?: string;
  kickoffRelative?: string;
  hasUpcomingMatch?: boolean;
  difficultyRating: number; // 1 (Very easy) to 5 (Extremely hard)
  competitionName?: string;
  competition?: string;
  bookmaker?: BookmakerOdds;
  weather?: WeatherCondition;
  projectedMinutes?: number; // Expected minutes (e.g. 90, 75, 20, 0)
  projectedScore?: number; // Baseline projected SO5 score (0 - 100)
}

export interface RealMatchScoreDetail {
  score: number;
  decisiveScore?: number;
  allAroundScore?: number;
  opponent: string;
  isHome: boolean;
  competitionName?: string;
  matchDate?: string;
  game?: any;
  minsPlayed?: number;
  so5ScoreId?: string;
  isStarter?: boolean;
  isSub?: boolean;
  dnp?: boolean;
  statusTyped?: string;
  baseScore?: number; // 35 for Starter, 25 for Sub, 0 for DNP
  goals?: number;
  goalAssist?: number;
  expectedGoals?: number;
  expectedAssists?: number;
  yellowCards?: number;
  redCards?: number;
  cleanSheet?: number;
  accuratePass?: number;
  totalPass?: number;
  wonContest?: number;
  bigChanceCreated?: number;
  errorLeadToGoal?: number;
  ownGoals?: number;
  penaltyKickMissed?: number;
  penaltySave?: number;
  wasFouled?: number;
  decisiveActions?: string[];
  negativeActions?: string[];
  allAroundDetails?: string[];
}

export interface LivePlayerScore {
  cardId: string;
  playerSlug: string;
  displayName: string;
  positionCode: PositionCode;
  clubName: string;
  opponentName: string;
  isHome: boolean;
  matchStatus: 'NOT_STARTED' | 'LIVE' | 'HALF_TIME' | 'FINISHED' | 'POSTPONED';
  minute?: number;
  currentScore: number;
  decisiveScore: number;
  allAroundScore: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  cleanSheet: boolean;
  lastUpdated: string;
}

export interface LiveGameWeekState {
  gameWeek: number;
  status: 'UPCOMING' | 'LIVE' | 'PAST';
  totalLiveScore: number;
  playersCount: number;
  playingNowCount: number;
  finishedCount: number;
  remainingCount: number;
  playerScores: Record<string, LivePlayerScore>;
}

export interface SorareCard {
  id: string;
  slug: string;
  playerSlug?: string;
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
    league?: string;
  };
  country?: {
    name: string;
    code: string;
    flag?: string;
  } | string;
  league?: string;
  status: PlayingStatus;
  playingStatus?: PlayingStatus;
  lineupStatus?: OfficialLineupStatus;
  isStarter?: boolean;
  isLineupAnnounced?: boolean;
  starterConfidence: number; // 0 - 100%
  injuryStatus: InjuryStatus;
  injuryDetails?: string;
  grade?: number;
  xp?: number;
  seasonYear?: number;
  power?: string;
  specialEdition?: string | null;
  powerBreakdown?: {
    collectionBasisPoints: number;
    seasonBasisPoints: number;
    specialEditionCardsBasisPoints: number;
    xpBasisPoints: number;
    otherBonusBasisPoints: number;
  };
  bonusPercentage?: number;
  customBonusPercentage?: number;
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
    avgDecisiveScore?: number;
    avgAllAroundScore?: number;
    decisiveContributionPct?: number;
    allAroundContributionPct?: number;
    aasPercentage?: number;
    decisivePercentage?: number;
    floorScore?: number;
    ceilingScore?: number;
    l5Played?: number;
    l5PlayedRate?: number;
    l15Played?: number;
    l15PlayedRate?: number;
    l40Played?: number;
    l40PlayedRate?: number;
    decisiveCountL5?: number;
    decisiveRateL5?: number;
    decisiveCountL15?: number;
    decisiveRateL15?: number;
    decisiveCountL40?: number;
    decisiveRateL40?: number;
    decisiveActionsRecent?: number;
    consistencyScore?: number;
    consistencyRate?: number;
    decisiveRate?: number;
    xG?: number;
    xA?: number;
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
  minAasL15?: number; // 0, 10, 15, 20, 25
  minDsL15?: number; // 0, 35, 45, 55, 60
  preferredExtraPosition?: 'AUTO' | 'FWD' | 'MID' | 'DEF'; // Choice of extra slot
  selectedClub?: string; // e.g. 'ALL' or specific club name
  onlyWithUpcomingMatch?: boolean; // Must have an upcoming fixture in GW
  stackClub?: boolean; // Favor teammates / team stack
  maxMatchDate?: string; // YYYY-MM-DD
  maxMatchTime?: string; // HH:MM
  maxKickoffSpreadHours?: number; // e.g. 1 to favor players starting close together
  minWinProb?: number; // 25, 30, 35, 40, 45, 50
  scoringFocus?: ScoringFocus; // 'BALANCED' | 'AAS' | 'DS'
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
  scoringFocus?: ScoringFocus;
  gameWeek: number;
  isLocked?: boolean;
  // AUDIT FIX (2.15): tracks whether this composition has unsaved manual edits (a swap made via
  // handleSwapPlayerInSlot) that haven't been protected by locking. Used to warn the user before
  // silently discarding those edits on the next filter/strategy-triggered regeneration.
  isManuallyEdited?: boolean;
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
    source?: 'gemini_ai' | 'algorithmic_engine';
  };
  createdAt: string;
}

export interface AiScoutReport {
  verdict: string;
  confidenceRating: number;
  floorScore: number;
  expectedScore: number;
  ceilingScore: number;
  matchupAnalysis: string;
  starterSecurity: string;
  captainSuitability: string;
  keyAdvice: string;
  source?: 'gemini_ai' | 'algorithmic_engine';
}

export interface SorareOfficialLineup {
  id: string;
  gameWeek: number;
  leaderboardName?: string;
  leaderboardSlug?: string;
  cards: {
    cardId: string;
    slug: string;
    displayName: string;
    position: string;
    isCaptain: boolean;
  }[];
}

export interface GameWeekInfo {
  number: number;
  label?: string;
  startDate?: string;
  endDate?: string;
  deadline?: string;
  isOpen?: boolean;
  status?: string;
  activeLeagues?: string[];
}

export interface MatchPerformanceDetail {
  matchIndex: number; // 1 to 40 (40 being most recent)
  matchLabel: string; // e.g. "Match 40"
  game?: any;
  totalScore: number; // 0 to 100
  isDNP: boolean; // Did Not Play (0 min, bench / injured / out)
  isStarter: boolean; // Titulaire (Base 35 pts)
  isSub: boolean; // Remplaçant entré en jeu (Base 25 pts)
  baseScore: number; // 35 for Starter, 25 for Sub, 0 for DNP
  minutesPlayed: number;
  opponent: string;
  isHome: boolean;
  result: string;
  so5ScoreId?: string;
  isRealData?: boolean; // True if from real Sorare API match data, false if synthesized
  
  // Green Decisive Score Part (Vert)
  decisiveScore: number; // Positive decisive level score (60, 70, 80, 90, 100) or 0 if no decisive action
  decisiveBonus: number; // Difference above base (e.g. +25 or +35) or 0
  decisiveActions: string[];
  
  // White All-Around Score Part (Blanc)
  allAroundScore: number;
  allAroundDetails: string[];
  
  // Red Negative Actions & Malus Part (Rouge)
  negativeMalus: number;
  negativeActions: string[];

  // Detailed statistics
  goals?: number;
  goalAssists?: number;
  penaltyAssists?: number;
  lastManTackles?: number;
  yellowCards?: number;
  redCards?: number;
  cleanSheet?: number;
  accuratePasses?: number;
  totalPasses?: number;
  wonTackles?: number;
  wonContests?: number;
  interceptionsWon?: number;
  setPiecesTaken?: number;
  bigChancesCreated?: number;
  errorsLeadToGoal?: number;
  penaltiesConceded?: number;
  ownGoals?: number;
  penaltiesMissed?: number;
  penaltiesSaved?: number;
  wasFouled?: number;
  isLive?: boolean;
  minute?: number;
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
  source?: 'gemini_ai' | 'algorithmic_engine';
  suggestedActions?: string[];
  referencedPlayerIds?: string[];
}

export type OfficialLineupStatus = 
  | 'CONFIRMED_STARTER' 
  | 'CONFIRMED_BENCH' 
  | 'CONFIRMED_OUT' 
  | 'PENDING' 
  | 'NO_MATCH';

export interface StartingXIPlayerInfo {
  playerSlug: string;
  displayName: string;
  clubName?: string;
  status: PlayingStatus | string;
  playingStatus?: PlayingStatus | string;
  lineupStatus: OfficialLineupStatus;
  isStarter: boolean;
  isLineupAnnounced: boolean;
  minutesUntilKickoff: number | null;
  kickoffDate: string | null;
  matchSummary: string;
  opponent?: string;
  gameId?: string;
  gameStatus?: string;
}

export interface LineupValidationIssue {
  type: 'DUPLICATE_PLAYER_ID' | 'BENCH_PLAYER' | 'OUT_PLAYER' | 'NON_STARTER' | 'MISSING_SLOT' | 'SAME_CLUB_STARTER_CONFLICT';
  slot?: SlotPosition;
  playerId?: string;
  playerName?: string;
  reason: string;
  severity: 'ERROR' | 'WARNING';
}

export interface LineupValidationResult {
  isValid: boolean;
  hasDuplicates: boolean;
  hasBenchOrOutPlayers: boolean;
  hasSameClubStarterConflict?: boolean;
  duplicatePlayerIds: string[];
  duplicatePlayerNames: string[];
  benchOrOutPlayerIds: string[];
  benchOrOutPlayerNames: string[];
  conflictingClubNames?: string[];
  issues: LineupValidationIssue[];
  rejectionReasons: string[];
}

export interface NonStarterAlert {
  id: string;
  lineupId: string;
  lineupName: string;
  slot: SlotPosition;
  slotLabel: string;
  player: SorareCard;
  issueType: 'BENCH' | 'OUT' | 'DNP' | 'INJURY' | 'SUSPENSION';
  statusLabel: string;
  minutesUntilKickoff: number | null;
  kickoffDate: string | null;
  matchSummary: string;
  message: string;
  severity: 'CRITICAL' | 'WARNING';
  detectedAt: string;
}

export interface AppLogEntry {
  id: string;
  timestamp: string;
  description: string;
  service: 'Sorare API' | 'Gemini AI' | 'Application Error' | 'Lineup Alert' | 'System & Sync' | 'Odds Engine';
  method: string;
  status: 'SUCCESS' | 'ERROR' | 'RATE_LIMITED' | 'INFO' | 'WARNING';
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  statusCode: number;
  durationMs: number;
  requestSummary: any;
  responseSummary: any;
  error?: string;
  component?: string;
  gameweek?: number;
}

export interface PlayerEvaluationRecord {
  cardId: string;
  playerSlug: string;
  displayName: string;
  positionCode: PositionCode;
  clubName: string;
  opponent: string;
  isHome: boolean;
  gameWeek: number;
  matchDate?: string;
  
  // Forecast values (RAW, NO CARD BONUS)
  projectedScoreRaw: number;
  projectedStarter: boolean;
  starterConfidence: number;
  projectedTeamWinProb: number;
  projectedTeamXG: number;
  projectedCleanSheetProb: number;
  
  // Actual values (REAL OUTCOME)
  actualScoreRaw: number;
  actualStarted: boolean;
  actualMinsPlayed: number;
  actualTeamWon: boolean;
  actualTeamDraw: boolean;
  actualTeamGoals: number;
  actualCleanSheet: boolean;
  
  // Evaluation delta
  scoreDelta: number; // actual - projected
  absoluteScoreError: number; // |actual - projected|
  isWithin5Pts: boolean;
  isWithin3Pts: boolean;
  isWithin10Pts: boolean;
  isStarterCorrect: boolean;
  isWinPredictionCorrect: boolean;
  isXGPredictionCorrect: boolean; // |xG - actual goals| <= 0.75
  isCleanSheetCorrect: boolean;
}

export interface GameWeekAccuracyStats {
  gameWeek: number;
  gameWeekLabel: string;
  totalEvaluations: number;
  totalMatches: number;
  
  // User Requested Key Metrics:
  // 1. % de bon score projeté (à 5 points près)
  percentWithin5Pts: number;
  percentWithin3Pts: number;
  percentWithin10Pts: number;
  
  // 2. % de bonne prédiction de titularisation
  starterPredictionAccuracy: number;
  startersCorrectCount: number;
  startersEvaluatedCount: number;
  
  // 3. Différence moyenne entre score projeté et vrai score
  meanAbsoluteError: number; // MAE (points)
  meanErrorBias: number; // Bias (+ = overpredicted, - = underpredicted)
  rmse: number; // Root Mean Square Error
  
  // 4. % de bonne prédiction de victoire du match
  matchWinPredictionAccuracy: number;
  matchesWonPredictedCorrectly: number;
  totalTeamMatchesEvaluated: number;
  
  // 5. % de bonne prévision de xG dans le match
  xgPredictionAccuracy: number;
  meanXGError: number;
  
  // Other valuable stats
  cleanSheetPredictionAccuracy: number;
  positionBreakdown: {
    GK: { count: number; mae: number; percentWithin5Pts: number; starterAcc: number; cleanSheetAcc: number };
    DEF: { count: number; mae: number; percentWithin5Pts: number; starterAcc: number; cleanSheetAcc: number };
    MID: { count: number; mae: number; percentWithin5Pts: number; starterAcc: number };
    FWD: { count: number; mae: number; percentWithin5Pts: number; starterAcc: number; decisiveRate: number };
  };
  errorDistribution: {
    exactOrSuperb: number; // 0 - 3 pts
    within5: number;       // 3.1 - 5 pts
    close: number;          // 5.1 - 10 pts
    moderate: number;       // 10.1 - 20 pts
    highError: number;      // > 20 pts (surprises / cartons / blessures en match)
  };
  topReliablePlayers: PlayerEvaluationRecord[];
  topSurprisesOrOutliers: PlayerEvaluationRecord[];
  records: PlayerEvaluationRecord[];
}

