'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  BarChart3,
  GitPullRequest,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  testId: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, testId: 'nav-dashboard' },
  { href: '/reviews', label: 'PR Reviews', icon: GitPullRequest, testId: 'nav-reviews' },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, testId: 'nav-analytics' },
  { href: '/rules', label: 'Rule Configuration', icon: SlidersHorizontal, testId: 'nav-rules' },
  { href: '/settings', label: 'Settings', icon: Settings, testId: 'nav-settings' },
];

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/reviews': 'PR Reviews',
  '/analytics': 'Analytics',
  '/rules': 'Rule Configuration',
  '/settings': 'Settings',
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Route changes should always dismiss the mobile drawer.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Stable identity so the drawer's key/focus effects don't resubscribe on
  // every render of the shell.
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  // Held here because the button lives in the top bar and the drawer that has to
  // hand focus back to it lives in the sidebar. Reading `document.activeElement`
  // when the drawer opens is not a substitute: WebKit does not focus a <button>
  // when it is clicked or tapped, so on Safari the "opener" it captures is
  // <body>, and closing the drawer drops focus to the top of the document —
  // precisely the WCAG 2.4.3 failure this is meant to prevent.
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
      <Sidebar
        pathname={pathname}
        mobileOpen={mobileOpen}
        onClose={closeMobile}
        toggleRef={toggleRef}
      />

      <div className="flex min-w-0 flex-col">
        <TopBar
          title={PAGE_TITLES[pathname] ?? 'Dashboard'}
          onMenu={() => setMobileOpen(true)}
          toggleRef={toggleRef}
        />
        <main
          data-testid="page-main"
          data-route={pathname}
          className="mx-auto w-full max-w-[110rem] flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

// Tailwind's `lg` breakpoint. At and above it the sidebar is permanent, so the
// closed-drawer treatment below must never reach it.
const DESKTOP_QUERY = '(min-width: 1024px)';

/**
 * Optimistically `true` so the server HTML and the first client render agree
 * and the permanent desktop sidebar is never inerted, not even for one frame.
 * The real match arrives in the effect, long before a keyboard can reach the
 * drawer.
 */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const sync = () => setIsDesktop(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  return isDesktop;
}

function Sidebar({
  pathname,
  mobileOpen,
  onClose,
  toggleRef,
}: {
  pathname: string;
  mobileOpen: boolean;
  onClose: () => void;
  toggleRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const isDesktop = useIsDesktop();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Below `lg` a closed drawer is only pushed off-canvas by a transform, so it
  // stays focusable and readable unless it is explicitly inerted.
  const offCanvas = !isDesktop && !mobileOpen;
  const asModal = !isDesktop && mobileOpen;

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen, onClose]);

  // `aria-modal` hides the rest of the page from assistive tech, so focus has
  // to move in with it — and back out to whatever opened the drawer on close.
  useEffect(() => {
    if (!asModal) return;
    closeRef.current?.focus();
    // The toggle, not whatever happened to hold focus when the drawer opened.
    // Only the toggle can reopen the drawer, so it is where a keyboard user has
    // to land — and it is the one answer that does not change per browser.
    return () => toggleRef.current?.focus();
  }, [asModal, toggleRef]);

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation overlay"
          data-testid="sidebar-overlay"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-ink-950/70 backdrop-blur-sm lg:hidden"
        />
      ) : null}

      <aside
        data-testid="sidebar"
        data-open={mobileOpen ? 'true' : 'false'}
        inert={offCanvas}
        role={asModal ? 'dialog' : undefined}
        aria-modal={asModal ? true : undefined}
        aria-label="Site navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[17rem] flex-col border-r border-white/[0.07] bg-ink-900/85 backdrop-blur-2xl transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-accent/40 bg-accent/15 text-accent-soft shadow-glow">
            <ShieldCheck aria-hidden className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white">PR Reviewer</span>
            <span className="block truncate text-xs text-slate-400">Agentic CI/CD</span>
          </span>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close navigation"
            data-testid="sidebar-close"
            onClick={onClose}
            className="ml-auto rounded-lg border border-white/10 p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-white lg:hidden"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>

        {/* Named landmark: screen readers list navigation regions by their
            accessible name, and an unnamed one is announced as just "navigation". */}
        <nav aria-label="Primary" data-testid="sidebar-nav" className="flex-1 space-y-1 px-3 py-2">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={item.testId}
                data-active={active ? 'true' : 'false'}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition',
                  active
                    ? 'border border-accent/30 bg-accent/12 font-medium text-white shadow-glow'
                    : 'border border-transparent text-slate-400 hover:bg-white/[0.04] hover:text-slate-100',
                )}
              >
                <Icon
                  aria-hidden
                  className={cn('h-4.5 w-4.5 shrink-0', active ? 'text-accent-soft' : 'text-slate-500 group-hover:text-slate-300')}
                  style={{ height: '1.125rem', width: '1.125rem' }}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 pb-5">
          <div className="glass-soft p-4">
            <p className="text-xs font-medium text-slate-300">Fail-closed pipeline</p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              Diffs are redacted before they leave the runner, and a schema violation blocks the
              review instead of posting it.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}

