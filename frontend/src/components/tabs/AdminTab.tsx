import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { useAppContext, API_URL } from '../../context/AppContext';
import { handleMouseMove } from '../../utils/mouseTracker';
import { User } from '../../types';

export default function AdminTab() {
  const { token } = useAppContext();
  
  const [pendingUsers, setPendingUsers] = useState<User[]>([]);

  useEffect(() => {
    if (token) {
      fetchPendingUsers();
    }
  }, [token]);

  const fetchPendingUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/pending-approvals`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPendingUsers(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleApproveUser = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/approve/${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchPendingUsers();
        alert('Пользователь одобрен!');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-6"
    >
      <div className="p-5 sm:p-6 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
        <div className="glow-bg rounded-3xl" />
        <h2 className="text-md font-bold text-white mb-4 relative z-10 flex items-center gap-2">
          <Users className="w-4 h-4 text-brand-cyan" />
          <span>Верификация новых пользователей (Одобрения)</span>
        </h2>

        <div className="space-y-3 relative z-10">
          {pendingUsers.length === 0 ? (
            <div className="text-slate-500 text-center py-6 text-xs">Нет заявок на регистрацию в ожидании</div>
          ) : (
            pendingUsers.map(u => (
              <div key={u.id} className="p-4 bg-slate-950/20 border border-white/5 rounded-2xl flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-white block text-sm">{u.username}</span>
                  <span className="text-[10px] text-brand-cyan block font-semibold uppercase mt-0.5">{u.role}</span>
                </div>
                <button
                  onClick={() => handleApproveUser(u.id)}
                  className="bg-brand-cyan hover:opacity-90 active:scale-95 text-black px-4 py-1.5 rounded-xl font-bold transition-all"
                >
                  Одобрить доступ
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
}
