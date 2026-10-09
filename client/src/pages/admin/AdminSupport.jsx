import { useState, useEffect, useCallback, useRef } from 'react';
import AdminLayout from './AdminLayout';
import { useApp } from '../../context/AppContext';
import SideNav from '../../components/SideNav';
import { apiGet, apiPut, apiPost } from '../../lib/api';

export default function AdminSupport() {
  const { currentUser } = useApp();
  const [tickets, setTicketsState] = useState([]);
  const [activeTicket, setActiveTicket] = useState(null);
  const [filter, setFilter] = useState('all');
  const [reply, setReply] = useState('');
  const bottomRef = useRef(null);

  const loadTickets = useCallback(async () => {
    try {
      const data = await apiGet('/api/data/tickets');
      if (Array.isArray(data)) {
        const sorted = [...data].sort((a, b) => {
          const ta = a.lastMsgAt ? new Date(a.lastMsgAt).getTime() : 0;
          const tb = b.lastMsgAt ? new Date(b.lastMsgAt).getTime() : 0;
          return tb - ta;
        });
        setTicketsState(sorted);
        setActiveTicket(prev => {
          if (!prev) return prev;
          const refreshed = sorted.find(t => t.id === prev.id);
          return refreshed || prev;
        });
      }
    } catch {}
  }, []);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  useEffect(() => {
    const interval = setInterval(loadTickets, 3000);
    return () => clearInterval(interval);
  }, [loadTickets]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeTicket]);

  const setTickets = useCallback((updater) => {
    setTicketsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const sorted = [...next].sort((a, b) => {
        const ta = a.lastMsgAt ? new Date(a.lastMsgAt).getTime() : 0;
        const tb = b.lastMsgAt ? new Date(b.lastMsgAt).getTime() : 0;
        return tb - ta;
      });
      apiPut('/api/data/tickets', sorted).catch(() => {});
      return sorted;
    });
  }, []);

  const openTicket = useCallback((t) => {
    if (t.unread) {
      setTickets(prev => prev.map(tk => tk.id === t.id ? { ...tk, unread: false } : tk));
    }
    setActiveTicket(t);
  }, [setTickets]);

  const filtered = [...tickets]
    .filter(t => filter === 'all' || t.status === filter);

  const sendReply = () => {
    if (!reply.trim() || !activeTicket) return;
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const replyText = reply.trim();
    const msg = { from: 'support', text: replyText, time: now, replyBy: currentUser?.name || 'Admin' };
    setTickets(prev => prev.map(t =>
      t.id === activeTicket.id
        ? { ...t, messages: [...t.messages, msg], lastMsg: now, lastMsgAt: new Date().toISOString(), unread: false }
        : t
    ));
    setActiveTicket(prev => ({ ...prev, messages: [...prev.messages, msg], lastMsg: now }));
    setReply('');

    // Smart FCM push: fires only if the student is NOT actively on the app
    if (activeTicket.userId) {
      apiPost('/api/support/notify-reply', {
        userId:    activeTicket.userId,
        ticketId:  activeTicket.id,
        replyText,
      }).catch(() => {}); // fire-and-forget
    }
  };

  const resolveTicket = (id) => {
    setTickets(prev => prev.map(t => t.id === id ? { ...t, status: 'resolved' } : t));
    setActiveTicket(prev => prev?.id === id ? { ...prev, status: 'resolved' } : prev);
  };

  const reopenTicket = (id) => {
    setTickets(prev => prev.map(t => t.id === id ? { ...t, status: 'open' } : t));
    setActiveTicket(prev => prev?.id === id ? { ...prev, status: 'open' } : prev);
  };

  const priorityColor = (p) =>
    p === 'high' ? 'bg-red-100 text-red-600' : p === 'medium' ? 'bg-orange-100 text-orange-600' : 'bg-green-50 text-green-600';

  const isUnread = (t) => t.unread === true && t.messages?.length > 0 && t.messages[t.messages.length - 1]?.from === 'user';

  if (activeTicket) {
    const ticket = tickets.find(t => t.id === activeTicket.id) || activeTicket;
    return (
      <>
        <SideNav />
        <div className="bg-background h-[100dvh] flex flex-col text-on-surface md:ml-64">

          {/* ── Header ──────────────────────────────────────────────── */}
          <header className="flex-shrink-0 bg-surface-container-lowest/90 backdrop-blur-xl border-b border-outline-variant/10 shadow-sm flex items-center gap-3 px-4 py-3 z-10">
            <button onClick={() => setActiveTicket(null)} className="p-2 rounded-full hover:bg-surface-container transition-colors flex-shrink-0">
              <span className="material-symbols-outlined text-[22px]">arrow_back</span>
            </button>
            <div className="w-9 h-9 rounded-full signature-gradient flex items-center justify-center flex-shrink-0 shadow-sm">
              <span className="text-white font-bold text-sm">{(ticket.user || '?')[0]}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-on-surface">{ticket.user}</p>
              <p className="text-xs text-on-surface-variant truncate">{ticket.email}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${ticket.status === 'open' ? 'bg-green-50 text-green-600' : 'bg-surface-container text-on-surface-variant'}`}>
                {ticket.status}
              </span>
              {ticket.status === 'open'
                ? <button onClick={() => resolveTicket(ticket.id)} className="px-3 py-1.5 rounded-full bg-secondary/10 text-secondary text-xs font-bold hover:bg-secondary/20 transition-colors">Resolve</button>
                : <button onClick={() => reopenTicket(ticket.id)} className="px-3 py-1.5 rounded-full bg-primary-fixed text-primary text-xs font-bold hover:bg-primary-fixed/70 transition-colors">Reopen</button>
              }
            </div>
          </header>

          {/* ── Messages ────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-4 py-4 md:px-8">
            <div className="max-w-2xl mx-auto space-y-3">
              <div className="text-center py-1">
                <span className="text-xs text-on-surface-variant bg-surface-container px-3 py-1.5 rounded-full font-medium">{ticket.subject}</span>
              </div>

              {ticket.messages.map((m, i) => {
                const isSupport = m.from === 'support';
                return (
                  <div key={i} className={`flex items-end gap-2.5 ${isSupport ? 'flex-row-reverse' : 'flex-row'}`}>
                    {isSupport && (
                      <div className="w-8 h-8 rounded-full signature-gradient flex items-center justify-center flex-shrink-0 mb-1 shadow-sm">
                        <span className="material-symbols-outlined text-white text-xs" style={{ fontVariationSettings: "'FILL' 1" }}>support_agent</span>
                      </div>
                    )}
                    {!isSupport && (
                      <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0 mb-1">
                        <span className="text-on-surface-variant font-bold text-xs">{(ticket.user || '?')[0]}</span>
                      </div>
                    )}
                    <div className={`flex flex-col gap-1 max-w-[72%] ${isSupport ? 'items-end' : 'items-start'}`}>
                      {isSupport && m.replyBy && (
                        <p className="text-[10px] text-on-surface-variant font-medium px-1">{m.replyBy}</p>
                      )}
                      <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                        isSupport
                          ? 'signature-gradient text-white rounded-br-sm'
                          : 'bg-surface-container-lowest border border-outline-variant/10 text-on-surface rounded-bl-sm'
                      }`}>
                        {m.text}
                      </div>
                      <span className="text-[10px] text-on-surface-variant px-1">{m.time}</span>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* ── Reply input ─────────────────────────────────────────── */}
          <div className="flex-shrink-0 bg-surface-container-lowest/90 backdrop-blur-xl border-t border-outline-variant/10 px-4 py-3 md:px-8">
            <div className="max-w-2xl mx-auto flex gap-3 items-center">
              <input
                value={reply}
                onChange={e => setReply(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendReply()}
                placeholder={ticket.status === 'resolved' ? 'Ticket resolved — reopen to reply' : 'Type your reply...'}
                disabled={ticket.status === 'resolved'}
                className="flex-1 px-4 py-2.5 bg-surface-container rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm disabled:opacity-50 h-11"
              />
              <button
                onClick={sendReply}
                disabled={!reply.trim() || ticket.status === 'resolved'}
                className="w-11 h-11 rounded-2xl signature-gradient text-white flex items-center justify-center disabled:opacity-40 flex-shrink-0 shadow-sm active:scale-95 transition-transform"
              >
                <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>
              </button>
            </div>
          </div>

        </div>
      </>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-5 pt-2">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-primary font-semibold text-xs uppercase tracking-widest font-headline">Admin Panel</p>
            <h1 className="text-2xl font-extrabold font-headline">Support</h1>
          </div>
          <span className="flex items-center gap-1 text-xs font-bold text-primary bg-primary-fixed px-3 py-1 rounded-full">
            {tickets.filter(t => t.status === 'open').length} Open
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total',    value: tickets.length,                                color: 'text-on-surface' },
            { label: 'Open',     value: tickets.filter(t => t.status === 'open').length,     color: 'text-orange-600' },
            { label: 'Resolved', value: tickets.filter(t => t.status === 'resolved').length, color: 'text-green-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-surface-container-lowest p-4 rounded-2xl shadow-sm text-center">
              <p className={`text-2xl font-bold font-headline ${color}`}>{value}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          {['all', 'open', 'resolved'].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-4 py-1.5 rounded-full text-sm font-semibold capitalize transition-all ${filter === f ? 'signature-gradient text-white shadow' : 'bg-surface-container text-on-surface-variant'}`}>{f}</button>
          ))}
        </div>

        <div className="space-y-3">
          {filtered.map(t => {
            const unread = isUnread(t);
            const lastMessage = t.messages?.[t.messages.length - 1];
            return (
              <button key={t.id} onClick={() => openTicket(t)} className={`w-full text-left p-4 rounded-2xl border shadow-sm hover:bg-surface-container transition-colors ${unread ? 'bg-primary-fixed/30 border-primary/20' : 'bg-surface-container-lowest border-outline-variant/10'}`}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full signature-gradient flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold">{(t.user || '?')[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm ${unread ? 'font-extrabold' : 'font-bold'}`}>{t.user}</p>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[10px] text-on-surface-variant">{t.lastMsg}</span>
                        {unread && <span className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0" />}
                      </div>
                    </div>
                    <p className={`text-xs mt-0.5 truncate ${unread ? 'font-semibold text-on-surface' : 'font-semibold text-on-surface'}`}>{t.subject}</p>
                    <p className={`text-xs truncate mt-0.5 ${unread ? 'text-on-surface font-medium' : 'text-on-surface-variant'}`}>{lastMessage?.text}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${t.status === 'open' ? 'bg-green-50 text-green-600' : 'bg-surface-container text-on-surface-variant'}`}>{t.status}</span>
                      {t.priority && <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${priorityColor(t.priority)}`}>{t.priority} priority</span>}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-16 text-on-surface-variant">
              <span className="material-symbols-outlined text-4xl mb-2 block">support_agent</span>
              <p className="text-sm font-medium">No tickets yet</p>
              <p className="text-xs mt-1">Student messages will appear here</p>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