// Settings + Sign out: the roving tab stops inside the account menu.
const ACCOUNT_MENU_ITEMS = 2;

function TopBar({
  title,
  onMenu,
  toggleRef,
}: {
  title: string;
  onMenu: () => void;
  toggleRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [syncing, setSyncing] = useState(false);
  const [syncLabel, setSyncLabel] = useState('Synced 1m ago');
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeItem, setActiveItem] = useState(0);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const accountRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accountButtonId = useId();

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleSync = useCallback(() => {
    if (syncing) return;
    setSyncing(true);
    setSyncLabel('Syncing…');
    timerRef.current = setTimeout(() => {
      setSyncing(false);
      setSyncLabel('Synced just now');
    }, 550);
  }, [syncing]);

  const closeMenu = useCallback((restoreFocus: boolean) => {
    setMenuOpen(false);
    if (restoreFocus) accountRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      // Escape is a deliberate dismissal, so focus goes back to the trigger
      // rather than being dropped on the body.
      if (event.key === 'Escape') closeMenu(true);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, closeMenu]);

  // `role="menu"` drops screen readers into focus mode, where browse-mode
  // arrows stop working — so the menu itself has to own focus and move it.
  useEffect(() => {
    if (!menuOpen) return;
    itemRefs.current[activeItem]?.focus();
  }, [menuOpen, activeItem]);

  const handleMenuKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const last = ACCOUNT_MENU_ITEMS - 1;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveItem((index) => (index >= last ? 0 : index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveItem((index) => (index <= 0 ? last : index - 1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveItem(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveItem(last);
    }
  }, []);

  return (
    <header
      data-testid="topbar"
      className="sticky top-0 z-20 border-b border-white/[0.06] bg-ink-950/70 backdrop-blur-xl"
    >
      <div className="mx-auto flex w-full max-w-[110rem] items-center gap-3 px-4 py-3.5 sm:px-6 lg:px-10">
        <button
          type="button"
          ref={toggleRef}
          aria-label="Open navigation"
          data-testid="sidebar-toggle"
          onClick={onMenu}
          className="rounded-lg border border-white/10 p-2 text-slate-300 transition hover:bg-white/5 hover:text-white lg:hidden"
        >
          <Menu aria-hidden className="h-4 w-4" />
        </button>

        <h1 data-testid="page-title" className="truncate text-base font-semibold text-white sm:text-lg">
          {title}
        </h1>

        <span
          data-testid="agent-status"
          className="ml-2 hidden items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-200 sm:inline-flex"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Agent online
        </span>

        <div className="ml-auto flex items-center gap-2">
          <span data-testid="sync-label" className="hidden text-xs text-slate-500 md:inline">
            {syncLabel}
          </span>

          <button
            type="button"
            data-testid="sync-button"
            data-syncing={syncing ? 'true' : 'false'}
            onClick={handleSync}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-white/20 hover:bg-white/[0.07]"
          >
            <RefreshCw aria-hidden className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
            <span className="hidden sm:inline">Sync now</span>
          </button>

          <div ref={menuRef} className="relative">
            <button
              ref={accountRef}
              id={accountButtonId}
              type="button"
              aria-label="Account menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              data-testid="account-button"
              onClick={() => {
                setActiveItem(0);
                setMenuOpen((open) => !open);
              }}
              className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.05] text-slate-200 transition hover:border-accent/40 hover:text-white"
            >
              <UserRound aria-hidden className="h-4 w-4" />
            </button>

            {menuOpen ? (
              <div
                role="menu"
                aria-labelledby={accountButtonId}
                data-testid="account-menu"
                onKeyDown={handleMenuKeyDown}
                className="glass absolute right-0 top-11 w-56 animate-scale-in overflow-hidden p-1.5"
              >
                <div role="none" className="px-3 py-2">
                  <p className="text-sm font-medium text-white">Reanna Verma</p>
                  <p className="truncate text-xs text-slate-400">reaanverma@gmail.com</p>
                </div>
                <div role="separator" className="my-1 h-px bg-white/[0.07]" />
                <Link
                  ref={(node) => {
                    itemRefs.current[0] = node;
                  }}
                  href="/settings"
                  role="menuitem"
                  tabIndex={activeItem === 0 ? 0 : -1}
                  data-testid="account-menu-settings"
                  // Navigating away does not unmount the menu — it lives in the
                  // shell, not the page — so without this the overlay stays
                  // open on top of the route it just moved to. No focus
                  // restore: focus belongs to the new page, not the trigger.
                  onClick={() => closeMenu(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
                >
                  <Settings aria-hidden className="h-4 w-4" />
                  Settings
                </Link>
                <button
                  ref={(node) => {
                    itemRefs.current[1] = node;
                  }}
                  type="button"
                  role="menuitem"
                  tabIndex={activeItem === 1 ? 0 : -1}
                  data-testid="account-menu-signout"
                  onClick={() => closeMenu(true)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
                >
                  <LogOut aria-hidden className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
