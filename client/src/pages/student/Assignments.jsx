import { useState, useRef } from 'react';
import TopBar from '../../components/TopBar';
import BottomNav from '../../components/BottomNav';
import { useAssignments } from '../../context/AssignmentContext';
import { useApp } from '../../context/AppContext';

const PLAN_KEY_MAP = { starter: 'starter', growth: 'growth', premium: 'premium' };

const PLAN_COLORS = {
  starter: 'bg-slate-100 text-slate-700',
  growth: 'bg-purple-100 text-purple-700',
  premium: 'bg-pink-100 text-pink-700',
  all: 'bg-green-100 text-green-700',
  course: 'bg-blue-100 text-blue-700',
};

function formatDate(str) {
  try {
    return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return str; }
}

function isOverdue(dateStr) {
  return new Date(dateStr) < new Date();
}

function fileSizeLabel(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MAX_FILE_BYTES = 8 * 1024 * 1024;

export default function Assignments() {
  const { currentUser, currentPlan } = useApp();
  const { assignments, getAssignmentsForPlan, getSubmission, submitAssignment } = useAssignments();

  const [activeTab, setActiveTab] = useState('pending');
  const [uploadModal, setUploadModal] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null);
  const [viewModal, setViewModal] = useState(null);
  const fileInputRef = useRef(null);

  const showToast = (msg, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  const enrolledPlanKey = currentPlan && currentPlan !== 'none' ? currentPlan : null;
  const myPlanKeys = enrolledPlanKey ? [enrolledPlanKey] : [];
  const visibleAssignments = myPlanKeys.length > 0 ? getAssignmentsForPlan(myPlanKeys) : assignments;

  const enriched = visibleAssignments.map(a => ({
    ...a,
    submission: getSubmission(a.id, currentUser?.id),
  }));

  const pending = enriched.filter(a => !a.submission);
  const submitted = enriched.filter(a => !!a.submission);

  const openUpload = (assignment) => {
    setUploadModal(assignment);
    setSelectedFile(null);
    setFileError('');
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileError(`File too large. Max size is 8 MB. Your file is ${fileSizeLabel(file.size)}.`);
      setSelectedFile(null);
      return;
    }
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowed.includes(file.type)) {
      setFileError('Only PDF, JPG, PNG, DOC, or DOCX files are allowed.');
      setSelectedFile(null);
      return;
    }
    setFileError('');
    setSelectedFile(file);
  };

  const handleSubmit = () => {
    if (!selectedFile || !uploadModal) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        await submitAssignment({
          assignmentId: uploadModal.id,
          studentId: currentUser.id,
          studentName: currentUser.name,
          studentEmail: currentUser.email,
          fileName: selectedFile.name,
          fileType: selectedFile.type,
          fileData: ev.target.result,
          fileSize: selectedFile.size,
        });
        setUploading(false);
        setUploadModal(null);
        setSelectedFile(null);
        showToast('Assignment submitted successfully!');
      } catch {
        setUploading(false);
        setFileError('Failed to submit. Please try again.');
      }
    };
    reader.onerror = () => { setUploading(false); setFileError('Failed to read file. Please try again.'); };
    reader.readAsDataURL(selectedFile);
  };

  const displayList = activeTab === 'pending' ? pending : submitted;

  return (
    <div className="bg-background min-h-screen pb-32 md:pb-10 text-on-surface md:ml-64">
      <TopBar showBack title="Assignments" showBrand={false} />

      <main className="pt-24 pb-32 px-4 max-w-2xl mx-auto space-y-5">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Pending', value: pending.length, icon: 'pending_actions', color: 'text-orange-500 bg-orange-50' },
            { label: 'Submitted', value: submitted.length, icon: 'task_alt', color: 'text-secondary bg-secondary-container/20' },
            { label: 'Graded', value: submitted.filter(a => a.submission?.marks != null).length, icon: 'grade', color: 'text-primary bg-primary-fixed/50' },
          ].map(({ label, value, icon, color }) => (
            <div key={label} className="bg-surface-container-lowest p-4 rounded-2xl text-center shadow-sm border border-outline-variant/10">
              <div className={`w-10 h-10 rounded-full ${color} flex items-center justify-center mx-auto mb-2`}>
                <span className="material-symbols-outlined text-sm">{icon}</span>
              </div>
              <p className="text-2xl font-black font-headline">{value}</p>
              <p className="text-xs text-on-surface-variant font-medium mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        <div className="flex gap-2 bg-surface-container p-1 rounded-xl">
          {['pending', 'submitted'].map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${activeTab === t ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant'}`}>
              {t.charAt(0).toUpperCase() + t.slice(1)} ({t === 'pending' ? pending.length : submitted.length})
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {displayList.length === 0 && (
            <div className="bg-surface-container-lowest rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant/30">
                {activeTab === 'pending' ? 'assignment_turned_in' : 'inbox'}
              </span>
              <p className="font-semibold text-on-surface-variant text-sm">
                {activeTab === 'pending' ? 'All caught up! No pending assignments.' : 'No submissions yet.'}
              </p>
            </div>
          )}
          {displayList.map(a => {
            const sub = a.submission;
            const overdue = !sub && isOverdue(a.dueDate);
            return (
              <div key={a.id} className="bg-surface-container-lowest rounded-2xl border border-outline-variant/10 shadow-sm overflow-hidden">
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${PLAN_COLORS[a.planKey] || 'bg-gray-100 text-gray-600'}`}>
                          {a.planKey === 'all' ? 'All Plans' : a.planKey === 'course' ? (a.courseTitle || 'Course') : `${a.planKey.charAt(0).toUpperCase() + a.planKey.slice(1)} Plan`}
                        </span>
                      </div>
                      <h3 className="font-bold text-sm leading-snug">{a.title}</h3>
                      {a.description && <p className="text-xs text-on-surface-variant mt-1 leading-relaxed line-clamp-2">{a.description}</p>}
                    </div>
                    <span className={`flex-shrink-0 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      sub
                        ? sub.marks != null ? 'bg-secondary/10 text-secondary' : 'bg-primary-fixed text-primary'
                        : overdue ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'
                    }`}>
                      {sub ? (sub.marks != null ? 'Graded' : 'Submitted') : (overdue ? 'Overdue' : 'Pending')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-on-surface-variant">
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">calendar_today</span>
                      Due: {formatDate(a.dueDate)}
                    </div>
                    <div className="flex items-center gap-1 font-medium">
                      <span className="material-symbols-outlined text-sm">grade</span>
                      {a.totalMarks} marks
                    </div>
                  </div>

                  {sub && (
                    <div className="bg-surface-container rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                          {sub.fileType?.includes('pdf') ? 'picture_as_pdf' : sub.fileType?.includes('image') ? 'image' : 'description'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{sub.fileName}</p>
                          <p className="text-[10px] text-on-surface-variant">{fileSizeLabel(sub.fileSize)} · Submitted {formatDate(sub.submittedAt)}</p>
                        </div>
                        <button onClick={() => setViewModal(sub)} className="text-xs text-primary font-bold flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">visibility</span>
                          View
                        </button>
                      </div>
                      {sub.marks != null && (
                        <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20">
                          <div className="flex items-center gap-1.5 text-secondary font-bold text-sm">
                            <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>grade</span>
                            {sub.marks} / {a.totalMarks}
                          </div>
                          {sub.feedback && <p className="text-xs text-on-surface-variant italic line-clamp-1">"{sub.feedback}"</p>}
                        </div>
                      )}
                      {sub.marks == null && (
                        <p className="text-[10px] text-on-surface-variant italic">Awaiting review from instructor…</p>
                      )}
                    </div>
                  )}

                  {!sub && (
                    <button onClick={() => openUpload(a)}
                      className="w-full py-3 rounded-xl signature-gradient text-white font-bold text-sm transition-all active:scale-[0.98]">
                      Submit Assignment
                    </button>
                  )}
                  {sub && sub.marks == null && !sub.feedback && (
                    <button onClick={() => openUpload(a)}
                      className="w-full py-2.5 rounded-xl border border-primary text-primary font-bold text-xs transition-all active:scale-[0.98]">
                      Re-submit
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <BottomNav />

      {uploadModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-headline font-bold text-xl">Submit Assignment</h3>
              <button onClick={() => setUploadModal(null)} className="p-2 rounded-full hover:bg-slate-100">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="bg-surface-container rounded-2xl p-4">
              <p className="font-semibold text-sm">{uploadModal.title}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">Due {formatDate(uploadModal.dueDate)} · {uploadModal.totalMarks} marks</p>
              {uploadModal.description && <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">{uploadModal.description}</p>}
            </div>

            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={handleFileChange} className="hidden" />

            <button onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-outline-variant rounded-2xl p-6 flex flex-col items-center gap-3 bg-surface-container-low hover:border-primary transition-colors text-center">
              {selectedFile ? (
                <>
                  <span className="material-symbols-outlined text-3xl text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                    {selectedFile.type.includes('pdf') ? 'picture_as_pdf' : selectedFile.type.includes('image') ? 'image' : 'description'}
                  </span>
                  <div>
                    <p className="font-bold text-sm text-on-surface truncate max-w-[220px]">{selectedFile.name}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{fileSizeLabel(selectedFile.size)} · Tap to change</p>
                  </div>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-4xl text-outline">cloud_upload</span>
                  <div>
                    <p className="font-bold text-sm">Tap to upload file</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">PDF, DOC, JPG, PNG (max 8 MB)</p>
                  </div>
                </>
              )}
            </button>

            {fileError && (
              <div className="bg-red-50 text-red-600 text-xs rounded-xl p-3 flex items-start gap-2">
                <span className="material-symbols-outlined text-base flex-shrink-0">error</span>
                {fileError}
              </div>
            )}

            <button onClick={handleSubmit} disabled={!selectedFile || uploading}
              className="w-full py-4 rounded-2xl signature-gradient text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2">
              {uploading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Uploading…
                </>
              ) : 'Submit Assignment'}
            </button>
          </div>
        </div>
      )}

      {viewModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex flex-col">
          <div className="flex items-center justify-between p-4 bg-white/10 text-white">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 1" }}>
                {viewModal.fileType?.includes('pdf') ? 'picture_as_pdf' : viewModal.fileType?.includes('image') ? 'image' : 'description'}
              </span>
              <div>
                <p className="font-bold text-sm truncate max-w-[200px]">{viewModal.fileName}</p>
                <p className="text-xs text-white/60">{fileSizeLabel(viewModal.fileSize)}</p>
              </div>
            </div>
            <button onClick={() => setViewModal(null)} className="p-2 rounded-full bg-white/10 hover:bg-white/20">
              <span className="material-symbols-outlined text-white">close</span>
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            {viewModal.fileType?.includes('image') ? (
              <div className="w-full h-full flex items-center justify-center p-4">
                <img src={viewModal.fileData} alt={viewModal.fileName} className="max-w-full max-h-full object-contain rounded-xl" />
              </div>
            ) : viewModal.fileType?.includes('pdf') ? (
              <iframe src={viewModal.fileData} title={viewModal.fileName} className="w-full h-full bg-white" />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-white">
                <span className="material-symbols-outlined text-6xl opacity-50">description</span>
                <p className="text-sm opacity-70">Preview not available for this file type.</p>
                <a href={viewModal.fileData} download={viewModal.fileName}
                  className="px-6 py-3 rounded-xl signature-gradient text-white font-bold text-sm">
                  Download File
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-28 left-1/2 -translate-x-1/2 text-sm px-5 py-2.5 rounded-full shadow-xl z-50 font-semibold whitespace-nowrap ${toast.ok ? 'bg-on-surface text-surface' : 'bg-red-500 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
