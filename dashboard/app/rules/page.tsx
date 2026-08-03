import type { Metadata } from 'next';

import { RulesForm } from '@/components/rules-form';

export const metadata: Metadata = {
  title: 'Rule Configuration · Autonomous PR Reviewer',
};

export default function RulesPage() {
  return (
    <div className="space-y-5">
      <header data-testid="rules-header">
        <h2 className="text-lg font-semibold text-white">Rule configuration</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-400">
          These map one-to-one onto the action&apos;s inputs. Everything here is enforced by the policy layer
          after the model responds &mdash; the model never decides what is allowed through.
        </p>
      </header>

      <RulesForm />
    </div>
  );
}
