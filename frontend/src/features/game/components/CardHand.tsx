import { CardArt } from '@/components/CardArt';
import type { MatchCardView } from '@/network/protocol';

interface CardHandProps {
  cards: MatchCardView[];
  energyHundredths: number;
  selectedCardId: string | null;
  onSelect: (cardId: string) => void;
}

export function CardHand({
  cards,
  energyHundredths,
  selectedCardId,
  onSelect,
}: CardHandProps) {
  return (
    <div className="flex items-stretch justify-center gap-2 sm:gap-3">
      {cards.map((card) => {
        const affordable = energyHundredths >= card.cost * 100;
        const selected = selectedCardId === card.cardId;
        return (
          <button
            key={card.cardId}
            onClick={() => affordable && onSelect(card.cardId)}
            disabled={!affordable}
            aria-pressed={selected}
            className={[
              'group relative w-[76px] shrink-0 overflow-hidden rounded-xl border-2 transition-all sm:w-24',
              selected
                ? '-translate-y-1 border-gold shadow-[0_0_0_1px_rgba(216,181,106,0.4),0_18px_30px_-16px_rgba(216,181,106,0.8)]'
                : 'border-line hover:border-slate-500',
              affordable
                ? 'cursor-pointer'
                : 'cursor-not-allowed opacity-45 saturate-50',
            ].join(' ')}
          >
            <div className="bg-ink-850">
              <CardArt cardId={card.cardId} className="h-14 w-full sm:h-20" />
            </div>
            <div className="border-t border-line bg-ink-800/90 px-2 py-1.5 text-left">
              <p className="truncate text-[11px] font-semibold text-slate-200 sm:text-xs">
                {card.name}
              </p>
              <p className="text-[10px] text-slate-500">Ready to deploy</p>
            </div>
            <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-gold/50 bg-ink-950/90 font-mono text-xs font-bold gold-text">
              {card.cost}
            </span>
            {selected && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-gold" />
            )}
          </button>
        );
      })}
    </div>
  );
}
