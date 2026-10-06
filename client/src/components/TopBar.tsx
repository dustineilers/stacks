import { useEffect, useRef, useState } from 'react';
import type { TabName } from '../types';
import type { SyncStatus } from '../db/sqlite';

interface TopBarProps {
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
  bookCount: number;
  syncStatus: SyncStatus;
  onSyncNow: () => void;
  onOpenBackup: () => void;
  onOpenCsv: () => void;
  onOpenAnalysis: () => void;
}

const TABS: { id: TabName; label: string }[] = [
  { id: 'shelf', label: 'Shelf' },
  { id: 'recipes', label: 'Recipes' },
  { id: 'plan', label: 'Plan' },
  { id: 'menu', label: 'Menu' },
  { id: 'grocery', label: 'Grocery' },
];

export function TopBar({ activeTab, onTabChange, bookCount, syncStatus, onSyncNow, onOpenBackup, onOpenCsv, onOpenAnalysis }: TopBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // The bar is fixed, so every view has to leave room for it — and its height
  // changes with the viewport (on a phone it wraps to three rows, roughly
  // doubling). Publishing the measured height means layouts derive their
  // offset from what the bar actually is, instead of each one guessing with
  // its own hard-coded number that silently goes stale.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const publish = () => {
      document.documentElement.style.setProperty('--topbar-h', `${Math.round(bar.getBoundingClientRect().height)}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [moreOpen]);

  const pick = (action: () => void) => {
    action();
    setMoreOpen(false);
  };

  return (
    <div className="topbar" ref={barRef}>
      <div className="brand">
        <h1>Stacks</h1>
        <span className="tagline">your cookbook shelf</span>
      </div>
      <div className="tab-switch">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab-pill${activeTab === t.id ? ' active' : ''}`}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="topbar-right">
        {syncStatus === 'offline' && <span className="count-pill" title="No connection to the shared backend — changes are saved on this device and will sync once it's reachable again.">Offline</span>}
        <span className="count-pill">{bookCount} book{bookCount === 1 ? '' : 's'}</span>
        <div className="more-menu" ref={moreRef}>
          <button type="button" className="toolbar-btn" onClick={() => setMoreOpen((v) => !v)} aria-haspopup="true" aria-expanded={moreOpen}>
            More {'⋯'}
          </button>
          {moreOpen && (
            <div className="more-menu-list">
              <button type="button" onClick={() => pick(onSyncNow)} disabled={syncStatus === 'syncing'}>
                {syncStatus === 'syncing' ? 'Syncing...' : 'Sync now'}
              </button>
              <button type="button" onClick={() => pick(onOpenBackup)}>Backup</button>
              <button type="button" onClick={() => pick(onOpenCsv)}>Import CSV</button>
              <button type="button" onClick={() => pick(onOpenAnalysis)}>Discover gaps</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
