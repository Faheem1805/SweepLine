import { Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { story } from '../../app/story';
import { useApp } from '../../app/store';
import { controller, type StageKey, type StoryInfo } from '../../simulation/SimController';
import type { CameraPreset } from '../../three/cameras/CameraRig';
import { cn, mmss } from '../../utils/format';

/**
 * The story timeline: the whole run as five chapters, from the panels going in to the release. Drag
 * the handle, or click anywhere on the rail, to jump the twin to that moment; click a chapter to jump
 * to it and fly the camera to where it happens. The run is recorded ahead of the live view in the
 * background, so the lit part of the rail can be jumped to at once.
 */

interface Chapter {
  key: StageKey;
  label: string;
  /** Share of the rail's width (chapters are evenly spaced, not to time scale). */
  weight: number;
  /** Camera that shows it best. */
  camera: Exclude<CameraPreset, 'free' | 'compare'>;
  /** Seconds into the chapter to land on, so there is something to see. */
  lead: number;
}

const CHAPTERS: Chapter[] = [
  { key: 'install', label: 'Panels in', weight: 0.13, camera: 'aerial', lead: 0 },
  { key: 'warning', label: 'Early warning', weight: 0.2, camera: 'mouth', lead: 600 },
  { key: 'net', label: 'On the nets', weight: 0.22, camera: 'net', lead: 240 },
  { key: 'collect', label: 'Into the lift', weight: 0.23, camera: 'collector', lead: 300 },
  { key: 'release', label: 'Released', weight: 0.22, camera: 'release', lead: 120 },
];

const GUESS: Record<StageKey, number> = { install: 30, warning: 30, sonar: 30, net: 2040, collect: 2970, release: 4470 };

/** Chapter start times (s), monotonic, from the recording where known and a guess otherwise. */
function knots(info: StoryInfo): number[] {
  const t: number[] = [info.start];
  for (let i = 1; i < CHAPTERS.length; i++) {
    const k = CHAPTERS[i].key;
    const known = info.stages[k];
    let v = known ?? Math.max(GUESS[k], info.buffered + 60 * i);
    if (k === 'warning' && known !== null) v = Math.max(known, info.stages.install ?? known);
    t.push(Math.max(t[i - 1], Math.min(v, info.end)));
  }
  t.push(Math.max(t[t.length - 1], info.end));
  return t;
}

/** Rail positions (0..1) of the chapter starts, empty chapters taking no width. */
function stops(k: number[]): number[] {
  const w = CHAPTERS.map((c, i) => (k[i + 1] - k[i] > 1 ? c.weight : 0));
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  const out = [0];
  for (const x of w) out.push(out[out.length - 1] + x / sum);
  return out;
}

function toX(t: number, k: number[], s: number[]): number {
  if (t <= k[0]) return 0;
  for (let i = 0; i < CHAPTERS.length; i++) {
    if (t <= k[i + 1] || i === CHAPTERS.length - 1) {
      const span = k[i + 1] - k[i];
      const f = span > 0 ? Math.min(1, Math.max(0, (t - k[i]) / span)) : 1;
      return s[i] + (s[i + 1] - s[i]) * f;
    }
  }
  return 1;
}

function toT(x: number, k: number[], s: number[]): number {
  x = Math.min(1, Math.max(0, x));
  for (let i = 0; i < CHAPTERS.length; i++) {
    if (x <= s[i + 1] || i === CHAPTERS.length - 1) {
      const span = s[i + 1] - s[i];
      const f = span > 0 ? (x - s[i]) / span : 0;
      return k[i] + (k[i + 1] - k[i]) * Math.min(1, Math.max(0, f));
    }
  }
  return k[k.length - 1];
}

export function StoryTimeline() {
  const snap = useApp((st) => st.snap);
  const setUI = useApp((st) => st.setUI);
  const rail = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const wasPaused = useRef(false);
  const pending = useRef<number | null>(null);
  const raf = useRef(0);

  const info = snap?.story ?? null;
  const k = info ? knots(info) : [0, 1, 2, 3, 4, 5];
  const s = stops(k);

  // Seek at most once a frame while dragging.
  const seekSoon = useCallback((t: number) => {
    pending.current = t;
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      if (pending.current !== null) story.seek(pending.current);
      pending.current = null;
    });
  }, []);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  if (!snap || !info) return null;
  const t = snap.simTime;
  const playX = drag ?? toX(t, k, s);
  const bufX = toX(info.buffered, k, s);
  const cur = (() => {
    let c = 0;
    for (let i = 0; i < CHAPTERS.length; i++) if (t >= k[i] - 1e-6 && s[i + 1] > s[i]) c = i;
    return c;
  })();

  const xAt = (clientX: number) => {
    const r = rail.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width)));
  };
  const clampToRecorded = (x: number) => Math.min(x, bufX);

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    wasPaused.current = controller.paused;
    if (!controller.paused) controller.togglePause();
    const x = clampToRecorded(xAt(e.clientX));
    setDrag(x);
    seekSoon(toT(x, k, s));
  };
  const onMove = (e: React.PointerEvent) => {
    const x = xAt(e.clientX);
    setHover(x);
    if (drag === null) return;
    const c = clampToRecorded(x);
    setDrag(c);
    seekSoon(toT(c, k, s));
  };
  const onUp = () => {
    if (drag === null) return;
    setDrag(null);
    if (!wasPaused.current && controller.paused) controller.togglePause();
  };

  const jump = (i: number) => {
    const c = CHAPTERS[i];
    const target = Math.min(k[i] + c.lead, k[i + 1] - 1, info.buffered);
    story.seek(Math.max(k[i], target));
    setUI({ camera: c.camera });
  };

  const hoverT = hover !== null ? toT(Math.min(hover, 1), k, s) : null;
  const recordedPct = info.done ? 100 : Math.round(((info.buffered - info.start) / Math.max(1, info.end - info.start)) * 100);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => controller.togglePause()}
        aria-label={snap.paused ? 'Play' : 'Pause'}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-teal/50 bg-teal/15 text-teal shadow-[0_0_16px_rgba(45,212,191,0.35)] transition hover:bg-teal/25"
      >
        {snap.paused ? <Play size={15} className="translate-x-[1px]" /> : <Pause size={15} />}
      </button>
      <div className="num w-[66px] shrink-0 text-[13px] font-semibold text-white">T+{mmss(t)}</div>
      <div className="relative min-w-0 flex-1 select-none">
        {/* Chapters: click to jump there. */}
        <div className="relative h-[18px]">
          {CHAPTERS.map((c, i) => {
            if (s[i + 1] - s[i] <= 0) return null;
            const reached = info.buffered >= k[i];
            return (
              <button
                key={c.key}
                type="button"
                disabled={!reached}
                onClick={() => jump(i)}
                title={reached ? `Jump to ${c.label.toLowerCase()}` : 'Still being recorded'}
                className={cn(
                  'absolute top-0 flex items-center gap-1.5 truncate text-[11.5px] transition-colors',
                  i === cur ? 'font-semibold text-white' : reached ? 'text-ink-2 hover:text-white' : 'text-dim',
                )}
                style={{ left: `${s[i] * 100}%`, maxWidth: `${(s[i + 1] - s[i]) * 100}%` }}
              >
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', i === cur ? 'bg-amber shadow-[0_0_8px_rgba(245,185,76,0.9)]' : reached ? 'bg-teal' : 'bg-dim')} />
                <span className="truncate">{c.label}</span>
              </button>
            );
          })}
        </div>
        {/* The rail. */}
        <div
          ref={rail}
          role="slider"
          aria-label="Story timeline"
          aria-valuemin={info.start}
          aria-valuemax={info.end}
          aria-valuenow={Math.round(t)}
          tabIndex={0}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={() => setHover(null)}
          onKeyDown={(e) => {
            const i = e.key === 'ArrowRight' ? Math.min(CHAPTERS.length - 1, cur + 1) : e.key === 'ArrowLeft' ? Math.max(0, cur - 1) : -1;
            if (i >= 0) {
              e.preventDefault();
              jump(i);
            }
          }}
          className="group relative mt-1 h-5 cursor-pointer touch-none outline-none"
        >
          <div className="absolute inset-x-0 top-1/2 h-[6px] -translate-y-1/2 overflow-hidden rounded-full bg-white/[0.06]">
            {/* Recorded ahead: can be jumped to. */}
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/[0.14] transition-[width] duration-300" style={{ width: `${bufX * 100}%` }} />
            {!info.done && <div className="story-shimmer absolute inset-y-0 rounded-full" style={{ left: `${bufX * 100}%`, width: '12%' }} />}
            {/* Played. */}
            <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan via-teal to-green" style={{ width: `${playX * 100}%` }} />
          </div>
          {/* Chapter ticks. */}
          {s.slice(1, -1).map((x, i) => (
            <span key={i} className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-white/25" style={{ left: `${x * 100}%` }} />
          ))}
          {/* Hover time. */}
          {hoverT !== null && drag === null && (
            <span className="num pointer-events-none absolute -top-6 -translate-x-1/2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10.5px] text-white" style={{ left: `${Math.min(hover!, bufX) * 100}%` }}>
              T+{mmss(Math.min(hoverT, info.buffered))}
            </span>
          )}
          {/* Handle. */}
          <span
            className={cn(
              'pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-teal shadow-[0_0_0_4px_rgba(45,212,191,0.25),0_0_18px_rgba(45,212,191,0.8)] transition-transform',
              drag !== null ? 'scale-125' : 'group-hover:scale-110',
            )}
            style={{ left: `${playX * 100}%` }}
          />
        </div>
      </div>
      <div className="num w-[86px] shrink-0 text-right text-[11px] leading-tight text-muted">
        {info.done ? (
          <>T+{mmss(info.end)}</>
        ) : (
          <>
            recording
            <br />
            ahead · {Math.min(99, Math.max(0, recordedPct))} %
          </>
        )}
      </div>
    </div>
  );
}
