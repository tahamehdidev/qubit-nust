import "./LegalPage.css";

// Phase 7D: placeholder text describing exactly what this app actually collects and the real
// access model already built (cohort-scoped instructor visibility, admin audit-log access) --
// not a substitute for real NUST/legal review, hence the banner up top. Public (PublicLayout,
// no auth gate) so it's readable before signing up, same as the platform's other public content.
export function PrivacyPolicyPage() {
  return (
    <main className="legal-page">
      <div className="legal-page__container">
        <p className="legal-page__banner" role="note">
          This is placeholder text describing the platform as built. It has not yet been reviewed
          by NUST&rsquo;s legal counsel and should not be treated as a final policy.
        </p>

        <h1>Privacy Policy</h1>
        <p className="legal-page__updated">Last updated: draft, pending review</p>

        <h2>What we collect</h2>
        <p>When you create an account, we collect your name, email address, and password
          (stored only as a one-way hash — we never store or can retrieve your actual password).
          As you use the platform, we record your course progress, question attempts and answers,
          XP and streak data, and which cohort(s) you&rsquo;re enrolled in.</p>

        <h2>How we use it</h2>
        <p>This data exists to run the platform: showing you your own progress, letting your
          instructor see how their cohort is doing, and letting an administrator keep the system
          working correctly. We don&rsquo;t use it for advertising, and we don&rsquo;t sell or
          share it with third parties.</p>

        <h2>Who can see your data</h2>
        <ul>
          <li><strong>You</strong> can always see your own profile, progress, and attempt
            history.</li>
          <li><strong>Your instructor</strong> can see progress and attempt data for students
            actively or previously enrolled in a cohort they own — never for students outside
            their own cohorts.</li>
          <li><strong>Administrators</strong> can see account information and a log of
            significant actions taken on the platform (like cohort or account changes), used to
            keep the system accountable, not to monitor day-to-day learning activity.</li>
        </ul>

        <h2>Cookies</h2>
        <p>We use a single session cookie to keep you logged in. It&rsquo;s not readable by
          JavaScript and isn&rsquo;t used for tracking or advertising. We don&rsquo;t use
          third-party analytics or advertising cookies.</p>

        <h2>Data retention and deletion</h2>
        <p>Your account and associated data are kept for as long as your account exists. If
          you&rsquo;d like your account deleted, contact your NUST program administrator.</p>

        <h2>Who this is for</h2>
        <p>This platform is intended for use by NUST students, instructors, and staff as part of
          their coursework.</p>

        <h2>Changes to this policy</h2>
        <p>As this platform moves from pilot to a reviewed, final policy, this page will be
          updated to reflect it.</p>

        <h2>Questions</h2>
        <p>If you have questions about your data, contact your NUST program administrator.</p>
      </div>
    </main>
  );
}
