import { createContext, useContext, useState, useCallback } from 'react';
import { fetchSimCards } from './api';
import { toast } from '../../components/Toast';

const SimContext = createContext(null);

export function SimProvider({ children }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSimCards();
      setCards(Array.isArray(data) ? data : []);
    } catch (e) {
      setCards([]);
      toast(e.message || 'Failed to load SIM cards', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <SimContext.Provider value={{ cards, setCards, loading, refresh }}>
      {children}
    </SimContext.Provider>
  );
}

export function useSim() {
  const ctx = useContext(SimContext);
  if (!ctx) throw new Error('useSim must be used within SimProvider');
  return ctx;
}
