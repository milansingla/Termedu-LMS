import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';

const WHATSAPP = 'https://wa.link/wd50xe';

const FEATURES = [
  {
    icon: 'school',
    title: 'Expert-Led Courses',
    desc: 'Learn from experienced educators and industry professionals who bring real-world knowledge to every lesson.',
  },
  {
    icon: 'psychology',
    title: 'AI-Powered Evaluation',
    desc: 'Our TEET entrance exam uses Google Gemini AI to assess your entrepreneurial aptitude fairly and intelligently.',
  },
  {
    icon: 'videocam',
    title: 'Live Video Classes',
    desc: 'Join interactive live sessions with lecturers and fellow students in real time using our integrated video classroom.',
  },
  {
    icon: 'workspace_premium',
    title: 'Structured Learning Plans',
    desc: 'Progress through Starter, Growth, and Premium plans — each unlocking deeper knowledge and more resources.',
  },
  {
    icon: 'task_alt',
    title: 'Projects & Assignments',
    desc: 'Apply what you learn with real-world projects and assignments that build a practical entrepreneurial skill set.',
  },
  {
    icon: 'download_for_offline',
    title: 'Offline Materials',
    desc: 'Download course materials and references to study at your own pace, even without an internet connection.',
  },
];

const PLANS = [
  {
    name: 'Starter',
    color: '#006a6a',
    bg: '#e0f5f5',
    desc: 'Perfect for beginners who want to explore the world of entrepreneurship and business fundamentals.',
  },
  {
    name: 'Growth',
    color: '#4400a8',
    bg: '#e9ddff',
    desc: 'For learners ready to dive deeper into strategy, marketing, and building their first business model.',
  },
  {
    name: 'Premium',
    color: '#7c2d12',
    bg: '#fce8dc',
    desc: 'Unlock everything — advanced courses, live mentoring sessions, and priority support from our team.',
  },
];

