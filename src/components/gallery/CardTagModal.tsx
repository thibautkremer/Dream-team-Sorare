import React, { useState } from 'react';
import { X, Tag, Plus, Check, Sparkles } from 'lucide-react';
import { SorareCard } from '../../types';

interface CardTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  card: SorareCard | null;
  currentTags: string[];
  onSaveTags: (cardId: string, tags: string[]) => void;
  allExistingTags?: string[];
}

const PRESET_TAGS = [
  { name: 'Cap 240', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  { name: 'Pépite U23', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' },
  { name: 'À Vendre', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  { name: 'Titulaire Clé', color: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  { name: 'Sous-Coté', color: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
  { name: 'Stack Club', color: 'bg-lime-500/20 text-lime-300 border-lime-500/40' },
  { name: 'Spécialiste AA', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' },
  { name: 'Finisseur DS', color: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
];

export const CardTagModal: React.FC<CardTagModalProps> = ({
  isOpen,
  onClose,
  card,
  currentTags = [],
  onSaveTags,
  allExistingTags = [],
}) => {
  const [tags, setTags] = useState<string[]>(currentTags);
  const [customTagInput, setCustomTagInput] = useState('');

  // Update local state when card or currentTags change
  React.useEffect(() => {
    setTags(currentTags);
  }, [card?.id, currentTags]);

  if (!isOpen || !card) return null;

  const toggleTag = (tagName: string) => {
    if (tags.includes(tagName)) {
      setTags(tags.filter((t) => t !== tagName));
    } else {
      setTags([...tags, tagName]);
    }
  };

  const handleAddCustomTag = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customTagInput.trim();
    if (!clean) return;
    if (!tags.includes(clean)) {
      setTags([...tags, clean]);
    }
    setCustomTagInput('');
  };

  const handleSave = () => {
    onSaveTags(card.id, tags);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <Tag className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Gérer les Tags Personnalisés</h3>
              <p className="text-xs text-slate-400 truncate max-w-[240px]">{card.displayName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Selected Tags Display */}
        <div>
          <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1.5">
            Tags attribués ({tags.length}) :
          </label>
          <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 rounded-xl bg-slate-950/80 border border-slate-800">
            {tags.length === 0 ? (
              <span className="text-xs text-slate-600 italic">Aucun tag pour cette carte. Cliquez ci-dessous pour en ajouter.</span>
            ) : (
              tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-lg bg-purple-500/20 border border-purple-500/40 px-2 py-0.5 text-xs font-bold text-purple-300"
                >
                  <span>{t}</span>
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                    className="hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        {/* Preset Suggestions */}
        <div>
          <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1.5">
            Suggestions Rapides :
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_TAGS.map((preset) => {
              const isSelected = tags.includes(preset.name);
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => toggleTag(preset.name)}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition font-semibold flex items-center gap-1 ${
                    isSelected
                      ? 'bg-purple-500 text-slate-950 border-purple-400 font-bold'
                      : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  {isSelected ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3 text-slate-500" />}
                  <span>{preset.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Tag Input */}
        <form onSubmit={handleAddCustomTag} className="flex gap-2">
          <input
            type="text"
            value={customTagInput}
            onChange={(e) => setCustomTagInput(e.target.value)}
            placeholder="Nouveau tag personnalisé..."
            className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-purple-400 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-xl bg-purple-600 hover:bg-purple-500 px-3 py-2 text-xs font-bold text-white transition active:scale-95 flex items-center gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Ajouter</span>
          </button>
        </form>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-800"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition"
          >
            Enregistrer les Tags
          </button>
        </div>

      </div>
    </div>
  );
};
