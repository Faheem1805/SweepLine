import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  right,
  compact,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  /** Single slim line (pages where the 3D view should get the space). */
  compact?: boolean;
}) {
  if (compact)
    return (
      <div className="flex h-[30px] shrink-0 items-center justify-between gap-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="shrink-0 text-[19px] font-semibold tracking-tight text-white">{title}</h1>
          {subtitle && <p className="truncate text-[13px] text-muted">{subtitle}</p>}
        </div>
        {right}
      </div>
    );
  return (
    <div className="flex shrink-0 items-end justify-between gap-6">
      <div className="min-w-0">
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h1 className="page-title mt-1 truncate">{title}</h1>
        {subtitle && <p className="page-sub mt-1.5 line-clamp-2">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
