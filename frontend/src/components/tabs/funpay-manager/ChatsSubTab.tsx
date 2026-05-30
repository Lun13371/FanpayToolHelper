import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  RefreshCw, User, Loader2, Send, MessageSquare 
} from 'lucide-react';
import { useAppContext, API_URL } from '../../../context/AppContext';
import { handleMouseMove } from '../../../utils/mouseTracker';

interface ChatDialogue {
  node_id: string;
  username: string;
  avatar_url: string | null;
  last_message: string;
  is_unread: boolean;
  unread_count: number;
}

interface ChatMessage {
  author: string;
  text: string;
  is_me: boolean;
  time: string;
}

export default function ChatsSubTab() {
  const { token, selectedAccountId } = useAppContext();

  const [chats, setChats] = useState<ChatDialogue[]>([]);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Эффект автоматической прокрутки чата вниз при новых сообщениях
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Авто-поллинг мессенджера
  useEffect(() => {
    if (selectedAccountId && token) {
      fetchChats();
      const interval = setInterval(fetchChats, 7000);
      return () => clearInterval(interval);
    }
  }, [selectedAccountId, token]);

  // Авто-поллиринг переписки активного чата
  useEffect(() => {
    if (selectedAccountId && token && activeNodeId) {
      fetchMessages(activeNodeId);
      const interval = setInterval(() => fetchMessages(activeNodeId), 3500);
      return () => clearInterval(interval);
    }
  }, [selectedAccountId, token, activeNodeId]);

  // Мессенджер: получение списка чатов
  const fetchChats = async () => {
    if (!selectedAccountId) return;
    setChatsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${selectedAccountId}/chats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setChats(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setChatsLoading(false);
    }
  };

  // Мессенджер: получение переписки
  const fetchMessages = async (nodeId: string) => {
    if (!selectedAccountId) return;
    setMessagesLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${selectedAccountId}/chats/${nodeId}/messages`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setMessagesLoading(false);
    }
  };

  // Мессенджер: отправка сообщения оператором
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId || !activeNodeId || !replyText.trim()) return;
    setSendingReply(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/accounts/${selectedAccountId}/chats/${activeNodeId}/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: replyText })
      });
      if (res.ok) {
        setReplyText('');
        await fetchMessages(activeNodeId);
        fetchChats();
      } else {
        const err = await res.json();
        alert(err.detail || 'Не удалось отправить сообщение');
      }
    } catch {
      alert('Ошибка отправки');
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <motion.div
      key="tab_chats"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full"
    >
      {/* СПИСОК ДИАЛОГОВ */}
      <div className="lg:col-span-4 p-5 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
        <div className="glow-bg rounded-3xl" />
        
        <div className="flex items-center justify-between mb-4 relative z-10 pb-2 border-b border-white/5">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Все диалоги</h2>
          <button
            onClick={fetchChats}
            disabled={chatsLoading}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${chatsLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="space-y-2 relative z-10 max-h-[500px] overflow-y-auto pr-1 no-scrollbar">
          {chats.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">Нет active-диалогов на Funpay</div>
          ) : (
            chats.map((chat) => (
              <button
                key={chat.node_id}
                onClick={() => {
                  setActiveNodeId(chat.node_id);
                  setMessages([]);
                  fetchMessages(chat.node_id);
                }}
                className={`w-full p-3 rounded-2xl border text-left flex items-center gap-3 transition-all ${
                  activeNodeId === chat.node_id 
                    ? 'bg-brand-cyan/10 border-brand-cyan/30' 
                    : 'bg-slate-950/20 border-white/5 hover:border-white/10'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 shrink-0 overflow-hidden relative">
                  {chat.avatar_url ? (
                    <img src={chat.avatar_url} alt="Ava" className="w-full h-full object-cover animate-fade-in" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-400 uppercase">
                      {chat.username[0]}
                    </div>
                  )}
                  {chat.is_unread && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 border-2 border-[#06070A] rounded-full" />
                  )}
                </div>

                <div className="min-w-0 flex-grow">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className={`text-xs font-bold truncate ${chat.is_unread ? 'text-white' : 'text-slate-200'}`}>
                      {chat.username}
                    </h4>
                    {chat.unread_count > 0 && (
                      <span className="text-[9px] bg-red-500 text-white font-bold px-1.5 py-0.5 rounded-full min-w-[15px] text-center shrink-0">
                        {chat.unread_count}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5 font-medium">{chat.last_message || 'Без текста'}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ИСТОРИЯ ПЕРЕПИСКИ И ОТПРАВКА */}
      <div className="lg:col-span-8 p-5 rounded-3xl glow-card relative" onMouseMove={handleMouseMove}>
        <div className="glow-bg rounded-3xl" />

        {activeNodeId ? (
          <div className="flex flex-col h-[540px] relative z-10">
            {/* Имя контакта */}
            <div className="pb-3 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-brand-cyan" />
                <span>Диалог #{activeNodeId}</span>
              </h3>
              <span className="text-[9px] text-slate-400 font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase">
                Интеграция ИИ активна
              </span>
            </div>

            {/* Окно переписки */}
            <div className="flex-grow overflow-y-auto py-4 space-y-3 pr-1 no-scrollbar">
              {messagesLoading && messages.length === 0 ? (
                <div className="text-center py-20 text-slate-500 text-xs">Загрузка переписки...</div>
              ) : messages.length === 0 ? (
                <div className="text-center py-20 text-slate-500 text-xs">История сообщений пуста</div>
              ) : (
                messages.map((msg, idx) => (
                  <div 
                    key={idx} 
                    className={`flex flex-col max-w-[80%] ${msg.is_me ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                  >
                    <div className={`p-3 rounded-2xl text-xs font-medium leading-relaxed shadow-sm ${
                      msg.is_me 
                        ? 'bg-brand-cyan text-slate-950 rounded-tr-none' 
                        : 'bg-slate-950/40 border border-white/5 text-slate-200 rounded-tl-none'
                    }`}>
                      {msg.text}
                    </div>
                    <span className="text-[9px] text-slate-500 font-semibold mt-1 px-1">{msg.time || msg.author}</span>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Форма ответа */}
            <form onSubmit={handleSendMessage} className="pt-3 border-t border-white/5 flex items-center gap-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Напишите ответ покупателю..."
                className="flex-grow bg-slate-950/40 border border-white/5 rounded-xl py-2.5 px-4 text-xs text-white focus:outline-none focus:border-brand-cyan/40"
                disabled={sendingReply}
                required
              />
              <button
                type="submit"
                disabled={sendingReply || !replyText.trim()}
                className="p-2.5 bg-brand-cyan hover:bg-brand-cyan/90 text-slate-950 rounded-xl transition-all disabled:opacity-50 shrink-0"
              >
                {sendingReply ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 fill-current" />
                )}
              </button>
            </form>
          </div>
        ) : (
          <div className="h-[540px] flex flex-col items-center justify-center text-center text-slate-400 gap-3 relative z-10">
            <MessageSquare className="w-10 h-10 text-slate-600 animate-pulse" />
            <div>
              <h3 className="font-bold text-slate-300 text-sm">Выберите диалог из списка</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">Вы сможете мгновенно отвечать покупателям. При вашем ответе автоответчик засыпает на 20 минут.</p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
