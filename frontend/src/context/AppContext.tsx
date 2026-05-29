import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, FanpayAccount } from '../types';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface AppContextType {
  token: string | null;
  user: User | null;
  accounts: FanpayAccount[];
  selectedAccountId: number | null;
  activeTab: 'dashboard' | 'delivery' | 'dumping' | 'manager' | 'ai-keys' | 'admin';
  setToken: (token: string | null) => void;
  setUser: (user: User | null) => void;
  setAccounts: (accounts: FanpayAccount[]) => void;
  setSelectedAccountId: (id: number | null) => void;
  setActiveTab: (tab: 'dashboard' | 'delivery' | 'dumping' | 'manager' | 'ai-keys' | 'admin') => void;
  fetchAccounts: () => Promise<void>;
  logout: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<FanpayAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'delivery' | 'dumping' | 'manager' | 'ai-keys' | 'admin'>('dashboard');

  const fetchMe = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        setToken(null);
      }
    } catch {
      setToken(null);
    }
  };

  const fetchAccounts = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
        if (data.length > 0 && !selectedAccountId) {
          setSelectedAccountId(data[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      fetchMe();
    } else {
      localStorage.removeItem('token');
      setUser(null);
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      fetchAccounts();
    }
  }, [user]);

  const logout = () => {
    setToken(null);
  };

  return (
    <AppContext.Provider value={{
      token, user, accounts, selectedAccountId, activeTab,
      setToken, setUser, setAccounts, setSelectedAccountId, setActiveTab,
      fetchAccounts, logout
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
