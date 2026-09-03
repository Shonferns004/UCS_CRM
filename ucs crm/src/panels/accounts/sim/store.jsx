import { createContext, useContext, useState } from 'react';
import {
  fetchSimCards,
  fetchInventory,
  addInventoryItem as apiAddInventoryItem,
  assignInventoryItem as apiAssignInventoryItem,
  updateInventoryStatus as apiUpdateInventoryStatus,
  deleteInventoryItem as apiDeleteInventoryItem,
} from './api';

const SimContext = createContext(null);

export function SimProvider({ children }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inventory, setInventory] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await fetchSimCards();
      if (Array.isArray(data)) {
        setCards(data);
      }
    } catch {
      // keep current state on error
    } finally {
      setLoading(false);
    }
  };

  const refreshInventory = async () => {
    setInventoryLoading(true);
    try {
      const data = await fetchInventory();
      setInventory(Array.isArray(data) ? data : []);
    } catch {
      setInventory([]);
    } finally {
      setInventoryLoading(false);
    }
  };

  const addInventoryItem = async (item) => {
    const res = await apiAddInventoryItem(item);
    await refreshInventory();
    return res;
  };

  const assignInventoryItem = async (id, data) => {
    const res = await apiAssignInventoryItem(id, data);
    await refreshInventory();
    return res;
  };

  const updateInventoryStatus = async (id, status) => {
    const res = await apiUpdateInventoryStatus(id, status);
    await refreshInventory();
    return res;
  };

  const deleteInventoryItem = async (id) => {
    const res = await apiDeleteInventoryItem(id);
    await refreshInventory();
    return res;
  };

  return (
    <SimContext.Provider value={{
      cards, setCards, loading, refresh,
      inventory, inventoryLoading, refreshInventory,
      addInventoryItem, assignInventoryItem, updateInventoryStatus, deleteInventoryItem,
    }}>
      {children}
    </SimContext.Provider>
  );
}

export function useSim() {
  const ctx = useContext(SimContext);
  if (!ctx) throw new Error('useSim must be used within SimProvider');
  return ctx;
}
