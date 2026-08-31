import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Bot, User, CornerDownLeft, RefreshCw, Lightbulb, Zap, ShieldAlert, Cpu } from 'lucide-react';
import { SorareCard, ChatMessage } from '../types';
import { StorageService } from '../utils/storage';
import { calculatePlayerProjectedScore } from '../utils/optimizer';

interface AICoachChatProps {
  cards: SorareCard[];
  gameWeekNumber: number;
}

export const AICoachChat: React.FC<AICoachChatProps> = ({ cards, gameWeekNumber }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    // Generate dynamic suggestions based on actual gallery
    const fwd = cards.filter(c => c.positionCode === 'FWD').sort((a,b) => b.scores.l5 - a.scores.l5).slice(0, 3).map(c => c.displayName);
    const mid = cards.filter(c => c.positionCode === 'MID').sort((a,b) => b.scores.l5 - a.scores.l5).slice(0, 3).map(c => c.displayName);
    const gk = cards.filter(c => c.positionCode === 'GK').sort((a,b) => b.scores.l5 - a.scores.l5).slice(0, 2).map(c => c.displayName);
    const userMeta = StorageService.getUserMeta();
    const managerName = userMeta?.nickname || StorageService.getUsername() || 'Manager';
    
    const suggestedActions = [
      fwd.length >= 2 ? `Qui nommer Capitaine (+20%) parmi ${fwd.join(' et ')} ?` : 'Qui nommer Capitaine cette semaine ?',
      gk.length >= 2 ? `${gk[0]} vs ${gk[1]} au poste de Gardien ?` : 'Quel gardien titulariser ?',
      mid.length >= 2 ? `Quel est le meilleur Extra entre ${mid.join(' et ')} ?` : 'Qui placer en Extra ?',
      'Détecter les joueurs avec risque de DNP (0 pt) dans ma galerie.',
    ];

    return [{
      id: 'welcome-msg',
      role: 'assistant',
      content: `Salut ${managerName} ! Je suis ton **Coach Tactique IA Sorare**, connecté en direct à ta galerie officielle de cartes (${cards.length} cartes synchronisées). 

J'ai analysé tes joueurs clés (L5, L15, L40), les statuts de titulaires vérifiés, l'état de santé et les cotes des bookmakers pour la **Game Week ${gameWeekNumber}**.

Comment puis-je t'aider à optimiser ta composition gratuite SO5 ?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestedActions,
    }];
  });

  const [inputPrompt, setInputPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (promptToSend?: string) => {
    const text = promptToSend || inputPrompt;
    if (!text.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputPrompt('');
    setIsLoading(true);

    try {
      const appToken = StorageService.getAppToken();
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(appToken ? { 'x-app-token': appToken } : {})
        },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          gallery: cards,
          gameWeek: gameWeekNumber,
        }),
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la réponse IA');
      }

      const data = await response.json();
      const assistantMessage: ChatMessage = {
        id: `ai-msg-${Date.now()}`,
        role: 'assistant',
        source: data.source || 'gemini_ai',
        content: data.reply || 'Je n\'ai pas pu formuler de réponse.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      console.error(err);
      // Fallback local heuristic analysis
      const fallbackReply = generateFallbackChatReply(text, cards);
      const assistantMessage: ChatMessage = {
        id: `ai-msg-${Date.now()}`,
        role: 'assistant',
        source: 'algorithmic_engine',
        content: fallbackReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, assistantMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  function generateFallbackChatReply(query: string, galleryCards: SorareCard[]): string {
    const q = query.toLowerCase();
    
    // 1. Captain recommendation based on real highest projected scores
    if (q.includes('capitaine') || q.includes('captain') || q.includes('bonus')) {
      const eligible = galleryCards.filter(c => c.status !== 'NOT_PLAYING' && c.injuryStatus !== 'INJURED');
      const ranked = eligible.map(c => ({
        card: c,
        breakdown: calculatePlayerProjectedScore(c, 'BALANCED', galleryCards)
      })).sort((a, b) => b.breakdown.projectedScore - a.breakdown.projectedScore);

      if (ranked.length >= 2) {
        const top1 = ranked[0];
        const top2 = ranked[1];
        const opp1 = top1.card.upcomingFixture?.opponent || 'Adversaire';
        const opp2 = top2.card.upcomingFixture?.opponent || 'Adversaire';
        return `Pour le brassard de **Capitaine (+20% de bonus SO5)** en GW${gameWeekNumber}, voici mes meilleures recommandations issues de ta galerie :

- **${top1.card.displayName} (${top1.card.club?.name || 'Club'} vs ${opp1})** : Score projeté de **${top1.breakdown.projectedScore} pts** (L5: ${top1.card.scores?.l5 || 50}). Avec le bonus de +20%, sa projection totale atteint **${Math.round((top1.breakdown.projectedScore + top1.breakdown.baseProjectedScore * 0.20) * 10) / 10} pts**.
- **${top2.card.displayName} (${top2.card.club?.name || 'Club'} vs ${opp2})** : Score projeté de **${top2.breakdown.projectedScore} pts** (L5: ${top2.card.scores?.l5 || 50}), excellente alternative avec projection cap à **${Math.round((top2.breakdown.projectedScore + top2.breakdown.baseProjectedScore * 0.20) * 10) / 10} pts**.`;
      }
    }

    // 2. Goalkeeper analysis
    if (q.includes('gardien') || q.includes('gk') || q.includes('cage') || q.includes('cleansheet') || q.includes('clean sheet')) {
      const gks = galleryCards.filter(c => c.positionCode === 'GK');
      if (gks.length > 0) {
        const rankedGK = gks.map(c => ({
          card: c,
          breakdown: calculatePlayerProjectedScore(c, 'BALANCED', galleryCards)
        })).sort((a, b) => b.breakdown.projectedScore - a.breakdown.projectedScore);

        const bestGK = rankedGK[0];
        const opp = bestGK.card.upcomingFixture?.opponent || 'Adversaire';
        const details = rankedGK.slice(0, 3).map(g => 
          `- **${g.card.displayName} (${g.card.club?.name || 'Club'} vs ${g.card.upcomingFixture?.opponent || 'Adversaire'})** : Score projeté ${g.breakdown.projectedScore} pts (L5: ${g.card.scores?.l5 || 50}, Difficulté ${g.card.upcomingFixture?.difficultyRating || 3}/5)`
        ).join('\n');

        return `Analyse comparative de tes gardiens pour la GW${gameWeekNumber} :
${details}

👉 **Recommandation n°1** : Titulariser **${bestGK.card.displayName}**, qui présente le meilleur ratio sécurité clean sheet et forme récente.`;
      }
    }

    // 3. DNP / Injuries detection
    if (q.includes('dnp') || q.includes('blessure') || q.includes('risque') || q.includes('suspendu') || q.includes('incertain')) {
      const atRisk = galleryCards.filter(c => 
        c.injuryStatus === 'INJURED' || 
        c.injuryStatus === 'SUSPENDED' || 
        c.injuryStatus === 'DOUBTFUL' || 
        c.status === 'NOT_PLAYING' || 
        c.status === 'SUBSTITUTE'
      );

      if (atRisk.length > 0) {
        const items = atRisk.slice(0, 6).map(c => {
          const reason = c.injuryStatus === 'INJURED' ? 'Blessé (0 pt garanti)'
            : c.injuryStatus === 'SUSPENDED' ? 'Suspendu'
            : c.injuryStatus === 'DOUBTFUL' ? 'Incertain / Gêne physique'
            : c.status === 'SUBSTITUTE' ? 'Remplaçant / Super Sub'
            : 'Statut hors-groupe';
          return `- **${c.displayName} (${c.club?.name || 'Club'})** : ${reason}`;
        }).join('\n');

        return `⚠️ **Attention aux risques de DNP identifiés dans ta galerie (${atRisk.length} joueur(s)) :**\n${items}\n\nÉvite absolument d'aligner ces joueurs dans ton SO5 titulaire.`;
      } else {
        return `✅ **Aucun joueur blessé ou suspendu majeur** détecté parmi tes cartes actives ! Ton effectif est à 100% opérationnel pour la GW${gameWeekNumber}.`;
      }
    }

    // 4. Default tactical overview
    const top5 = [...galleryCards]
      .filter(c => c.status !== 'NOT_PLAYING' && c.injuryStatus !== 'INJURED')
      .map(c => ({ card: c, breakdown: calculatePlayerProjectedScore(c, 'BALANCED', galleryCards) }))
      .sort((a, b) => b.breakdown.projectedScore - a.breakdown.projectedScore)
      .slice(0, 5);

    const totalProj = top5.reduce((sum, p) => sum + p.breakdown.projectedScore, 0);

    return `Analyse tactique pour ta galerie en GW${gameWeekNumber} :
Ton effectif compte **${galleryCards.length} cartes**.

Tes 5 meilleurs joueurs projetés pour cette journée sont :
${top5.map((p, idx) => `${idx + 1}. **${p.card.displayName}** (${p.card.positionCode}) - Projection : **${p.breakdown.projectedScore} pts**`).join('\n')}

L'alignement de cette colonne vertébrale te confère un score cumulé estimé à **${Math.round(totalProj)} points**. N'hésite pas à me poser une question précise sur un poste ou un choix de capitaine !`;
  }

  return (
    <div className="flex h-[calc(100dvh-170px)] md:h-[calc(100vh-220px)] min-h-[440px] md:min-h-[500px] flex-col rounded-2xl sm:rounded-3xl border border-slate-800 bg-slate-900/90 shadow-2xl backdrop-blur-md overflow-hidden">
      
      {/* Chat Header */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-3.5 sm:px-5 py-3 sm:py-3.5">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-md shadow-emerald-500/20 shrink-0">
            <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-slate-950">
              <Bot className="h-4 w-4 text-emerald-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h3 className="text-xs sm:text-sm font-bold text-white">Coach IA Gemini 3.7 Flash</h3>
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-400">Connecté à ta galerie Sorare • Mode Gratuit</p>
          </div>
        </div>

        <button
          onClick={() => setMessages([messages[0]])}
          className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-400 hover:text-white transition"
          title="Réinitialiser la discussion"
        >
          <RefreshCw className="h-3 w-3" />
          <span className="hidden sm:inline">Effacer</span>
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3.5 sm:space-y-4 touch-scroll-y">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-2 sm:gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="flex h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 mt-0.5">
                <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>
            )}

            <div
              className={`max-w-[88%] sm:max-w-[85%] rounded-2xl px-3.5 py-3 sm:p-4 text-xs leading-relaxed sm:text-sm ${
                msg.role === 'user'
                  ? 'bg-emerald-500 text-slate-950 font-medium rounded-tr-none shadow-md shadow-emerald-500/10'
                  : 'bg-slate-950 border border-slate-800 text-slate-200 rounded-tl-none shadow-md'
              }`}
            >
              {msg.role === 'assistant' && (
                <div className="mb-2.5 flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <div className="flex items-center gap-1.5">
                    {msg.source === 'algorithmic_engine' ? (
                      <Cpu className="h-3.5 w-3.5 text-sky-400" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                    )}
                    <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400">
                      {msg.source === 'algorithmic_engine' ? 'Moteur Algorithmique SO5' : 'Gemini 2.5 Flash IA'}
                    </span>
                  </div>
                  <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${
                    msg.source === 'algorithmic_engine'
                      ? 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  }`}>
                    {msg.source === 'algorithmic_engine' ? 'Heuristique' : 'LLM Live'}
                  </span>
                </div>
              )}

              <div className="whitespace-pre-wrap">{msg.content}</div>

              {/* Quick suggestions if present */}
              {msg.suggestedActions && (
                <div className="mt-4 border-t border-slate-800/80 pt-3 space-y-1.5">
                  <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                    <Lightbulb className="h-3 w-3 text-emerald-400" />
                    Questions fréquentes :
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {msg.suggestedActions.map((action, i) => (
                      <button
                        key={i}
                        onClick={() => handleSendMessage(action)}
                        className="rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 hover:text-emerald-200 transition text-left"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <span className={`block text-[9px] mt-2 ${msg.role === 'user' ? 'text-slate-800' : 'text-slate-500'} text-right`}>
                {msg.timestamp}
              </span>
            </div>

            {msg.role === 'user' && (
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
              <Bot className="h-4 w-4" />
            </div>
            <div className="rounded-2xl rounded-tl-none bg-slate-950 border border-slate-800 p-4 text-xs text-slate-400 flex items-center gap-2">
              <Sparkles className="h-4 w-4 animate-spin text-emerald-400" />
              <span>Analyse tactique Gemini en cours...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="border-t border-slate-800 bg-slate-950/90 p-3 sm:p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            placeholder="Pose une question tactique au coach (ex: Qui choisir en Extra ?)..."
            disabled={isLoading}
            className="flex-1 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={isLoading || !inputPrompt.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition active:scale-95 shadow-md shadow-emerald-500/20 flex-shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>

    </div>
  );
};
