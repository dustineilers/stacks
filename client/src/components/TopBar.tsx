import type { TabName } from '../types';

interface TopBarProps {
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
  bookCount: number;
  onOpenBackup: () => void;
  onOpenCsv: () => void;
  onOpenAnalysis: () => void;
  onOpenMenuPlanner: () => void;
}

const TABS: { id: TabName; label: string }[] = [
  { id: 'shelf', label: 'Shelf' },
  { id: 'recipes', label: 'Recipes' },
  { id: 'plan', label: 'Plan' },
  { id: 'grocery', label: 'Grocery' },
  { id: 'pantry', label: 'Pantry' },
];

export function TopBar({ activeTab, onTabChange, bookCount, onOpenBackup, onOpenCsv, onOpenAnalysis, onOpenMenuPlanner }: TopBarProps) {
  return (
    <div className="topbar">
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
        <button type="button" className="toolbar-btn" onClick={onOpenBackup}>Backup</button>
        <button type="button" className="toolbar-btn" onClick={onOpenCsv}>Import CSV</button>
        <button type="button" className="toolbar-btn" onClick={onOpenAnalysis}>Discover gaps</button>
        <button type="button" className="toolbar-btn" onClick={onOpenMenuPlanner}>Plan a menu</button>
        <span className="count-pill">{bookCount} book{bookCount === 1 ? '' : 's'}</span>
      </div>
    </div>
  );
}
