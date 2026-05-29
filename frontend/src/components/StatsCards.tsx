import { motion } from 'framer-motion';
import { Radio, Key, Server } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { handleMouseMove } from '../utils/mouseTracker';

export default function StatsCards() {
  const { accounts, user } = useAppContext();

  // Пока замокаем aiKeys до добавления контекста или отдельного хука, для простоты берем "Доступно"
  const aiKeysCount = 'Доступно'; 

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={{
        visible: { transition: { staggerChildren: 0.05 } }
      }}
      className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6 mb-6"
    >
      {/* СТАТИСТИКА 1 */}
      <motion.div 
        variants={{
          hidden: { opacity: 0, scale: 0.9, y: 8 },
          visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 15 } }
        }}
        className="p-4 sm:p-5 rounded-3xl glow-card relative overflow-hidden"
        onMouseMove={handleMouseMove}
      >
        <div className="glow-bg rounded-3xl" />
        <div className="flex items-center justify-between mb-2 relative z-10">
          <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Всего ботов</span>
          <Radio className="w-4 h-4 text-brand-cyan" />
        </div>
        <h3 className="text-xl sm:text-2xl font-bold text-white relative z-10 mt-1">{accounts.length}</h3>
        <p className="text-[10px] text-slate-500 font-medium relative z-10 mt-0.5">Добавлено сессий</p>
      </motion.div>

      {/* СТАТИСТИКА 2 */}
      <motion.div 
        variants={{
          hidden: { opacity: 0, scale: 0.9, y: 8 },
          visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 15 } }
        }}
        className="p-4 sm:p-5 rounded-3xl glow-card relative overflow-hidden"
        onMouseMove={handleMouseMove}
      >
        <div className="glow-bg rounded-3xl" />
        <div className="flex items-center justify-between mb-2 relative z-10">
          <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Активно</span>
          <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
        </div>
        <h3 className="text-xl sm:text-2xl font-bold text-white relative z-10 mt-1">
          {accounts.filter(a => a.is_active).length}
        </h3>
        <p className="text-[10px] text-slate-500 font-medium relative z-10 mt-0.5">Служб автовыдачи в сети</p>
      </motion.div>

      {/* СТАТИСТИКА 3 */}
      <motion.div 
        variants={{
          hidden: { opacity: 0, scale: 0.9, y: 8 },
          visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 15 } }
        }}
        className="p-4 sm:p-5 rounded-3xl glow-card relative overflow-hidden"
        onMouseMove={handleMouseMove}
      >
        <div className="glow-bg rounded-3xl" />
        <div className="flex items-center justify-between mb-2 relative z-10">
          <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">AI Ключи</span>
          <Key className="w-4 h-4 text-brand-indigo" />
        </div>
        <h3 className="text-xl sm:text-2xl font-bold text-white relative z-10 mt-1">
          {aiKeysCount}
        </h3>
        <p className="text-[10px] text-slate-500 font-medium relative z-10 mt-0.5">
          {user?.role === 'admin' ? 'Активных ключей в пуле' : 'Глобальный пул ИИ'}
        </p>
      </motion.div>

      {/* СТАТИСТИКА 4 */}
      <motion.div 
        variants={{
          hidden: { opacity: 0, scale: 0.9, y: 8 },
          visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 15 } }
        }}
        className="p-4 sm:p-5 rounded-3xl glow-card relative overflow-hidden"
        onMouseMove={handleMouseMove}
      >
        <div className="glow-bg rounded-3xl" />
        <div className="flex items-center justify-between mb-2 relative z-10">
          <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Статус API</span>
          <Server className="w-4 h-4 text-emerald-400" />
        </div>
        <h3 className="text-xl sm:text-2xl font-bold text-emerald-400 relative z-10 mt-1">OK</h3>
        <p className="text-[10px] text-slate-500 font-medium relative z-10 mt-0.5">Сервис соединен</p>
      </motion.div>
    </motion.div>
  );
}
