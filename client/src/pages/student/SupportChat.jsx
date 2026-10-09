import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import SideNav from '../../components/SideNav';
import { apiGet, apiPut, apiPost } from '../../lib/api';

export default function SupportChat() {
  const navigate = useNavigate();
  const { currentUser } = useApp();
  const [messages, setMessages] = useState([]);
  const [ticketId, setTicketId] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const bottomRef = useRef(null);

  const loadTicket = useCallback(async (silent = false) => {
    if (!currentUser) return;
    try {
      const tickets = await apiGet('/api/data/tickets');
      const mine = Array.isArray(tickets)
        ? tickets.find(t => t.email === currentUser.email || t.userId === currentUser.id)
        : null;
      if (mine) {
        setTicketId(mine.id);
        setMessages(mine.messages.map((m, i) => ({ ...m, id: i })));
      }
    } catch {}
    if (!silent) setLoading(false);
  }, [currentUser]);

  useEffect(() => { loadTicket(); }, [loadTicket]);

  useEffect(() => {
    if (!ticketId) return;
    const interval = setInterval(() => loadTicket(true), 3000);
    return () => clearInterval(interval);
  }, [ticketId, loadTicket]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, aiTyping]);

  const sendAiReply = useCallback(async (currentTicketId, msgText, currentMessages) => {
    setAiTyping(true);
    await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));
    try {
      const { reply } = await apiPost('/api/support/ai-reply', {
        message: msgText,
        history: currentMessages.slice(-10),
      });
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const aiMsg = { from: 'support', text: reply, time: now, replyBy: 'TERM Edu AI Support' };
      const freshTickets = await apiGet('/api/data/tickets');
      const allTickets = Array.isArray(freshTickets) ? freshTickets : [];
      const updated = allTickets.map(t =>
        String(t.id) === String(currentTicketId)
          ? { ...t, messages: [...t.messages, aiMsg], lastMsg: now, lastMsgAt: new Date().toISOString(), unread: false }
          : t
      );
      await apiPut('/api/data/tickets', updated);
      setMessages(prev => [...prev, { ...aiMsg, id: prev.length }]);
    } catch {}
    setAiTyping(false);
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || sending || !currentUser) return;
    setSending(true);
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msg = { from: 'user', text: input.trim(), time: now };
    const msgText = input.trim();
    setInput('');

    try {
      const tickets = await apiGet('/api/data/tickets');
      const allTickets = Array.isArray(tickets) ? tickets : [];

      if (ticketId) {
        const updated = allTickets.map(t =>
          String(t.id) === String(ticketId)
            ? { ...t, messages: [...t.messages, msg], lastMsg: now, lastMsgAt: new Date().toISOString(), status: 'open', unread: true }
            : t
        );
        await apiPut('/api/data/tickets', updated);
        setMessages(prev => [...prev, { ...msg, id: prev.length }]);
        const freshMsgs = [...messages, { ...msg, id: messages.length }];
        sendAiReply(ticketId, msgText, freshMsgs);
      } else {
        const newTicket = {
          id: Date.now(),
          userId: currentUser.id,
          user: currentUser.name,
          email: currentUser.email,
          subject: msgText.length > 40 ? msgText.slice(0, 40) + '...' : msgText,
          status: 'open',
          priority: 'medium',
          lastMsg: now,
          lastMsgAt: new Date().toISOString(),
          unread: true,
          messages: [msg],
        };
        await apiPut('/api/data/tickets', [...allTickets, newTicket]);
        setTicketId(newTicket.id);
        setMessages([{ ...msg, id: 0 }]);
        sendAiReply(newTicket.id, msgText, [msg]);
      }
    } catch {}
    setSending(false);
  };

  if (loading) {
    return (
      <>
        <SideNav />
        <div className="bg-background h-[100dvh] flex items-center justify-center md:ml-64">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  return (
    <>
      <SideNav />
      <div className="bg-background h-[100dvh] flex flex-col text-on-surface md:ml-64">

        {/* ── Header ────────────────────────────────────────────────── */}
        <header className="flex-shrink-0 bg-surface-container-lowest/90 backdrop-blur-xl border-b border-outline-variant/10 shadow-sm flex items-center gap-4 px-5 py-3 z-10">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-surface-container transition-colors flex-shrink-0"
          >
            <span className="material-symbols-outlined text-[22px]">arrow_back</span>
          </button>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 rounded-full signature-gradient flex items-center justify-center">
                <span className="material-symbols-outlined text-white text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>support_agent</span>
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-400 border-2 border-white" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm text-on-surface">TERM Edu Support</p>
              <p className="text-xs text-green-500 font-medium">● Online</p>
            </div>
          </div>
        </header>

        {/* ── Messages ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 md:px-8">
          <div className="max-w-2xl mx-auto space-y-3">
            <div className="text-center py-2">
              <span className="bg-surface-container px-4 py-1.5 rounded-full text-xs text-on-surface-variant font-medium">Today</span>
            </div>

            {messages.length === 0 && (
              <div className="text-center py-14 space-y-3">
                <div className="w-16 h-16 rounded-full signature-gradient flex items-center justify-center mx-auto shadow-lg shadow-primary/20">
                  <span className="material-symbols-outlined text-white text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>support_agent</span>
                </div>
                <p className="font-bold text-on-surface">TERM Edu Support</p>
                <p className="text-sm text-on-surface-variant max-w-xs mx-auto">Send a message to start a conversation with our support team.</p>
              </div>
            )}

            {messages.map(msg => {
              const isUser = msg.from === 'user';
              return (
                <div key={msg.id} className={`flex items-end gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                  {/* Support avatar */}
                  {!isUser && (
                    <div className="w-8 h-8 rounded-full signature-gradient flex items-center justify-center flex-shrink-0 mb-1 shadow-sm">
                      <span className="material-symbols-outlined text-white text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>support_agent</span>
                    </div>
                  )}

                  <div className={`flex flex-col gap-1 max-w-[72%] ${isUser ? 'items-end' : 'items-start'}`}>
                    {!isUser && msg.replyBy && (
                      <p className="text-[10px] text-on-surface-variant font-medium px-1">{msg.replyBy}</p>
                    )}
                    <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      isUser
                        ? 'signature-gradient text-white rounded-br-sm shadow-sm'
                        : 'bg-surface-container-lowest border border-outline-variant/10 text-on-surface rounded-bl-sm shadow-sm'
                    }`}>
                      {msg.text}
                    </div>
                    <span className="text-[10px] text-on-surface-variant px-1">{msg.time}</span>
                  </div>
                </div>
              );
            })}

            {/* AI typing indicator */}
            {aiTyping && (
              <div className="flex items-end gap-2.5 flex-row">
                <div className="w-8 h-8 rounded-full signature-gradient flex items-center justify-center flex-shrink-0 mb-1 shadow-sm">
                  <span className="material-symbols-outlined text-white text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>smart_toy</span>
                </div>
                <div className="flex flex-col gap-1 items-start">
                  <p className="text-[10px] text-on-surface-variant font-medium px-1">TERM Edu AI Support</p>
                  <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-surface-container-lowest border border-outline-variant/10 shadow-sm flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-on-surface-variant/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-on-surface-variant/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-on-surface-variant/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* ── Input bar ─────────────────────────────────────────────── */}
        <div className="flex-shrink-0 bg-surface-container-lowest/90 backdrop-blur-xl border-t border-outline-variant/10 px-4 py-3 md:px-8">
          <div className="max-w-2xl mx-auto flex gap-3 items-end">
            <div className="flex-1 bg-surface-container rounded-2xl flex items-end px-4 py-2.5 min-h-[44px]">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }}}
                placeholder="Type a message..."
                rows={1}
                className="flex-1 bg-transparent resize-none focus:outline-none text-sm text-on-surface placeholder:text-on-surface-variant/50 max-h-24 leading-relaxed"
              />
            </div>
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all ${
                input.trim() && !sending
                  ? 'signature-gradient shadow-lg shadow-primary/25 active:scale-95'
                  : 'bg-surface-container'
              }`}
            >
              {sending
                ? <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                : <span className={`material-symbols-outlined text-[18px] ${input.trim() ? 'text-white' : 'text-on-surface-variant'}`} style={{ fontVariationSettings: "'FILL' 1" }}>send</span>
              }
            </button>
          </div>
        </div>

      </div>
    </>
  );
}
