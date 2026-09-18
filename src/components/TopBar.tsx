import type { TabName } from '../types';

interface TopBarProps {
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
  bookCount: number;
  onOpenBackup: () => void;
  onOpenCsv: () => void;
}

const TABS: { id: TabName; label: string }[] = [
  { id: 'shelf', label: 'Shelf' },
  { id: 'recipes', label: 'Recipes' },
  { id: 'plan', label: 'This week' },
  { id: 'grocery', label: 'Grocery' }
];

export function TopBar({ activeTab, onTabChange, bookCount, onOpenBackup, onOpenCsv }: TopBarProps) {
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
        <span className="count-pill">{bookCount} book{bookCount === 1 ? '' : 's'}</span>
      </div>
    </div>
  );
}
