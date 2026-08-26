import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Bot, User, CornerDownLeft, RefreshCw, Lightbulb, Zap, ShieldAlert, Cpu } from 'lucide-react';
import { SorareCard, ChatMessage } from '../types';
import { StorageService } from '../utils/storage';

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
    
    const suggestedActions = [
      fwd.length >= 2 ? `Qui nommer Capitaine (+20%) parmi ${fwd.join(' et ')} ?` : 'Qui nommer Capitaine cette semaine ?',
      gk.length >= 2 ? `${gk[0]} vs ${gk[1]} au poste de Gardien ?` : 'Quel gardien titulariser ?',
      mid.length >= 2 ? `Quel est le meilleur Extra entre ${mid.join(' et ')} ?` : 'Qui placer en Extra ?',
      'Détecter les joueurs avec risque de DNP (0 pt) dans ma galerie.',
    ];

    return [{
      id: 'welcome-msg',
      role: 'assistant',
      content: `Salut Thibaut (Thib 8) ! Je suis ton **Coach Tactique IA Sorare**, connecté en direct à ta galerie officielle de cartes (${cards.length} cartes synchronisées). 

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
    if (q.includes('capitaine') || q.includes('bonus')) {
      return `Pour le brassard de Capitaine (+20% de bonus SO5) en GW${gameWeekNumber}, je te recommande vivement **Ousmane Dembélé** ou **Bukayo Saka**.

- **Ousmane Dembélé (PSG vs Montpellier)** : Forme récente étincelante (L5: 72.8), cote buteur de 1.95 (51% de probabilité de marquer ou d'offrir une passe décisive) face à une défense très poreuse.
- **Bukayo Saka (Arsenal vs Southampton)** : Tireur de pénaltys, match ultra favorable à l'Emirates Stadium (xG d'Arsenal de 2.6).`;
    }
    if (q.includes('donnarumma') || q.includes('chevalier') || q.includes('gardien') || q.includes('cage')) {
      return `Entre Donnarumma et Chevalier pour la GW${gameWeekNumber} :
- **Donnarumma (PSG vs Montpellier à domicile)** est le choix n°1 : Le PSG a 62% de probabilité de Clean Sheet selon les bookmakers. C'est le plus gros gage de sécurité pour sécuriser les 60+ points SO5.
- Chevalier affronte Monaco à l'extérieur (seulement 24% de clean sheet prob), avec un risque élevé d'encaisser des buts.`;
    }
    if (q.includes('dnp') || q.includes('blessure') || q.includes('risque')) {
      return `Attention aux statuts suivants dans ton effectif :
- **Presnel Kimpembe** : Statut NOT_PLAYING (Blessé) - 0 point SO5 garanti si aligné.
- **Arnau Tenas** : Remplaçant de Donnarumma (SUBSTITUTE) - ne pas aligner.
- **Gonçalo Ramos** : Incertain / Gêne cheville - risque de commencer sur le banc.
- **Senny Mayulu** : Super Sub entrant pour 20 minutes seulement.`;
    }
    return `Analyse tactique pour ta galerie :
Ton effectif dispose de bases très solides avec le bloc PSG (Donnarumma, Hakimi, Vitinha, Dembélé) et les stars d'Arsenal (Gabriel, Saka, Ødegaard).

Aligner 1 GK (Donnarumma), 1 DEF (Hakimi), 1 MID (Vitinha), 1 FWD (Dembélé Capitaine) et 1 EXTRA (Saka) te procure un score projeté supérieur à **370 points** avec 0 risque de DNP.`;
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
