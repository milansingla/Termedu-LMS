import { useState } from 'react';
import LecturerLayout from './LecturerLayout';
import { useProjects } from '../../context/ProjectContext';
import { useApp } from '../../context/AppContext';

const PLAN_OPTIONS = [
  { key: 'starter', label: 'Starter',  color: 'bg-blue-100 text-blue-700' },
  { key: 'growth',  label: 'Growth',   color: 'bg-violet-100 text-violet-700' },
  { key: 'premium', label: 'Premium',  color: 'bg-amber-100 text-amber-700' },
];

function formatDate(str) {
  try { return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return str; }
}

export default function LecturerStudents() {
  const { appUsers } = useApp();
  const { submissions } = useProjects();

  const [search, setSearch] = useState('');

  const allStudents = (appUsers || []).filter(u => u.role === 'student');
  const pendingReviews = (submissions || []).filter(s => s.marks == null).length;

  const filtered = search.trim()
    ? allStudents.filter(s =>
        s.name?.toLowerCase().includes(search.toLowerCase()) ||
        s.email?.toLowerCase().includes(search.toLowerCase())
      )
    : allStudents;

  return (
    <LecturerLayout title="Students">
      <div className="space-y-5">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Students',    value: allStudents.length,    icon: 'group',       color: 'text-primary',   bg: 'bg-primary-fixed' },
            { label: 'Submissions', value: submissions.length,    icon: 'upload_file', color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Pending',     value: pendingReviews,        icon: 'rate_review', color: 'text-orange-500', bg: 'bg-orange-50' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} p-3 rounded-2xl text-center shadow-sm`}>
              <span className={`material-symbols-outlined text-xl ${s.color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{s.icon}</span>
              <p className={`text-xl font-bold font-headline mt-0.5 ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-on-surface-variant">{s.label}</p>
            </div>
          ))}
        </div>

        {pendingReviews > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-orange-500">pending_actions</span>
            <p className="text-sm font-semibold text-orange-700">
              {pendingReviews} submission{pendingReviews !== 1 ? 's' : ''} awaiting grading — go to Projects to grade them
            </p>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search students…"
            className="w-full pl-10 pr-4 py-3 bg-surface-container rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 border border-outline-variant/20"
          />
        </div>

        {/* Student list */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 block">group</span>
              <p className="text-sm font-semibold text-on-surface-variant">
                {search ? 'No students match your search' : 'No students enrolled yet'}
              </p>
            </div>
          ) : filtered.map(student => {
            const studentSubs = (submissions || []).filter(s =>
              s.studentId === student.id || s.studentId === student.email
            );
            const planOpt = PLAN_OPTIONS.find(p => p.key === student.plan?.toLowerCase());
            const gradedSubs = studentSubs.filter(s => s.marks != null);

            return (
              <div key={student.id} className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/10 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 border-2 border-primary/10">
                    {student.avatar
                      ? <img src={student.avatar} alt={student.name} className="w-full h-full object-cover" />
                      : <div className="w-full h-full bg-primary-container flex items-center justify-center">
                          <span className="material-symbols-outlined text-primary">person</span>
                        </div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm">{student.name}</p>
                    <p className="text-xs text-on-surface-variant truncate">{student.email}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="bg-green-50 text-green-600 text-[10px] font-bold px-2 py-0.5 rounded-full">Active</span>
                      {planOpt && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${planOpt.color}`}>
                          {planOpt.label}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-extrabold text-primary">{studentSubs.length}</p>
                    <p className="text-[10px] text-on-surface-variant">submissions</p>
                    {gradedSubs.length > 0 && (
                      <p className="text-[10px] text-emerald-600 font-semibold">{gradedSubs.length} graded</p>
                    )}
                    {student.joinedAt && (
                      <p className="text-[10px] text-on-surface-variant/60 mt-0.5">{formatDate(student.joinedAt)}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </LecturerLayout>
  );
}