export default function AboutUs() {
  const navigate = useNavigate();
  usePageMeta("About T.E.R.M. Edu — India's #1 Entrepreneurship LMS", "Learn about T.E.R.M. Edu — our mission to make entrepreneurship education accessible to every aspiring founder in India.", '/about');
  return (
    <div className="min-h-screen bg-[#fef7ff]">
      <header className="sticky top-0 z-50 bg-[#fef7ff]/95 backdrop-blur border-b border-[#e7e0ed]">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate(-1)} aria-label="Go back"
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#f3ebf9] transition-colors">
            <span className="material-symbols-outlined text-[#4400a8] text-xl">arrow_back</span>
          </button>
          <p className="font-semibold text-[#1c1b1f] text-base">About Us</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4">
        <section className="py-14 text-center">
          <div className="inline-flex items-center gap-2 bg-[#e9ddff] text-[#4400a8] text-xs font-semibold px-4 py-1.5 rounded-full mb-5">
            <span className="material-symbols-outlined text-sm">rocket_launch</span>
            Entrepreneurship Education Reimagined
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1c1b1f] mb-4 leading-tight">
            Building the Next Generation<br />of <span className="text-[#4400a8]">Entrepreneurs</span>
          </h1>
          <p className="text-sm sm:text-base text-[#49454f] max-w-2xl mx-auto leading-relaxed">
            T.E.R.M. Edu (Training in Entrepreneurship, Research &amp; Management) is a modern Learning
            Management System built to make high-quality entrepreneurship education accessible, practical,
            and transformative for every student.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
            <a href="/login"
              className="px-6 py-3 rounded-xl bg-[#4400a8] text-white font-semibold text-sm hover:bg-[#5d21d0] transition-colors">
              Get Started Free
            </a>
            <a href={WHATSAPP} target="_blank" rel="noopener noreferrer"
              className="px-6 py-3 rounded-xl border border-[#cac4d0] text-[#1c1b1f] font-semibold text-sm hover:bg-[#f3ebf9] transition-colors">
              Talk to an Advisor
            </a>
          </div>
        </section>

        <section className="py-10">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            {[
              { label: 'Students', value: '500+' },
              { label: 'Courses', value: '20+' },
              { label: 'Live Sessions', value: 'Weekly' },
              { label: 'Support', value: '24/7' },
            ].map(s => (
              <div key={s.label} className="bg-white border border-[#e7e0ed] rounded-2xl p-5">
                <p className="text-2xl font-extrabold text-[#4400a8]">{s.value}</p>
                <p className="text-xs text-[#49454f] mt-1 font-medium">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-10">
          <h2 className="text-xl font-bold text-[#1c1b1f] mb-2 text-center">Our Mission</h2>
          <p className="text-sm text-[#49454f] text-center max-w-2xl mx-auto mb-8 leading-relaxed">
            We believe entrepreneurship is a skill that can be taught, practised, and mastered. Our mission
            is to empower students from all backgrounds with the knowledge, tools, and community they need
            to turn their ideas into reality.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {FEATURES.map(f => (
              <div key={f.title} className="bg-white border border-[#e7e0ed] rounded-2xl p-5 hover:shadow-md transition-shadow">
                <div className="w-10 h-10 rounded-xl bg-[#e9ddff] flex items-center justify-center mb-3">
                  <span className="material-symbols-outlined text-[#4400a8] text-xl">{f.icon}</span>
                </div>
                <h3 className="text-sm font-bold text-[#1c1b1f] mb-1">{f.title}</h3>
                <p className="text-xs text-[#49454f] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-10">
          <h2 className="text-xl font-bold text-[#1c1b1f] mb-2 text-center">Learning Plans</h2>
          <p className="text-sm text-[#49454f] text-center max-w-xl mx-auto mb-8">
            Choose a plan that matches your pace and ambition. Every plan gives you access to expert content,
            live interaction, and a community of like-minded learners.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PLANS.map(p => (
              <div key={p.name} className="rounded-2xl border border-[#e7e0ed] bg-white overflow-hidden">
                <div className="h-2" style={{ background: p.color }} />
                <div className="p-5">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-3"
                    style={{ background: p.bg, color: p.color }}>
                    <span className="material-symbols-outlined text-sm">workspace_premium</span>
                    {p.name}
                  </div>
                  <p className="text-xs text-[#49454f] leading-relaxed">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="py-10">
          <div className="bg-[#4400a8] rounded-3xl p-8 text-center text-white">
            <span className="material-symbols-outlined text-4xl mb-3 block opacity-80">diversity_3</span>
            <h2 className="text-xl font-bold mb-3">Why T.E.R.M. Edu?</h2>
            <p className="text-sm opacity-90 max-w-xl mx-auto leading-relaxed mb-6">
              We're not just another online learning platform. We combine structured curriculum, AI-driven
              assessment, live mentorship, and a strong learner community — all designed specifically around
              entrepreneurship education for the Indian market and beyond.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left mt-4">
              {[
                { icon: 'verified', text: 'Verified curriculum built with industry experts' },
                { icon: 'groups', text: 'Active community of aspiring entrepreneurs' },
                { icon: 'support_agent', text: 'Dedicated support from our advisor team' },
              ].map(item => (
                <div key={item.icon} className="flex items-start gap-3 bg-white/10 rounded-xl p-4">
                  <span className="material-symbols-outlined text-xl flex-shrink-0 mt-0.5">{item.icon}</span>
                  <p className="text-xs leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-10 text-center">
          <h2 className="text-xl font-bold text-[#1c1b1f] mb-3">Ready to Start Your Journey?</h2>
          <p className="text-sm text-[#49454f] mb-6 max-w-md mx-auto">
            Join hundreds of students already building their entrepreneurial future with T.E.R.M. Edu.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="/login"
              className="px-8 py-3.5 rounded-xl bg-[#4400a8] text-white font-semibold text-sm hover:bg-[#5d21d0] transition-colors">
              Create Free Account
            </a>
            <a href="/contact"
              className="px-8 py-3.5 rounded-xl border border-[#cac4d0] text-[#1c1b1f] font-semibold text-sm hover:bg-[#f3ebf9] transition-colors">
              Contact Us
            </a>
            <a href="/pricing"
              className="px-8 py-3.5 rounded-xl border border-[#cac4d0] text-[#1c1b1f] font-semibold text-sm hover:bg-[#f3ebf9] transition-colors">
              View Pricing
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#e7e0ed] py-6 text-center text-xs text-[#49454f]">
        <p>© {new Date().getFullYear()} T.E.R.M. Edu. All rights reserved.</p>
        <div className="flex justify-center gap-4 mt-2">
          <a href="/privacy-policy" className="text-[#4400a8] hover:underline">Privacy Policy</a>
          <a href="/terms" className="text-[#4400a8] hover:underline">Terms &amp; Conditions</a>
          <a href="/contact" className="text-[#4400a8] hover:underline">Contact Us</a>
          <a href="/pricing" className="text-[#4400a8] hover:underline">Pricing</a>
        </div>
      </footer>
    </div>
  );
}
