type PraxeLogoProps = { light?: boolean; compact?: boolean; className?: string };

export function PraxeLogo({ light = false, compact = false, className = "" }: PraxeLogoProps) {
  const ink = light ? "#FAFAF7" : "#1C1C1A";
  const active = light ? "#8FA6FF" : "#1B3BD6";
  return <span className={`inline-flex items-center gap-3 ${className}`} aria-label="Praxe">
    <svg width="30" height="30" viewBox="0 0 30 30" role="img" aria-hidden="true" className="shrink-0">
      <line x1="3" y1="8" x2="19" y2="8" stroke={ink} strokeWidth="2.6" opacity=".22" />
      <line x1="3" y1="15" x2="23" y2="15" stroke={ink} strokeWidth="2.6" opacity=".38" />
      <line x1="3" y1="22" x2="27" y2="22" stroke={active} strokeWidth="2.6" />
    </svg>
    {!compact && <span className="font-display text-[22px] font-bold tracking-[-.045em]" style={{ color: ink }}>praxe</span>}
  </span>;
}
