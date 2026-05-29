import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, UserPlus, AlertCircle, CheckCircle, Sparkles, RefreshCw } from 'lucide-react';
import { handleMouseMove } from '../utils/mouseTracker';
import { useAppContext, API_URL } from '../context/AppContext';

export default function AuthPage() {
  const { setToken, setUser } = useAppContext();
  
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [registerRole, setRoleInput] = useState<'owner' | 'manager'>('owner');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    setLoading(true);

    try {
      if (authMode === 'login') {
        const formData = new URLSearchParams();
        formData.append('username', usernameInput);
        formData.append('password', passwordInput);

        const res = await fetch(`${API_URL}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData
        });
        const data = await res.json();
        if (res.ok) {
          setToken(data.access_token);
          setUser(data.user);
        } else {
          setAuthError(data.detail || 'Ошибка авторизации');
        }
      } else {
        const res = await fetch(`${API_URL}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: usernameInput,
            password: passwordInput,
            role: registerRole
          })
        });
        const data = await res.json();
        if (res.ok) {
          setAuthSuccess('Регистрация успешна! Ожидайте одобрения администратором.');
          setAuthMode('login');
        } else {
          // Обрабатываем 422 ошибку Pydantic (массив ошибок валидации)
          if (res.status === 422 && data.detail && Array.isArray(data.detail)) {
            setAuthError(data.detail[0].msg || 'Ошибка валидации данных');
          } else {
            setAuthError(data.detail || 'Ошибка регистрации');
          }
        }
      }
    } catch {
      setAuthError('Не удалось связаться с сервером бэкенда.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center font-sans">
      <div className="velvet-backdrop" />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md p-8 rounded-3xl glow-card shadow-glass relative mx-4"
        onMouseMove={handleMouseMove}
      >
        <div className="glow-bg rounded-3xl" />
        
        <div className="text-center mb-8 relative z-10">
          <motion.div 
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            className="w-16 h-16 bg-brand-cyan/10 border border-brand-cyan/20 rounded-2xl flex items-center justify-center mx-auto mb-4"
          >
            <Sparkles className="w-8 h-8 text-brand-cyan" />
          </motion.div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-brand-cyan via-brand-blue to-brand-indigo bg-clip-text text-transparent">
            Fanpay Helper Pro
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            {authMode === 'login' ? 'Вход в премиальную панель' : 'Регистрация нового аккаунта'}
          </p>
        </div>

        <form onSubmit={handleAuthSubmit} className="space-y-5 relative z-10">
          {authError && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}
          {authSuccess && (
            <div className="p-3.5 bg-green-500/10 border border-green-500/20 text-green-400 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{authSuccess}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 ml-1">Имя пользователя</label>
            <div className="relative">
              <input 
                type="text" 
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                className="w-full bg-slate-950/40 border border-white/5 rounded-2xl py-3 px-4 text-sm text-white focus:outline-none focus:border-brand-cyan/40 focus:ring-1 focus:ring-brand-cyan/40 transition-all placeholder:text-slate-600"
                placeholder="admin"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5 ml-1">Пароль</label>
            <div className="relative">
              <input 
                type="password" 
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full bg-slate-950/40 border border-white/5 rounded-2xl py-3 px-4 text-sm text-white focus:outline-none focus:border-brand-cyan/40 focus:ring-1 focus:ring-brand-cyan/40 transition-all placeholder:text-slate-600"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {authMode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5 ml-1">Роль аккаунта</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRoleInput('owner')}
                  className={`py-2 px-4 rounded-xl border text-xs font-medium transition-all ${
                    registerRole === 'owner' 
                      ? 'bg-brand-cyan/10 border-brand-cyan/30 text-brand-cyan shadow-cyan-glow' 
                      : 'bg-transparent border-white/5 text-slate-400 hover:border-white/10'
                  }`}
                >
                  Владелец
                </button>
                <button
                  type="button"
                  onClick={() => setRoleInput('manager')}
                  className={`py-2 px-4 rounded-xl border text-xs font-medium transition-all ${
                    registerRole === 'manager' 
                      ? 'bg-brand-cyan/10 border-brand-cyan/30 text-brand-cyan shadow-cyan-glow' 
                      : 'bg-transparent border-white/5 text-slate-400 hover:border-white/10'
                  }`}
                >
                  Менеджер
                </button>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 bg-gradient-to-r from-brand-cyan via-brand-blue to-brand-indigo hover:opacity-90 active:scale-[0.98] text-black font-semibold text-sm py-3 px-4 rounded-2xl transition-all shadow-cyan-glow flex items-center justify-center gap-2"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : authMode === 'login' ? (
              <>
                <Lock className="w-4 h-4" />
                <span>Войти в систему</span>
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                <span>Создать аккаунт</span>
              </>
            )}
          </button>
        </form>

        <div className="text-center mt-6 relative z-10">
          <button 
            onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
            className="text-slate-400 hover:text-brand-cyan text-xs transition-colors font-medium"
          >
            {authMode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже зарегистрированы? Войти'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
