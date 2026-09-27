import { createContext, useContext, useState } from 'react';
import {
  fetchSimCards,
  fetchInventory,
  addInventoryItem as apiAddInventoryItem,
  assignInventoryItem as apiAssignInventoryItem,
  updateInventoryStatus as apiUpdateInventoryStatus,
  updateInventoryItem as apiUpdateInventoryItem,
  deleteInventoryItem as apiDeleteInventoryItem,
} from './api';

const SimContext = createContext(null);

/* The `sim_name` column is created by the backend bootstrap on server start. Until
   a backend carrying that bootstrap is deployed, the insert fails on the unknown
   column - so the name is dropped and the SIM is saved anyway rather than the whole
   entry being lost. */
function isMissingColumn(err, column) {
  const m = String((err && err.message) || '').toLowerCase();
  if (!m.includes(column.toLowerCase())) return false;
  return m.includes('column') || m.includes('schema cache') || m.includes('pgrst') || m.includes('does not exist');
}

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
    try {
      const res = await apiAddInventoryItem(item);
      await refreshInventory();
      return res;
    } catch (e) {
      if (item && item.sim_name && isMissingColumn(e, 'sim_name')) {
        const { sim_name, ...rest } = item;
        const res = await apiAddInventoryItem(rest);
        await refreshInventory();
        return res;
      }
      throw e;
    }
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

  /* Handing a SIM back to the locker has to clear the phone it was sitting on,
     not just relabel it. The status endpoint does that on a newer backend, but on
     an older one it only changes the status word, which would leave the phone
     link in place and the SIM stuck in the Assigned tab. So the row is re-sent
     with the phone fields blanked. Every field the endpoint reads is echoed back
     so nothing else - notably expiry_date - is wiped by its own null-defaulting. */
  const releaseInventoryItem = async (item) => {
    await apiUpdateInventoryStatus(item.id, 'Available');
    try {
      await apiUpdateInventoryItem(item.id, {
        sim_name: item.sim_name || '',
        sim_number: item.sim_number,
        sim_type: item.sim_type || '',
        provider: item.provider || '',
        status: 'Available',
        location: item.location || '',
        mobile_id: '',
        device: '',
        imei: '',
        assigned_to: item.assigned_to || '',
        team: item.team || '',
        assignment_date: '',
        issue_date: item.issue_date || '',
        expiry_date: item.expiry_date || '',
        notes: item.notes || '',
      });
    } catch {
      // A newer backend already cleared these on the status call; nothing to do.
    }
    await refreshInventory();
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
      addInventoryItem, assignInventoryItem, updateInventoryStatus, releaseInventoryItem, deleteInventoryItem,
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
