import React, { useState } from 'react';
import { X, Check, Copy, ExternalLink, Send, Shield, Crown, Sparkles, CheckCircle2, FileCode, Share2 } from 'lucide-react';
import { Lineup } from '../types';

interface LineupExportModalProps {
  lineup: Lineup;
  onClose: () => void;
  gameWeek: number;
}

export const LineupExportModal: React.FC<LineupExportModalProps> = ({
  lineup,
  onClose,
  gameWeek,
}) => {
  const [copiedType, setCopiedType] = useState<'graphql' | 'json' | 'text' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const slots = lineup.slots;
  const captainCard = slots[lineup.captainSlot];
  const filledSlotsCount = (['gk', 'def', 'mid', 'fwd', 'extra'] as const).filter(k => !!slots[k]).length;

  // 1. Generate Official Sorare GraphQL Mutation
  const graphQLPayload = {
    query: `mutation SubmitSo5Lineup($input: CreateOrUpdateLineupInput!) {
  createOrUpdateLineup(input: $input) {
    lineup {
      id
      gameWeek
      projectedScore
      status
    }
    errors {
      message
    }
  }
}`,
    variables: {
      input: {
        gameWeek: gameWeek || 48,
        formation: "STANDARD_5",
        captainSlug: captainCard?.slug || null,
        captainCardId: captainCard?.id || null,
        slots: [
          { position: "GOALKEEPER", cardId: slots.gk?.id, cardSlug: slots.gk?.slug },
          { position: "DEFENDER", cardId: slots.def?.id, cardSlug: slots.def?.slug },
          { position: "MIDFIELDER", cardId: slots.mid?.id, cardSlug: slots.mid?.slug },
          { position: "FORWARD", cardId: slots.fwd?.id, cardSlug: slots.fwd?.slug },
          { position: "EXTRA", cardId: slots.extra?.id, cardSlug: slots.extra?.slug, positionCode: slots.extra?.positionCode },
        ]
      }
    }
  };

  // 2. Human-readable text format for sharing on Discord / X
  const shareableText = `🏆 *Ma Composition SO5 Sorare - GW ${gameWeek || 48}*
⭐ *Stratégie :* ${lineup.name}
📊 *Score Projeté Total :* ${lineup.projectedTotalWithCaptain} pts (avec Bonus Cap +20%)

🧤 *GK :* ${slots.gk?.displayName || 'N/A'} (${slots.gk?.club?.name || 'Club'}) - vs ${slots.gk?.upcomingFixture?.opponent || 'N/A'} [${slots.gk?.scores?.l5 || 0} pts]
🛡️ *DEF :* ${slots.def?.displayName || 'N/A'} (${slots.def?.club?.name || 'Club'}) - vs ${slots.def?.upcomingFixture?.opponent || 'N/A'} [${slots.def?.scores?.l5 || 0} pts]
⚙️ *MID :* ${slots.mid?.displayName || 'N/A'} (${slots.mid?.club?.name || 'Club'}) - vs ${slots.mid?.upcomingFixture?.opponent || 'N/A'} [${slots.mid?.scores?.l5 || 0} pts]
⚡ *FWD :* ${slots.fwd?.displayName || 'N/A'} (${slots.fwd?.club?.name || 'Club'}) - vs ${slots.fwd?.upcomingFixture?.opponent || 'N/A'} [${slots.fwd?.scores?.l5 || 0} pts]
🃏 *EXTRA :* ${slots.extra?.displayName || 'N/A'} (${slots.extra?.club?.name || 'Club'}) - vs ${slots.extra?.upcomingFixture?.opponent || 'N/A'} [${slots.extra?.scores?.l5 || 0} pts]

👑 *Capitaine (+20%) :* ${captainCard?.displayName || 'N/A'}
🚀 *Généré par Assistant IA Sorare SO5 Pro*`;

  const handleCopy = (type: 'graphql' | 'json' | 'text', text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  // AUDIT FIX: this flow is NOT a real Sorare OAuth integration — there is no registered Sorare
  // OAuth app for this project, so this button cannot actually submit a lineup to Sorare. It used
  // to open a fake OAuth popup and then silently claim "Soumis avec succès !" as if it had really
  // worked, which risked a manager believing their team was locked in for the deadline when
  // nothing was sent. It is now explicitly labeled as a local simulation and the popup / success
  // state are clearly marked as such. To make this real, implement Sorare's actual OAuth2 flow
  // (https://api.sorare.com/oauth/token) and wire it into /api/sorare/export-lineup server-side.
  const handleSimulatedSubmit = () => {
    const width = 600;
    const height = 700;
    const left = window.innerWidth / 2 - width / 2;
    const top = window.innerHeight / 2 - height / 2;
    // This popup does NOT talk to Sorare — it's a local demo page only.
    const oauthPopup = window.open(
      '/oauth/callback?code=mock-code',
      'SorareAuthDemo',
      `width=${width},height=${height},left=${left},top=${top}`
    );

    const messageListener = async (event: MessageEvent) => {
      if (event.data?.type === 'SORARE_OAUTH_SUCCESS') {
        window.removeEventListener('message', messageListener);
        const token = event.data.token;
        setIsSubmitting(true);
        try {
          const res = await fetch('/api/sorare/export-lineup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, lineup })
          });
          if (res.ok) {
            setSubmitSuccess(true);
          }
        } catch (e) {
          console.error(e);
        }
        setIsSubmitting(false);
      }
    };
    window.addEventListener('message', messageListener);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-4 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-3xl border border-slate-700/80 bg-[#0B0F17] p-5 sm:p-6 shadow-2xl text-slate-100 font-sans my-4">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <span>Export & Soumission Sorare SO5</span>
                <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">GW {gameWeek}</span>
              </h2>
              <p className="text-xs text-slate-400">Exportez votre équipe optimisée pour la valider sur Sorare</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Honest disclaimer: the "submit" button below is a local simulation only */}
        <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-950/20 p-3 flex items-start gap-2.5">
          <Shield className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-200/90 leading-relaxed">
            <span className="font-black text-amber-300">Important :</span> ce mode "Soumission" ne se connecte pas réellement à Sorare (aucune intégration OAuth Sorare officielle n'est branchée). Pour valider votre composition avant la deadline, utilisez le bouton "Ouvrir sorare.com" ci-dessous ou copiez le résumé/payload et alignez vos joueurs manuellement sur le site officiel.
          </p>
        </div>

        {/* Selected Composition Summary */}
        <div className="mt-4 rounded-2xl bg-slate-900/90 p-4 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{lineup.name}</span>
            <span className="text-sm font-black text-emerald-400">{lineup.projectedTotalWithCaptain} pts projetés</span>
          </div>

          {/* 5 Slots overview */}
          <div className="grid grid-cols-5 gap-2 pt-1">
            {(['gk', 'def', 'mid', 'fwd', 'extra'] as const).map((slotKey) => {
              const card = slots[slotKey];
              const isCap = lineup.captainSlot === slotKey;
              return (
                <div key={slotKey} className="relative flex flex-col items-center rounded-xl bg-slate-950 p-2 border border-slate-800/80 text-center">
                  {isCap && (
                    <div className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 text-slate-950 shadow-md">
                      <Crown className="h-3 w-3" />
                    </div>
                  )}
                  <span className="text-[9px] font-black text-slate-500 uppercase">{slotKey}</span>
                  <div className="h-10 w-10 my-1 rounded-lg overflow-hidden bg-slate-900 border border-slate-700 flex items-center justify-center">
                    {card?.pictureUrl ? (
                      <img src={card.pictureUrl} alt={card.displayName} className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-[10px] font-bold text-slate-600">?</span>
                    )}
                  </div>
                  <span className="text-[10px] font-bold text-white truncate max-w-[70px]">
                    {card?.displayName.split(' ').pop() || '-'}
                  </span>
                  <span className="text-[9px] text-emerald-400 font-black">
                    {card?.scores.l5 || 0} pts
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Options */}
        <div className="mt-4 space-y-3">
          
          {/* Option 1a: Real link to Sorare's own lineup page (the only way to actually submit today) */}
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-emerald-300 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-emerald-400" />
                <span>Ouvrir sorare.com pour valider</span>
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Ouvre le site officiel Sorare dans un nouvel onglet — copiez le résumé texte ci-dessous pour aligner rapidement vos 5 joueurs vous-même.
              </p>
            </div>

            <a
              href="https://sorare.com/football/so5/my-team"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-slate-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 transition whitespace-nowrap"
            >
              <span>Ouvrir sorare.com</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          {/* Option 1b: Local simulation only — clearly labeled as such, no false success claim */}
          <div className="rounded-2xl border border-slate-700 bg-slate-900/40 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-300 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-slate-400" />
                <span>Simuler la soumission (démo, non connecté)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Teste le flux d'interface uniquement — n'envoie rien à Sorare.
              </p>
            </div>

            <button
              onClick={handleSimulatedSubmit}
              disabled={isSubmitting || submitSuccess}
              className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-4 py-2.5 text-xs font-black text-slate-200 hover:bg-slate-700 transition whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <span>Simulation en cours...</span>
              ) : submitSuccess ? (
                <span>Simulation terminée (non envoyé à Sorare)</span>
              ) : (
                <>
                  <span>Lancer la simulation</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>

          {/* Option 2: Copy Discord/Social Shareable Summary */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Share2 className="h-3.5 w-3.5 text-blue-400" />
                <span>Résumé Texte (Discord, Twitter/X, Forum)</span>
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">Format texte propre avec notes L5, cotes et capitaine</p>
            </div>

            <button
              onClick={() => handleCopy('text', shareableText)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition"
            >
              {copiedType === 'text' ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copié !</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copier</span>
                </>
              )}
            </button>
          </div>

          {/* Option 3: GraphQL Mutation Payload */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <FileCode className="h-3.5 w-3.5 text-purple-400" />
                <span>Payload Mutation GraphQL Sorare</span>
              </h4>
              <button
                onClick={() => handleCopy('graphql', JSON.stringify(graphQLPayload, null, 2))}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:bg-slate-700 hover:text-white transition"
              >
                {copiedType === 'graphql' ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" />
                    <span className="text-emerald-400">Copié</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copier JSON</span>
                  </>
                )}
              </button>
            </div>
            <pre className="rounded-xl bg-slate-950 p-3 text-[10px] text-slate-400 font-mono overflow-x-auto max-h-28 border border-slate-800">
              {JSON.stringify(graphQLPayload, null, 2)}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            <span>{filledSlotsCount}/5 postes remplis dans cette composition</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-800 px-4 py-2 font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition"
          >
            Fermer
          </button>
        </div>

      </div>
    </div>
  );
};
