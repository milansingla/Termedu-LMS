import { createContext, useContext, useState, useEffect } from 'react';

const API = '';
const ComingSoonContext = createContext(null);

export function ComingSoonProvider({ children }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = async () => {
    try {
      const res = await fetch(`${API}/api/coming-soon`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchItems(); }, []);

  const addItem = async (payload) => {
    const res = await fetch(`${API}/api/coming-soon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const item = await res.json();
    setItems(prev => [...prev, item]);
    return item;
  };

  const updateItem = async (id, payload) => {
    const res = await fetch(`${API}/api/coming-soon/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const updated = await res.json();
    setItems(prev => prev.map(i => (i.id === id ? updated : i)));
    return updated;
  };

  const deleteItem = async (id) => {
    await fetch(`${API}/api/coming-soon/${id}`, { method: 'DELETE' });
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const toggleVisible = (id) => {
    const item = items.find(i => i.id === id);
    if (item) updateItem(id, { visible: !item.visible });
  };

  const visibleItems = items.filter(i => i.visible);

  return (
    <ComingSoonContext.Provider value={{ items, visibleItems, loading, addItem, updateItem, deleteItem, toggleVisible }}>
      {children}
    </ComingSoonContext.Provider>
  );
}

export const useComingSoon = () => useContext(ComingSoonContext);
