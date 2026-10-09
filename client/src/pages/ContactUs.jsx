import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';

const EMAIL = 'contact@termedu.in';
const WHATSAPP = 'https://wa.link/wd50xe';

export default function ContactUs() {
  const navigate = useNavigate();
  usePageMeta("Contact Us — T.E.R.M. Edu", "Get in touch with T.E.R.M. Edu. Reach our team via email, WhatsApp, or Instagram for admissions, support, and enquiries.", '/contact');
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setError('Please fill in all required fields.');
      return;
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(form.email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    setStatus('loading');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }
      setStatus('success');
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch (err) {
      setError(err.message);
      setStatus('idle');
    }
  }

  return (
    <div className="min-h-screen bg-[#fef7ff]">
      <header className="sticky top-0 z-50 bg-[#fef7ff]/95 backdrop-blur border-b border-[#e7e0ed]">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate(-1)} aria-label="Go back"
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#f3ebf9] transition-colors">
            <span className="material-symbols-outlined text-[#4400a8] text-xl">arrow_back</span>
          </button>
          <p className="font-semibold text-[#1c1b1f] text-base">Contact Us</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8 text-center">
          <div className="w-16 h-16 rounded-full bg-[#e9ddff] flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-[#4400a8] text-3xl">support_agent</span>
          </div>
          <h1 className="text-2xl font-bold text-[#1c1b1f] mb-2">Get in Touch</h1>
          <p className="text-sm text-[#49454f] max-w-md mx-auto">
            Have a question or need help? We'd love to hear from you. Fill in the form below or reach out
            directly — we typically respond within 24 hours.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <a href={`mailto:${EMAIL}`}
            className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-white border border-[#e7e0ed] hover:border-[#4400a8] hover:shadow-sm transition-all text-center">
            <span className="material-symbols-outlined text-[#4400a8] text-2xl">mail</span>
            <span className="text-xs font-semibold text-[#1c1b1f]">Email Us</span>
            <span className="text-xs text-[#49454f] break-all">{EMAIL}</span>
          </a>
          <a href={WHATSAPP} target="_blank" rel="noopener noreferrer"
            className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-white border border-[#e7e0ed] hover:border-[#25d366] hover:shadow-sm transition-all text-center">
            <span className="material-symbols-outlined text-[#25d366] text-2xl">chat</span>
            <span className="text-xs font-semibold text-[#1c1b1f]">WhatsApp</span>
            <span className="text-xs text-[#49454f]">Chat with an advisor</span>
          </a>
          <div className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-white border border-[#e7e0ed] text-center">
            <span className="material-symbols-outlined text-[#4400a8] text-2xl">schedule</span>
            <span className="text-xs font-semibold text-[#1c1b1f]">Response Time</span>
            <span className="text-xs text-[#49454f]">Within 24 hours</span>
          </div>
        </div>

        {status === 'success' ? (
          <div className="bg-[#e6f9f0] border border-[#a3e6c8] rounded-2xl p-8 text-center">
            <span className="material-symbols-outlined text-[#006a4e] text-4xl mb-3 block">check_circle</span>
            <h2 className="text-lg font-bold text-[#006a4e] mb-2">Message Sent!</h2>
            <p className="text-sm text-[#1c1b1f]">Thank you for reaching out. We'll get back to you within 24 hours.</p>
            <button onClick={() => setStatus('idle')}
              className="mt-5 px-6 py-2.5 rounded-full bg-[#4400a8] text-white text-sm font-semibold hover:bg-[#5d21d0] transition-colors">
              Send Another Message
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white border border-[#e7e0ed] rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-bold text-[#1c1b1f] mb-1">Send us a message</h2>

            {error && (
              <div className="flex items-start gap-2 bg-[#fde8e8] border border-[#f5c6c6] rounded-xl px-4 py-3">
                <span className="material-symbols-outlined text-[#b91c1c] text-base flex-shrink-0 mt-0.5">error</span>
                <p className="text-[#b91c1c] text-xs">{error}</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="name" className="block text-xs font-semibold text-[#49454f] mb-1.5">
                  Full Name <span className="text-[#b91c1c]">*</span>
                </label>
                <input id="name" name="name" type="text" value={form.name} onChange={handleChange}
                  placeholder="Your name" maxLength={100} required
                  className="w-full px-4 py-3 rounded-xl border border-[#cac4d0] bg-[#fef7ff] text-sm text-[#1c1b1f] placeholder-[#9d9099] focus:outline-none focus:border-[#4400a8] focus:ring-1 focus:ring-[#4400a8] transition" />
              </div>
              <div>
                <label htmlFor="email" className="block text-xs font-semibold text-[#49454f] mb-1.5">
                  Email Address <span className="text-[#b91c1c]">*</span>
                </label>
                <input id="email" name="email" type="email" value={form.email} onChange={handleChange}
                  placeholder="you@example.com" maxLength={200} required
                  className="w-full px-4 py-3 rounded-xl border border-[#cac4d0] bg-[#fef7ff] text-sm text-[#1c1b1f] placeholder-[#9d9099] focus:outline-none focus:border-[#4400a8] focus:ring-1 focus:ring-[#4400a8] transition" />
              </div>
            </div>

            <div>
              <label htmlFor="subject" className="block text-xs font-semibold text-[#49454f] mb-1.5">
                Subject
              </label>
              <input id="subject" name="subject" type="text" value={form.subject} onChange={handleChange}
                placeholder="What is this about?" maxLength={200}
                className="w-full px-4 py-3 rounded-xl border border-[#cac4d0] bg-[#fef7ff] text-sm text-[#1c1b1f] placeholder-[#9d9099] focus:outline-none focus:border-[#4400a8] focus:ring-1 focus:ring-[#4400a8] transition" />
            </div>

            <div>
              <label htmlFor="message" className="block text-xs font-semibold text-[#49454f] mb-1.5">
                Message <span className="text-[#b91c1c]">*</span>
              </label>
              <textarea id="message" name="message" rows={5} value={form.message} onChange={handleChange}
                placeholder="Tell us how we can help you..." maxLength={2000} required
                className="w-full px-4 py-3 rounded-xl border border-[#cac4d0] bg-[#fef7ff] text-sm text-[#1c1b1f] placeholder-[#9d9099] focus:outline-none focus:border-[#4400a8] focus:ring-1 focus:ring-[#4400a8] transition resize-none" />
              <p className="text-right text-xs text-[#9d9099] mt-1">{form.message.length}/2000</p>
            </div>

            <button type="submit" disabled={status === 'loading'}
              className="w-full py-3.5 rounded-xl bg-[#4400a8] text-white font-semibold text-sm hover:bg-[#5d21d0] disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
              {status === 'loading' ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60" strokeDashoffset="20" />
                  </svg>
                  Sending…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-base">send</span>
                  Send Message
                </>
              )}
            </button>
          </form>
        )}
      </main>

      <footer className="border-t border-[#e7e0ed] py-6 text-center text-xs text-[#49454f] mt-8">
        <p>© {new Date().getFullYear()} T.E.R.M. Edu. All rights reserved.</p>
        <div className="flex justify-center gap-4 mt-2">
          <a href="/privacy-policy" className="text-[#4400a8] hover:underline">Privacy Policy</a>
          <a href="/terms" className="text-[#4400a8] hover:underline">Terms &amp; Conditions</a>
          <a href="/about" className="text-[#4400a8] hover:underline">About Us</a>
          <a href="/pricing" className="text-[#4400a8] hover:underline">Pricing</a>
        </div>
      </footer>
    </div>
  );
}
