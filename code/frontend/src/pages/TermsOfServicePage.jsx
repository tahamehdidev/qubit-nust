import "./LegalPage.css";

// Same placeholder discipline as PrivacyPolicyPage.jsx -- describes the platform honestly as
// built (including its free-tier hosting constraints), pending real NUST/legal review.
export function TermsOfServicePage() {
  return (
    <main className="legal-page">
      <div className="legal-page__container">
        <p className="legal-page__banner" role="note">
          This is placeholder text describing the platform as built. It has not yet been reviewed by
          NUST&rsquo;s legal counsel and should not be treated as final terms.
        </p>

        <h1>Terms of Service</h1>
        <p className="legal-page__updated">Last updated: draft, pending review</p>

        <h2>Who this is for</h2>
        <p>
          This platform is intended for use by NUST students, instructors, and staff as part of
          their coursework. By creating an account, you&rsquo;re agreeing to these terms.
        </p>

        <h2>Your account</h2>
        <p>
          Keep your password confidential and don&rsquo;t share your account with anyone else.
          You&rsquo;re responsible for activity that happens under your account. If you suspect
          someone else has access to it, request a password reset right away.
        </p>

        <h2>Acceptable use</h2>
        <ul>
          <li>
            Don&rsquo;t attempt to bypass access controls or access another student&rsquo;s or
            instructor&rsquo;s data.
          </li>
          <li>
            Don&rsquo;t share question content or answers in a way that would undermine assessment
            integrity for other students.
          </li>
          <li>Don&rsquo;t attempt to disrupt the platform&rsquo;s availability for other users.</li>
        </ul>

        <h2>Course content</h2>
        <p>
          Course material, questions, and simulations on this platform belong to NUST and its
          instructors. You may use them for your own learning; you may not redistribute or republish
          them elsewhere.
        </p>

        <h2>Availability</h2>
        <p>
          This platform is currently run as an academic pilot on free-tier infrastructure. We make a
          reasonable effort to keep it available, but we don&rsquo;t guarantee uptime, and brief
          interruptions (including a slow first load after a period of inactivity) can happen.
        </p>

        <h2>Changes to the platform or these terms</h2>
        <p>
          We may update these terms or the platform itself as it develops. Material changes will be
          reflected on this page.
        </p>

        <h2>Ending your account</h2>
        <p>
          You can request account deletion at any time through your NUST program administrator. We
          may also suspend an account for a clear violation of the acceptable-use terms above.
        </p>

        <h2>Questions</h2>
        <p>If you have questions about these terms, contact your NUST program administrator.</p>
      </div>
    </main>
  );
}
