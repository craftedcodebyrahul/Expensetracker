import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="legal-page">
      <div class="legal-container">

        <div class="legal-header">
          <a routerLink="/login" class="back-link">← Back</a>
          <div class="legal-logo">
            <img src="logo.svg" alt="TCFlow" class="legal-logo-img">
            <span class="legal-logo-name">TC<span class="accent">Flow</span></span>
          </div>
        </div>

        <h1>Privacy Policy</h1>
        <p class="effective-date">Effective date: June 1, 2025 &nbsp;·&nbsp; Last updated: June 7, 2025</p>

        <div class="legal-body">

          <section>
            <h2>1. Introduction</h2>
            <p>
              Welcome to <strong>TCFlow</strong> ("we", "our", or "us"). TCFlow is a personal
              finance tracking application that helps you monitor income, expenses, budgets, and
              overall cashflow. This Privacy Policy explains how we collect, use, and protect your
              information when you use our service.
            </p>
            <p>
              By using TCFlow, you agree to the collection and use of information in accordance
              with this policy. If you do not agree, please do not use the service.
            </p>
          </section>

          <section>
            <h2>2. Information We Collect</h2>

            <h3>2.1 Information from Google Sign-In</h3>
            <p>
              When you sign in with Google, we receive the following from Google's OAuth 2.0 service:
            </p>
            <ul>
              <li>Your Google account name</li>
              <li>Your Google account email address</li>
              <li>Your Google profile picture URL</li>
              <li>A unique Google account identifier (used as your user ID)</li>
            </ul>
            <p>
              We do <strong>not</strong> request or store OAuth access tokens, refresh tokens,
              or any Google Drive / Sheets scopes. Authentication is identity-only.
            </p>

            <h3>2.2 Financial Data You Enter</h3>
            <p>
              All financial data you enter — transactions, budgets, categories, accounts, and
              settings — is stored in a <strong>private Turso database</strong> (hosted on
              Turso's infrastructure) that is isolated to your account. No other user can access
              your data.
            </p>

            <h3>2.3 Session Data</h3>
            <p>
              We store a short-lived, encrypted session cookie in your browser to keep you
              signed in. This cookie contains only your name, email, picture URL, and Google
              user ID — no tokens. It expires after 7 days and is deleted when you sign out.
            </p>

            <h3>2.4 Server Logs</h3>
            <p>
              Our hosting provider may collect standard server logs including IP addresses,
              browser type, pages visited, and timestamps. These are used for security and
              performance monitoring only.
            </p>
          </section>

          <section>
            <h2>3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul>
              <li>Authenticate you via Google OAuth 2.0 (identity only — no Drive/Sheets access)</li>
              <li>Create and manage your personal finance records in the database</li>
              <li>Maintain your session so you stay signed in</li>
              <li>Display your name and profile picture within the app</li>
              <li>Generate AI-powered financial insights via Google Gemini (your raw data is
                  summarised into aggregated metrics — individual transactions are never sent)</li>
              <li>Provide, maintain, and improve the TCFlow service</li>
            </ul>
            <p>
              We do <strong>not</strong> use your data for advertising, profiling, or any purpose
              other than providing the TCFlow service to you.
            </p>
          </section>

          <section>
            <h2>4. Data Storage and Security</h2>

            <h3>4.1 Your Financial Data</h3>
            <p>
              Your financial data is stored in a <strong>Turso libSQL database</strong> — a
              distributed, edge-hosted SQLite service. Each user's data is isolated by a unique
              user ID and is never commingled with other users' data. You can export or delete
              your data at any time from within the app.
            </p>

            <h3>4.2 Session Security</h3>
            <p>
              Session cookies are encrypted using a server-side secret key, marked
              <code>HttpOnly</code> (inaccessible to JavaScript), and transmitted only over
              HTTPS in production.
            </p>

            <h3>4.3 No OAuth Token Storage</h3>
            <p>
              Unlike earlier versions of TCFlow, we no longer store or use Google OAuth access
              or refresh tokens after the initial sign-in. Your Google account is used only to
              verify your identity. No Google APIs are called after login.
            </p>

            <h3>4.4 No Third-Party Data Sharing</h3>
            <p>
              We do not sell, trade, rent, or share your personal information with any third
              parties, except as required by law or as necessary to provide the service
              (e.g., Turso for database hosting, Google for sign-in authentication).
            </p>
          </section>

          <section>
            <h2>5. Google API Services</h2>
            <p>TCFlow uses the following Google APIs:</p>
            <ul>
              <li><strong>Google OAuth 2.0</strong> — for authentication and identity only</li>
              <li><strong>Google Gemini API</strong> — to generate AI financial summaries
                  (optional, only if a Gemini API key is configured)</li>
            </ul>
            <p>
              TCFlow's use and transfer of information received from Google APIs adheres to the
              <a href="https://developers.google.com/terms/api-services-user-data-policy"
                 target="_blank" rel="noopener">Google API Services User Data Policy</a>,
              including the Limited Use requirements.
            </p>
            <p>We only request the minimum scopes necessary:</p>
            <ul>
              <li><code>userinfo.email</code> — to identify your account</li>
              <li><code>userinfo.profile</code> — to display your name and picture</li>
            </ul>
            <p>
              We do <strong>not</strong> request <code>spreadsheets</code>,
              <code>drive.file</code>, or any other Google API scopes.
            </p>
          </section>

          <section>
            <h2>6. Your Rights and Choices</h2>
            <ul>
              <li>
                <strong>Export your data:</strong> Use the CSV export feature in the
                Transactions page to download all your transaction history at any time.
              </li>
              <li>
                <strong>Delete your data:</strong> Contact us and we will permanently delete
                all your records from the database within 30 days.
              </li>
              <li>
                <strong>Revoke Google access:</strong> Visit
                <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">
                  Google Account Permissions</a> and remove TCFlow. This prevents future
                  sign-ins but does not automatically delete stored data.
              </li>
              <li>
                <strong>Sign out:</strong> Use the sign-out button in the app to clear your
                session cookie from your browser immediately.
              </li>
            </ul>
          </section>

          <section>
            <h2>7. Children's Privacy</h2>
            <p>
              TCFlow is not directed at children under the age of 13. We do not knowingly
              collect personal information from children under 13. If you believe a child has
              provided us with personal information, please contact us and we will delete it
              promptly.
            </p>
          </section>

          <section>
            <h2>8. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of
              significant changes by updating the "Last updated" date at the top of this page.
              Continued use of TCFlow after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2>9. Contact Us</h2>
            <p>
              If you have questions or concerns about this Privacy Policy or our data practices,
              please reach out:
            </p>
            <div class="contact-box">
              <p><strong>TCFlow</strong></p>
              <p>GitHub: <a href="https://github.com/craftedcodebyrahul/Expensetracker"
                            target="_blank" rel="noopener">
                github.com/craftedcodebyrahul/Expensetracker</a></p>
            </div>
          </section>

        </div>

        <div class="legal-footer">
          <a routerLink="/terms">Terms of Service</a>
          <span>·</span>
          <a routerLink="/login">Back to Sign In</a>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .legal-page { min-height: 100vh; background: var(--bg-primary); padding: 2rem 1rem; }
    .legal-container { max-width: 760px; margin: 0 auto; }
    .legal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2.5rem; }
    .back-link { font-size: 0.875rem; color: var(--text-muted); text-decoration: none; transition: var(--transition); }
    .back-link:hover { color: var(--text-primary); }
    .legal-logo { display: flex; align-items: center; gap: 0.5rem; }
    .legal-logo-img { width: 28px; height: 28px; }
    .legal-logo-name { font-size: 1.1rem; font-weight: 800; color: var(--text-primary); letter-spacing: -0.02em; }
    .accent { color: var(--accent-blue-light); }
    h1 { font-size: 2rem; font-weight: 800; color: var(--text-primary); margin-bottom: 0.5rem; }
    .effective-date { font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 2.5rem; }
    .legal-body { display: flex; flex-direction: column; gap: 2rem; }
    section { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 1.75rem; }
    h2 { font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 1rem; padding-bottom: 0.625rem; border-bottom: 1px solid var(--border); }
    h3 { font-size: 0.9375rem; font-weight: 600; color: var(--text-primary); margin: 1.25rem 0 0.5rem; }
    h3:first-child { margin-top: 0; }
    p { font-size: 0.9rem; color: var(--text-secondary); line-height: 1.75; margin-bottom: 0.75rem; }
    p:last-child { margin-bottom: 0; }
    ul { list-style: none; display: flex; flex-direction: column; gap: 0.5rem; margin: 0.5rem 0 0.75rem; }
    li { font-size: 0.9rem; color: var(--text-secondary); line-height: 1.6; padding-left: 1.25rem; position: relative; }
    li::before { content: '→'; position: absolute; left: 0; color: var(--accent-blue-light); font-size: 0.75rem; top: 0.15rem; }
    a { color: var(--accent-blue-light); }
    a:hover { color: var(--text-primary); }
    code { font-family: 'Courier New', monospace; font-size: 0.8125rem; color: var(--accent-cyan, #4dd0e1); background: var(--bg-primary); padding: 0.1rem 0.375rem; border-radius: 4px; }
    strong { color: var(--text-primary); font-weight: 600; }
    .contact-box { background: var(--bg-input); border-radius: var(--radius-md); padding: 1rem 1.25rem; margin-top: 0.75rem; }
    .contact-box p { margin-bottom: 0.375rem; }
    .legal-footer { display: flex; align-items: center; justify-content: center; gap: 1rem; margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border); font-size: 0.875rem; color: var(--text-muted); }
    .legal-footer a { color: var(--text-muted); }
    .legal-footer a:hover { color: var(--accent-blue-light); }
    @media (max-width: 600px) { h1 { font-size: 1.5rem; } section { padding: 1.25rem; } }
  `]
})
export class PrivacyComponent {}
