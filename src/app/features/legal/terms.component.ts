import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="legal-page">
      <div class="legal-container">

        <!-- Header -->
        <div class="legal-header">
          <a routerLink="/login" class="back-link">← Back</a>
          <div class="legal-logo">
            <img src="logo.svg" alt="TCFlow" class="legal-logo-img">
            <span class="legal-logo-name">TC<span class="accent">Flow</span></span>
          </div>
        </div>

        <h1>Terms of Service</h1>
        <p class="effective-date">Effective date: June 1, 2025 &nbsp;·&nbsp; Last updated: June 1, 2025</p>

        <div class="legal-body">

          <section>
            <h2>1. Acceptance of Terms</h2>
            <p>
              By accessing or using <strong>TCFlow</strong> ("the Service") at
              <strong>netdollar.vercel.app</strong>, you agree to be bound by these Terms of Service
              ("Terms"). If you do not agree to these Terms, do not use the Service.
            </p>
            <p>
              These Terms apply to all users of the Service. We reserve the right to update these
              Terms at any time. Continued use of the Service after changes constitutes acceptance
              of the updated Terms.
            </p>
          </section>

          <section>
            <h2>2. Description of Service</h2>
            <p>
              TCFlow is a personal finance tracking web application that allows users to:
            </p>
            <ul>
              <li>Record and categorize income and expense transactions</li>
              <li>Set and monitor monthly budgets</li>
              <li>View financial reports and analytics</li>
              <li>Store all financial data in a private Google Spreadsheet in their own Google Drive</li>
            </ul>
            <p>
              The Service uses Google OAuth 2.0 for authentication and the Google Sheets API to
              store your data. You must have a valid Google account to use TCFlow.
            </p>
          </section>

          <section>
            <h2>3. User Accounts and Eligibility</h2>
            <h3>3.1 Eligibility</h3>
            <p>
              You must be at least 13 years of age to use TCFlow. By using the Service, you
              represent that you meet this requirement.
            </p>
            <h3>3.2 Google Account</h3>
            <p>
              Access to TCFlow requires a Google account. You are responsible for maintaining
              the security of your Google account. TCFlow is not responsible for any loss or
              damage resulting from unauthorized access to your Google account.
            </p>
            <h3>3.3 Account Responsibility</h3>
            <p>
              You are solely responsible for all activity that occurs under your account and
              for the accuracy of the financial data you enter into the Service.
            </p>
          </section>

          <section>
            <h2>4. Your Data and Google Sheets</h2>
            <h3>4.1 Data Ownership</h3>
            <p>
              All financial data you enter into TCFlow is stored in a Google Spreadsheet
              ("TCFlow — My Finances") created in your personal Google Drive. You retain full
              ownership of this data. TCFlow does not claim any ownership over your financial data.
            </p>
            <h3>4.2 Data Access</h3>
            <p>
              By using TCFlow, you grant the Service permission to read from and write to your
              TCFlow spreadsheet via the Google Sheets API. This permission is limited to the
              spreadsheet created by TCFlow and does not extend to other files in your Drive.
            </p>
            <h3>4.3 Data Accuracy</h3>
            <p>
              TCFlow is a tool to help you track your finances. We do not verify, validate, or
              guarantee the accuracy of any financial data you enter. You are solely responsible
              for the accuracy and completeness of your financial records.
            </p>
            <h3>4.4 Data Deletion</h3>
            <p>
              You may delete your financial data at any time by deleting the TCFlow spreadsheet
              from your Google Drive. You may revoke TCFlow's access to your Google account at
              any time via
              <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">
                Google Account Permissions
              </a>.
            </p>
          </section>

          <section>
            <h2>5. Acceptable Use</h2>
            <p>You agree not to use TCFlow to:</p>
            <ul>
              <li>Violate any applicable laws or regulations</li>
              <li>Attempt to gain unauthorized access to the Service or its infrastructure</li>
              <li>Interfere with or disrupt the integrity or performance of the Service</li>
              <li>Transmit any malicious code, viruses, or harmful data</li>
              <li>Use the Service for any commercial purpose without our prior written consent</li>
              <li>Attempt to reverse-engineer, decompile, or extract the source code of the Service</li>
              <li>Use automated scripts or bots to access the Service</li>
            </ul>
          </section>

          <section>
            <h2>6. Intellectual Property</h2>
            <p>
              The TCFlow name, logo, design, and source code are the intellectual property of
              TCFlow's developers. The source code is available on
              <a href="https://github.com/craftedcodebyrahul/Expensetracker" target="_blank" rel="noopener">GitHub</a>
              under its respective license.
            </p>
            <p>
              You retain all rights to the financial data you enter. By using the Service, you
              grant us a limited, non-exclusive license to process your data solely for the
              purpose of providing the Service to you.
            </p>
          </section>

          <section>
            <h2>7. Disclaimer of Warranties</h2>
            <p>
              TCFlow is provided <strong>"as is"</strong> and <strong>"as available"</strong>
              without warranties of any kind, either express or implied, including but not limited to:
            </p>
            <ul>
              <li>Warranties of merchantability or fitness for a particular purpose</li>
              <li>Warranties that the Service will be uninterrupted, error-free, or secure</li>
              <li>Warranties regarding the accuracy or reliability of any financial calculations</li>
            </ul>
            <p>
              <strong>TCFlow is not a financial advisor.</strong> Nothing in the Service constitutes
              financial, investment, tax, or legal advice. Always consult a qualified professional
              for financial decisions.
            </p>
          </section>

          <section>
            <h2>8. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by applicable law, TCFlow and its developers shall
              not be liable for any indirect, incidental, special, consequential, or punitive
              damages, including but not limited to:
            </p>
            <ul>
              <li>Loss of data or financial records</li>
              <li>Loss of profits or revenue</li>
              <li>Errors in financial calculations or reports</li>
              <li>Unauthorized access to your Google account or spreadsheet</li>
              <li>Service interruptions or downtime</li>
            </ul>
            <p>
              Our total liability to you for any claims arising from your use of the Service
              shall not exceed the amount you paid to use the Service (which is zero, as TCFlow
              is currently free).
            </p>
          </section>

          <section>
            <h2>9. Third-Party Services</h2>
            <p>
              TCFlow relies on the following third-party services, each governed by their own
              terms and privacy policies:
            </p>
            <ul>
              <li>
                <strong>Google</strong> — Authentication, Sheets API, Drive API.
                See <a href="https://policies.google.com/terms" target="_blank" rel="noopener">Google Terms of Service</a>.
              </li>
              <li>
                <strong>Vercel</strong> — Hosting and deployment.
                See <a href="https://vercel.com/legal/terms" target="_blank" rel="noopener">Vercel Terms of Service</a>.
              </li>
            </ul>
            <p>
              We are not responsible for the practices or content of these third-party services.
            </p>
          </section>

          <section>
            <h2>10. Service Availability and Changes</h2>
            <p>
              We reserve the right to modify, suspend, or discontinue the Service at any time
              without notice. We are not liable to you or any third party for any modification,
              suspension, or discontinuation of the Service.
            </p>
            <p>
              Since your data is stored in your own Google Drive, discontinuation of TCFlow
              does not result in loss of your financial data.
            </p>
          </section>

          <section>
            <h2>11. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with applicable laws.
              Any disputes arising from these Terms or your use of the Service shall be resolved
              through good-faith negotiation before pursuing any legal remedies.
            </p>
          </section>

          <section>
            <h2>12. Contact</h2>
            <p>
              For questions about these Terms, please contact us:
            </p>
            <div class="contact-box">
              <p><strong>TCFlow</strong></p>
              <p>Website: <a href="https://netdollar.vercel.app" target="_blank" rel="noopener">netdollar.vercel.app</a></p>
              <p>GitHub: <a href="https://github.com/craftedcodebyrahul/Expensetracker" target="_blank" rel="noopener">github.com/craftedcodebyrahul/Expensetracker</a></p>
            </div>
          </section>

        </div>

        <!-- Footer links -->
        <div class="legal-footer">
          <a routerLink="/privacy">Privacy Policy</a>
          <span>·</span>
          <a routerLink="/login">Back to Sign In</a>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .legal-page {
      min-height: 100vh;
      background: var(--bg-primary);
      padding: 2rem 1rem;
    }
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
    strong { color: var(--text-primary); font-weight: 600; }
    .contact-box { background: var(--bg-input); border-radius: var(--radius-md); padding: 1rem 1.25rem; margin-top: 0.75rem; }
    .contact-box p { margin-bottom: 0.375rem; }
    .legal-footer { display: flex; align-items: center; justify-content: center; gap: 1rem; margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border); font-size: 0.875rem; color: var(--text-muted); }
    .legal-footer a { color: var(--text-muted); }
    .legal-footer a:hover { color: var(--accent-blue-light); }
    @media (max-width: 600px) { h1 { font-size: 1.5rem; } section { padding: 1.25rem; } }
  `]
})
export class TermsComponent {}
