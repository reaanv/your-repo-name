import { AlertTriangle, Bug, CircleDot, Gauge, ShieldAlert, Sparkles, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { RiskLevel, ReviewStatus, Severity } from '@/lib/types';

const SEVERITY_STYLES: Record<Severity, { chip: string; icon: LucideIcon; label: string }> = {
  security: {
    chip: 'border-state-danger/30 bg-state-danger/10 text-state-danger',
    icon: ShieldAlert,
    label: 'Security',
  },
  bug: {
    chip: 'border-state-warning/30 bg-state-warning/10 text-state-warning',
    icon: Bug,
    label: 'Bug',
  },
  optimization: {
    chip: 'border-state-info/30 bg-state-info/10 text-state-info',
    icon: Zap,
    label: 'Optimization',
  },
  nit: {
    chip: 'border-state-neutral/25 bg-state-neutral/10 text-content-secondary',
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
      {count !== undefined ? <span className="tabular-nums opacity-80">{count}</span> : null}
    </span>
  );
}

const RISK_STYLES: Record<RiskLevel, string> = {
  low: 'border-state-success/30 bg-state-success/10 text-state-success',
  medium: 'border-state-warning/30 bg-state-warning/10 text-state-warning',
  high: 'border-state-caution/30 bg-state-caution/10 text-state-caution',
  critical: 'border-state-danger/40 bg-state-danger/15 text-state-danger',
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
    chip: 'border-state-success/30 bg-state-success/10 text-state-success',
    icon: CircleDot,
    label: 'Passed',
  },
  // The accent is reserved for in-flight state, so `running` owns it and
  // `changes-requested` reads as the warning it is rather than as branding.
  'changes-requested': {
    chip: 'border-state-warning/30 bg-state-warning/10 text-state-warning',
    icon: AlertTriangle,
    label: 'Changes requested',
  },
  running: {
    chip: 'border-accent/30 bg-accent/10 text-accent',
    icon: CircleDot,
    label: 'Running',
  },
  failed: {
    chip: 'border-state-danger/30 bg-state-danger/10 text-state-danger',
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
        className={cn('h-3.5 w-3.5', status === 'running' && 'animate-pulse-soft')}
      />
      {style.label}
    </span>
  );
}
