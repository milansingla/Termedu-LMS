import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';

const LAST_UPDATED = 'March 29, 2026';
const COMPANY = 'T.E.R.M. Edu';
const EMAIL = 'contact@termedu.in';

function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-[#4400a8] mb-3 pb-2 border-b border-[#e7e0ed]">{title}</h2>
      <div className="space-y-3 text-[#1c1b1f] text-sm leading-relaxed">{children}</div>
    </section>
  );
}

export default function PrivacyPolicy() {
  const navigate = useNavigate();
  usePageMeta("Privacy Policy — T.E.R.M. Edu", "Read the T.E.R.M. Edu Privacy Policy — how we collect, use, and protect your personal data on our platform.", '/privacy-policy');
  return (
    <div className="min-h-screen bg-[#fef7ff]">
      <header className="sticky top-0 z-50 bg-[#fef7ff]/95 backdrop-blur border-b border-[#e7e0ed]">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate(-1)} aria-label="Go back"
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#f3ebf9] transition-colors">
            <span className="material-symbols-outlined text-[#4400a8] text-xl">arrow_back</span>
          </button>
          <p className="font-semibold text-[#1c1b1f] text-base">Privacy Policy</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1c1b1f] mb-1">Privacy Policy</h1>
          <p className="text-xs text-[#49454f]">Last updated: {LAST_UPDATED}</p>
          <p className="mt-4 text-sm text-[#1c1b1f] leading-relaxed">
            Welcome to {COMPANY}. Your privacy matters to us. This Privacy Policy explains how we collect,
            use, and protect your personal information when you use our platform. By using {COMPANY}, you
            agree to the practices described in this policy.
          </p>
        </div>

        <Section title="1. Information We Collect">
          <p>We collect the following types of information to provide and improve our services:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Account Information:</strong> Your name, email address, and password (stored in encrypted form) when you register.</li>
            <li><strong>Profile Data:</strong> Optional profile details such as phone number or profile photo that you choose to add.</li>
            <li><strong>Usage Data:</strong> Information about how you interact with courses, lessons, and features on the platform.</li>
            <li><strong>Device Information:</strong> Browser type, operating system, IP address, and device identifiers for security and analytics.</li>
            <li><strong>Communication Data:</strong> Messages you send through our support chat or contact form.</li>
          </ul>
        </Section>

        <Section title="2. How We Use Your Information">
          <p>We use the information we collect for the following purposes:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>To create and manage your account securely.</li>
            <li>To send OTP (One-Time Password) verification emails for login and account security.</li>
            <li>To provide access to courses, live classes, and learning materials.</li>
            <li>To personalize your learning experience and track your progress.</li>
            <li>To send important platform updates, announcements, and course-related notifications.</li>
            <li>To respond to your support queries and feedback.</li>
            <li>To detect and prevent fraudulent or unauthorized activity.</li>
            <li>To analyze and improve the performance and features of our platform.</li>
          </ul>
        </Section>

        <Section title="3. OTP and Email Verification">
          <p>
            When you log in, register, or reset your password, we send a One-Time Password (OTP) to the
            email address associated with your account. This OTP is:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Valid for a limited time period only (typically 10 minutes).</li>
            <li>Used solely for identity verification and account security.</li>
            <li>Never stored in plain text — it is hashed before saving.</li>
          </ul>
          <p>We use Hostinger SMTP services to deliver transactional emails securely.</p>
        </Section>

        <Section title="4. Cookies and Tracking">
          <p>
            We use cookies and similar technologies to keep you logged in and to understand how you use
            our platform. Types of cookies we use:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Session Cookies:</strong> Required for authentication and keeping you logged in during your session.</li>
            <li><strong>Preference Cookies:</strong> To remember your settings such as dark mode preference.</li>
            <li><strong>Analytics Cookies:</strong> To understand user behavior and improve our platform (may be used in future).</li>
          </ul>
          <p>
            You can disable cookies through your browser settings, but this may affect certain features of
            the platform. We may use Google Analytics or similar tools in the future for usage analysis.
          </p>
        </Section>

        <Section title="5. Third-Party Services">
          <p>We use trusted third-party services to operate our platform:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Hostinger SMTP:</strong> For sending transactional emails such as OTPs and notifications.</li>
            <li><strong>Daily.co:</strong> For hosting live video classes. Video sessions may be subject to Daily.co's own privacy policy.</li>
            <li><strong>Google Gemini AI:</strong> For the AI-powered TEET entrance examination feature. Conversation content is processed by Google's AI services.</li>
            <li><strong>Future Services:</strong> We may integrate Google AdSense or other advertising platforms in the future. Any such integration will be disclosed in an updated version of this policy.</li>
          </ul>
          <p>These providers are contractually obligated to keep your data secure and not use it for their own purposes.</p>
        </Section>

        <Section title="6. Data Sharing and Disclosure">
          <p>We do <strong>not</strong> sell, rent, or trade your personal information to third parties. We may share data only in the following limited circumstances:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>With service providers who help us operate the platform (as listed above).</li>
            <li>When required by law, court order, or government authority.</li>
            <li>To protect the rights, safety, and security of our users or the public.</li>
            <li>In connection with a merger, acquisition, or sale of company assets (users will be notified).</li>
          </ul>
        </Section>

        <Section title="7. Data Security">
          <p>We take the security of your data seriously and implement the following measures:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Passwords are hashed using bcrypt and never stored in plain text.</li>
            <li>All data transmission is encrypted using HTTPS/TLS.</li>
            <li>OTPs and session tokens are time-limited and invalidated after use.</li>
            <li>Access to personal data is restricted to authorized personnel only.</li>
            <li>Rate limiting is applied to prevent brute-force and abuse attacks.</li>
          </ul>
          <p>
            While we take all reasonable precautions, no method of transmission over the internet is 100%
            secure. We cannot guarantee absolute security of your data.
          </p>
        </Section>

        <Section title="8. Data Retention">
          <p>
            We retain your personal data for as long as your account is active or as needed to provide
            services. If you delete your account, we will remove your personal data within 30 days, except
            where we are required to retain it for legal or compliance reasons.
          </p>
        </Section>

        <Section title="9. Your Rights">
          <p>Depending on your location, you may have the following rights regarding your personal data:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Access:</strong> Request a copy of the personal data we hold about you.</li>
            <li><strong>Correction:</strong> Ask us to correct inaccurate or incomplete data.</li>
            <li><strong>Deletion:</strong> Request deletion of your account and associated data.</li>
            <li><strong>Portability:</strong> Request your data in a machine-readable format.</li>
            <li><strong>Objection:</strong> Object to certain types of data processing.</li>
          </ul>
          <p>To exercise any of these rights, contact us at <a href={`mailto:${EMAIL}`} className="text-[#4400a8] underline">{EMAIL}</a>.</p>
        </Section>

        <Section title="10. Children's Privacy">
          <p>
            {COMPANY} is not intended for children under the age of 13. We do not knowingly collect
            personal information from children under 13. If we become aware that we have collected data
            from a child under 13, we will delete that information immediately. If you believe a child has
            provided us with their data, please contact us at <a href={`mailto:${EMAIL}`} className="text-[#4400a8] underline">{EMAIL}</a>.
          </p>
        </Section>

        <Section title="11. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time to reflect changes in our practices or
            legal requirements. When we make significant changes, we will notify you via email or a
            prominent notice on the platform. Your continued use of {COMPANY} after such changes constitutes
            your acceptance of the updated policy.
          </p>
        </Section>

        <Section title="12. Contact Us">
          <p>If you have any questions or concerns about this Privacy Policy, please reach out to us:</p>
          <p className="mt-2">
            <strong>T.E.R.M. Edu</strong><br />
            Email: <a href={`mailto:${EMAIL}`} className="text-[#4400a8] underline">{EMAIL}</a>
          </p>
        </Section>
      </main>

      <footer className="border-t border-[#e7e0ed] py-6 text-center text-xs text-[#49454f]">
        <p>© {new Date().getFullYear()} T.E.R.M. Edu. All rights reserved.</p>
        <div className="flex justify-center gap-4 mt-2">
          <a href="/terms" className="text-[#4400a8] hover:underline">Terms &amp; Conditions</a>
          <a href="/contact" className="text-[#4400a8] hover:underline">Contact Us</a>
          <a href="/about" className="text-[#4400a8] hover:underline">About Us</a>
          <a href="/pricing" className="text-[#4400a8] hover:underline">Pricing</a>
        </div>
      </footer>
    </div>
  );
}
