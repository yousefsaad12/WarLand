import { energyValue, formatEnergy } from '@/features/game/format';

interface EnergyBarProps {
  energyHundredths: number;
  maxEnergyHundredths: number;
}

export function EnergyBar({
  energyHundredths,
  maxEnergyHundredths,
}: EnergyBarProps) {
  const value = energyValue(energyHundredths);
  const max = Math.max(1, energyValue(maxEnergyHundredths));
  const pct = Math.max(0, Math.min(100, (value / max) * 100));

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-baseline gap-1">
        <span className="font-mono text-xl font-bold gold-text">
          {formatEnergy(energyHundredths)}
        </span>
        <span className="text-xs text-slate-500">/ {max.toFixed(0)}</span>
      </div>
      <div className="h-2.5 w-40 overflow-hidden rounded-full border border-line bg-ink-900/80 sm:w-56">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#8a733f] to-[#e2c27d] transition-[width] duration-150 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
