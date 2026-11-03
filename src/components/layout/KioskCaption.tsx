import { useApp } from '../../app/store';

/** The booth kiosk's caption: which part of the story is playing, in one sentence (`?kiosk=1`). */
export function KioskCaption() {
  const k = useApp((s) => s.kiosk);
  if (!k) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[84px] z-40 flex justify-center px-6">
      <div key={`${k.step}-${k.title}`} className="glass max-w-[780px] animate-fade-in !rounded-2xl border-cyan/40 px-6 py-3.5 shadow-2xl">
        <div className="flex items-center gap-3 text-[11.5px] font-semibold tracking-[0.14em] text-cyan uppercase">
          <span className="num text-ink-2">
            {k.step} / {k.steps}
          </span>
          {k.title}
        </div>
        <p className="mt-1 text-[17px] leading-snug text-pretty text-white">{k.text}</p>
        <p className="mt-1.5 text-[11px] text-muted">Touch or press any key to explore</p>
      </div>
    </div>
  );
}
