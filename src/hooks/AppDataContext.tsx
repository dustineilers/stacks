import { createContext, useContext, type ReactNode } from 'react';
import { useAppData, type AppData } from './useAppData';

const AppDataContext = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const data = useAppData();
  return <AppDataContext.Provider value={data}>{children}</AppDataContext.Provider>;
}

export function useAppDataContext(): AppData {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppDataContext must be used within an AppDataProvider');
  return ctx;
}
