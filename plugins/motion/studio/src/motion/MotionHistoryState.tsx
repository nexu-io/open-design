import { createContext, useContext, useState, type ReactNode } from 'react';

const HistoryOperation = createContext({ busy: false, setBusy: (_busy: boolean) => {} });
export const useMotionHistoryOperation = () => useContext(HistoryOperation);

export function MotionHistoryProvider({ children }: { children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  return <HistoryOperation.Provider value={{ busy, setBusy }}>{children}</HistoryOperation.Provider>;
}
