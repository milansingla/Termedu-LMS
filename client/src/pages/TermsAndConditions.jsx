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

export default function TermsAndConditions() {
  const navigate = useNavigate();
  usePageMeta("Terms & Conditions — T.E.R.M. Edu", "Review the T.E.R.M. Edu Terms & Conditions governing use of our learning platform, courses, and services.", '/terms');
  return (
    <div className="min-h-screen bg-[#fef7ff]">
      <header className="sticky top-0 z-50 bg-[#fef7ff]/95 backdrop-blur border-b border-[#e7e0ed]">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => navigate(-1)} aria-label="Go back"
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#f3ebf9] transition-colors">
            <span className="material-symbols-outlined text-[#4400a8] text-xl">arrow_back</span>
          </button>
          <p className="font-semibold text-[#1c1b1f] text-base">Terms &amp; Conditions</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1c1b1f] mb-1">Terms &amp; Conditions</h1>
          <p className="text-xs text-[#49454f]">Last updated: {LAST_UPDATED}</p>
          <p className="mt-4 text-sm text-[#1c1b1f] leading-relaxed">
            Please read these Terms and Conditions carefully before using {COMPANY}. By accessing or using
            our platform, you agree to be bound by these terms. If you do not agree with any part of these
            terms, you must not use the platform.
          </p>
        </div>

        <Section title="1. Acceptance of Terms">
          <p>
            By creating an account or accessing {COMPANY} in any way, you acknowledge that you have read,
            understood, and agree to be bound by these Terms and Conditions, along with our Privacy Policy.
            These terms apply to all users, including students, lecturers, and administrators.
          </p>
        </Section>

        <Section title="2. Eligibility">
          <ul className="list-disc pl-5 space-y-1">
            <li>You must be at least 13 years of age to use {COMPANY}.</li>
            <li>You must provide accurate, complete, and up-to-date information during registration.</li>
            <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
            <li>One person may maintain only one account. Creating multiple accounts is prohibited.</li>
          </ul>
        </Section>

        <Section title="3. User Responsibilities">
          <p>As a user of {COMPANY}, you agree to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Use the platform solely for lawful educational purposes.</li>
            <li>Keep your login credentials secure and not share them with others.</li>
            <li>Provide accurate personal information and keep it updated.</li>
            <li>Respect the intellectual property rights of all course content and materials.</li>
            <li>Engage respectfully with other users, lecturers, and support staff.</li>
            <li>Complete the TEET (T.E.R.M. Edu Entrance Test) honestly and without assistance.</li>
            <li>Not attempt to bypass, hack, or manipulate any part of the platform.</li>
          </ul>
        </Section>

        <Section title="4. Account Usage Rules">
          <ul className="list-disc pl-5 space-y-1">
            <li>Your account is personal and non-transferable. You may not sell, lend, or share access to your account.</li>
            <li>You are responsible for all activity that occurs under your account.</li>
            <li>You must notify us immediately at <a href={`mailto:${EMAIL}`} className="text-[#4400a8] underline">{EMAIL}</a> if you suspect unauthorized use of your account.</li>
            <li>Accounts inactive for more than 12 months may be deactivated at our discretion.</li>
            <li>Plan access is tied to your individual account and cannot be shared across devices or users simultaneously.</li>
          </ul>
        </Section>

        <Section title="5. Course Access and Plans">
          <p>
            {COMPANY} offers multiple subscription plans (Starter, Growth, Premium) that determine which
            courses and features you can access. By enrolling in a plan:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>You agree to the specific terms and pricing of the selected plan.</li>
            <li>Access is granted for the duration specified in your plan.</li>
            <li>Some courses and features may require completion of the TEET entrance exam.</li>
            <li>Plan upgrades are available at any time; downgrades may be subject to conditions.</li>
            <li>We reserve the right to modify course content to keep it current and accurate.</li>
          </ul>
        </Section>

        <Section title="6. TEET Entrance Examination">
          <p>The T.E.R.M. Edu Entrance Test (TEET) is an AI-powered assessment that determines eligibility for certain plans and features:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>You must attempt TEET honestly and without external assistance or impersonation.</li>
            <li>Failing TEET twice results in a 30-day cooldown before another attempt is allowed.</li>
            <li>Abandoning or exiting TEET during an active session counts as a failed attempt.</li>
            <li>Attempting to manipulate or bypass the TEET system is a violation of these terms and may result in account suspension.</li>
          </ul>
        </Section>

        <Section title="7. Prohibited Activities">
          <p>The following activities are strictly prohibited on {COMPANY}:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Uploading, sharing, or distributing any course content without written permission.</li>
            <li>Using the platform to spread spam, malware, or harmful content.</li>
            <li>Attempting to gain unauthorized access to other accounts or system resources.</li>
            <li>Reverse engineering, scraping, or using bots on the platform.</li>
            <li>Impersonating another person or entity.</li>
            <li>Using the platform for any illegal activity or in violation of any applicable law.</li>
            <li>Harassing, abusing, or threatening other users or staff.</li>
            <li>Posting false reviews, ratings, or misleading information.</li>
          </ul>
          <p>Violation of these rules may result in immediate suspension or permanent termination of your account.</p>
        </Section>

        <Section title="8. Intellectual Property">
          <p>
            All content on {COMPANY} — including but not limited to course videos, written materials,
            graphics, logos, and software — is the intellectual property of {COMPANY} or its content
            creators. You may not copy, reproduce, distribute, or create derivative works from any content
            without our express written consent.
          </p>
          <p>
            You are granted a limited, non-exclusive, non-transferable license to access and use the
            platform content solely for your personal, non-commercial educational purposes.
          </p>
        </Section>

        <Section title="9. Limitation of Liability">
          <p>
            To the maximum extent permitted by applicable law, {COMPANY} and its founders, employees, and
            partners shall not be liable for:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Any indirect, incidental, special, or consequential damages.</li>
            <li>Loss of data, revenue, profits, or business opportunities.</li>
            <li>Service interruptions caused by technical issues, maintenance, or events beyond our control.</li>
            <li>The accuracy, completeness, or usefulness of any course content or information on the platform.</li>
            <li>Actions or omissions of third-party service providers used by the platform.</li>
          </ul>
          <p>
            Our total liability for any claim related to your use of the platform shall not exceed the
            amount you have paid us in the three months prior to the claim.
          </p>
        </Section>

        <Section title="10. Refund Policy">
          <p>
            As plans on {COMPANY} are managed through direct consultation with our advisors, refund
            eligibility depends on the specific plan purchased and the circumstances. Please contact us at{' '}
            <a href={`mailto:${EMAIL}`} className="text-[#4400a8] underline">{EMAIL}</a> to discuss
            any refund requests. We handle each case individually and fairly.
          </p>
        </Section>

        <Section title="11. Termination">
          <p>
            We reserve the right to suspend or permanently terminate your account at any time, with or
            without notice, for any of the following reasons:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Violation of these Terms and Conditions.</li>
            <li>Fraudulent, abusive, or harmful behavior on the platform.</li>
            <li>Extended inactivity on the account.</li>
            <li>At our sole discretion, for the protection of the platform and its users.</li>
          </ul>
          <p>
            Upon termination, your access to all platform features will be revoked immediately. Any data
            associated with your account may be deleted in accordance with our Privacy Policy.
          </p>
        </Section>

        <Section title="12. Governing Law">
          <p>
            These Terms and Conditions are governed by and construed in accordance with the laws of India.
            Any disputes arising from these terms shall be subject to the exclusive jurisdiction of the
            courts located in India.
          </p>
        </Section>

        <Section title="13. Changes to Terms">
          <p>
            We reserve the right to modify these Terms and Conditions at any time. We will notify users of
            any significant changes via email or a platform notice. Your continued use of {COMPANY} after
            changes are posted constitutes your acceptance of the revised terms.
          </p>
        </Section>

        <Section title="14. Contact Us">
          <p>For questions about these Terms and Conditions, contact us:</p>
          <p className="mt-2">
            <strong>T.E.R.M. Edu</strong><br />
            Email: <a href={`mailto:${EMAIL}`} className="text-[#4400a8] underline">{EMAIL}</a>
          </p>
        </Section>
      </main>

      <footer className="border-t border-[#e7e0ed] py-6 text-center text-xs text-[#49454f]">
        <p>© {new Date().getFullYear()} T.E.R.M. Edu. All rights reserved.</p>
        <div className="flex justify-center gap-4 mt-2">
          <a href="/privacy-policy" className="text-[#4400a8] hover:underline">Privacy Policy</a>
          <a href="/contact" className="text-[#4400a8] hover:underline">Contact Us</a>
          <a href="/about" className="text-[#4400a8] hover:underline">About Us</a>
          <a href="/pricing" className="text-[#4400a8] hover:underline">Pricing</a>
        </div>
      </footer>
    </div>
  );
}
