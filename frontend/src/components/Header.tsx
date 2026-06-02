import { Sparkles, LogOut } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

export default function Header() {
  const { user, activeTab, setActiveTab, logout } = useAppContext();

  return (
    <header className="sticky top-0 z-40 bg-[#06070A]/80 backdrop-blur-md border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-cyan/10 border border-brand-cyan/20 rounded-xl flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-brand-cyan" />
          </div>
          <div>
            <span className="font-bold text-sm bg-gradient-to-r from-brand-cyan to-brand-blue bg-clip-text text-transparent">
              Fanpay Helper
            </span>
            <span className="text-[10px] block text-slate-500 font-semibold tracking-wider uppercase">
              Premium
            </span>
          </div>
        </div>

        {/* Горизонтальная свайп-навигация (no-scrollbar на мобилках) */}
        <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-md md:max-w-xl mx-4 px-2 py-1 scroll-smooth">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`py-1.5 px-3.5 rounded-xl text-xs font-medium shrink-0 transition-all ${
              activeTab === 'dashboard' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Главная
          </button>
          <button
            onClick={() => setActiveTab('delivery')}
            className={`py-1.5 px-3.5 rounded-xl text-xs font-medium shrink-0 transition-all ${
              activeTab === 'delivery' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Склад
          </button>
          <button
            onClick={() => setActiveTab('manager')}
            className={`py-1.5 px-3.5 rounded-xl text-xs font-medium shrink-0 transition-all ${
              activeTab === 'manager' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Менеджер
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`py-1.5 px-3.5 rounded-xl text-xs font-medium shrink-0 transition-all ${
              activeTab === 'templates' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Шаблоны
          </button>
          <button
            onClick={() => setActiveTab('agents')}
            className={`py-1.5 px-3.5 rounded-xl text-xs font-medium shrink-0 transition-all text-brand-cyan hover:text-white flex items-center gap-1 bg-brand-cyan/5 border border-brand-cyan/10 ${
              activeTab === 'agents' ? 'bg-brand-cyan/20 text-white shadow-sm border-brand-cyan/30' : ''
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-brand-cyan" />
            AI-Анализ
          </button>
          {user?.role === 'admin' && (
            <>
              <button
                onClick={() => setActiveTab('ai-keys')}
                className={`py-1.5 px-3.5 rounded-xl text-xs font-medium shrink-0 transition-all ${
                  activeTab === 'ai-keys' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                AI Ключи
              </button>
              <button
                onClick={() => setActiveTab('admin')}
                className={`py-1.5 px-3.5 rounded-xl text-xs font-medium shrink-0 transition-all ${
                  activeTab === 'admin' ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Админ
              </button>
            </>
          )}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-xs font-bold text-white">{user?.username}</span>
            <span className="text-[10px] text-brand-cyan font-semibold uppercase">{user?.role}</span>
          </div>
          <button 
            onClick={logout}
            className="p-2 hover:bg-red-500/10 hover:text-red-400 border border-transparent hover:border-red-500/15 rounded-xl transition-all text-slate-400"
            title="Выйти"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
