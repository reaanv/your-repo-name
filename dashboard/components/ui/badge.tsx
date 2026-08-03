import { AlertTriangle, Bug, CircleDot, Gauge, ShieldAlert, Sparkles, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { RiskLevel, ReviewStatus, Severity } from '@/lib/types';

const SEVERITY_STYLES: Record<Severity, { chip: string; icon: LucideIcon; label: string }> = {
  security: {
    chip: 'border-rose-400/30 bg-rose-500/10 text-rose-200',
    icon: ShieldAlert,
    label: 'Security',
  },
  bug: {
    chip: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
    icon: Bug,
    label: 'Bug',
  },
  optimization: {
    chip: 'border-sky-400/30 bg-sky-500/10 text-sky-200',
    icon: Zap,
    label: 'Optimization',
  },
  nit: {
    chip: 'border-slate-400/25 bg-slate-400/10 text-slate-300',
    icon: Sparkles,
    label: 'Nit',
  },
};

export function SeverityBadge({
  severity,
  count,
  className,
  showIcon = true,
}: {
  severity: Severity;
  count?: number;
  className?: string;
  showIcon?: boolean;
}) {
  const style = SEVERITY_STYLES[severity];
  const Icon = style.icon;
  return (
    <span
      data-testid={`severity-badge-${severity}`}
      data-severity={severity}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        style.chip,
        className,
      )}
    >
      {showIcon ? <Icon aria-hidden className="h-3.5 w-3.5" /> : null}
      {style.label}
      {count !== undefined ? <span className="font-mono opacity-80">{count}</span> : null}
    </span>
  );
}

const RISK_STYLES: Record<RiskLevel, string> = {
  low: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
  medium: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
  high: 'border-orange-400/30 bg-orange-500/10 text-orange-200',
  critical: 'border-rose-400/40 bg-rose-500/15 text-rose-200',
};

export function RiskBadge({ risk, className }: { risk: RiskLevel; className?: string }) {
  return (
    <span
      data-testid={`risk-badge-${risk}`}
      data-risk={risk}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium capitalize',
        RISK_STYLES[risk],
        className,
      )}
    >
      <Gauge aria-hidden className="h-3.5 w-3.5" />
      {risk} risk
    </span>
  );
}

const STATUS_STYLES: Record<ReviewStatus, { chip: string; icon: LucideIcon; label: string }> = {
  passed: {
    chip: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
    icon: CircleDot,
    label: 'Passed',
  },
  'changes-requested': {
    chip: 'border-violet-400/30 bg-violet-500/10 text-violet-200',
    icon: AlertTriangle,
    label: 'Changes requested',
  },
  running: {
    chip: 'border-sky-400/30 bg-sky-500/10 text-sky-200',
    icon: CircleDot,
    label: 'Running',
  },
  failed: {
    chip: 'border-rose-400/30 bg-rose-500/10 text-rose-200',
    icon: AlertTriangle,
    label: 'Failed',
  },
};

export function StatusBadge({ status, className }: { status: ReviewStatus; className?: string }) {
  const style = STATUS_STYLES[status];
  const Icon = style.icon;
  return (
    <span
      data-testid={`status-badge-${status}`}
      data-status={status}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        style.chip,
        className,
      )}
    >
      <Icon
        aria-hidden
        className={cn('h-3.5 w-3.5', status === 'running' && 'animate-pulse')}
      />
      {style.label}
    </span>
  );
}
