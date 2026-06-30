import { Component, inject, signal, ElementRef, ViewChild, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LayoutService } from '../../core/services/layout.service';
import { ApiService } from '../../core/services/api.service';

interface ChatMessage {
  sender: 'user' | 'assistant';
  text: string;
}

@Component({
  selector: 'app-ai-coach-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- Backdrop overlay -->
    <div class="drawer-backdrop" *ngIf="layout.aiCoachOpen()" (click)="layout.toggleAiCoach()"></div>

    <!-- Drawer panel -->
    <div class="coach-drawer" [class.open]="layout.aiCoachOpen()">
      <div class="drawer-header">
        <div class="header-title-block">
          <span class="coach-avatar-lg">🤖</span>
          <div>
            <h3>AI Finance Coach</h3>
            <p>Gemini Powered • Context-Aware Advice</p>
          </div>
        </div>
        <button class="btn-close" (click)="layout.toggleAiCoach()">✕</button>
      </div>

      <!-- Messages Area -->
      <div class="drawer-body" #scrollContainer>
        @if (messages().length === 0) {
          <div class="welcome-box">
            <span class="welcome-icon">👋</span>
            <h4>Welcome to AI Finance Coach!</h4>
            <p>I've analyzed your transaction registers and accounts. Ask me custom questions or try one of these suggestions:</p>
            
            <div class="quick-chips">
              <button class="chip-btn" (click)="sendPreset('Summarize my recent spending highlights')">🔍 Spend Highlights</button>
              <button class="chip-btn" (click)="sendPreset('Where are my biggest budget leaks?')">💧 Find Budget Leaks</button>
              <button class="chip-btn" (click)="sendPreset('How can I save $100 this month?')">💰 How to save $100</button>
              <button class="chip-btn" (click)="sendPreset('Analyze my monthly cashflow runway')">🔮 Cashflow Runway</button>
            </div>
          </div>
        } @else {
          <div class="chat-feed">
            @for (msg of messages(); track $index) {
              <div class="chat-bubble-wrapper" [class.user-msg]="msg.sender === 'user'">
                <span class="chat-avatar">{{ msg.sender === 'user' ? '👤' : '🤖' }}</span>
                <div class="chat-bubble">
                  <p>{{ msg.text }}</p>
                </div>
              </div>
            }
            
            <!-- Loading indicator bubble -->
            @if (loading()) {
              <div class="chat-bubble-wrapper loading-wrapper">
                <span class="chat-avatar">🤖</span>
                <div class="chat-bubble loading-bubble">
                  <div class="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            }
          </div>
        }
      </div>

      <!-- Input Footer -->
      <div class="drawer-footer">
        <form (submit)="sendMessage(); $event.preventDefault();" class="chat-form">
          <input 
            type="text" 
            [(ngModel)]="userInput" 
            name="userInput"
            class="chat-input" 
            placeholder="Ask about your budgets, transactions..." 
            [disabled]="loading()"
            autocomplete="off"
          />
          <button type="submit" class="btn-send" [disabled]="!userInput.trim() || loading()">
            ➔
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .drawer-backdrop {
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      z-index: 1050;
      animation: fadeIn 0.25s ease;
    }

    .coach-drawer {
      position: fixed;
      top: 0; right: -420px; width: 100%; max-width: 400px; height: 100vh;
      background: var(--bg-card);
      border-left: 1px solid var(--border);
      box-shadow: -8px 0 24px rgba(0, 0, 0, 0.3);
      display: flex; flex-direction: column;
      z-index: 1060;
      transition: right 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .coach-drawer.open {
      right: 0;
    }

    .drawer-header {
      padding: 1.25rem;
      border-bottom: 1px solid var(--border);
      display: flex; align-items: center; justify-content: space-between;
      background: rgba(255, 255, 255, 0.01);
    }

    .header-title-block {
      display: flex; align-items: center; gap: 0.75rem;
    }

    .coach-avatar-lg {
      font-size: 1.75rem;
      width: 42px; height: 42px;
      display: flex; align-items: center; justify-content: center;
      background: rgba(92, 107, 192, 0.15);
      border-radius: 50%;
    }

    .header-title-block h3 {
      margin: 0; font-size: 1rem; font-weight: 700; color: var(--text-primary);
    }

    .header-title-block p {
      margin: 0; font-size: 0.7rem; color: var(--accent-blue-light);
      font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
    }

    .btn-close {
      background: none; border: none; font-size: 1.15rem; color: var(--text-muted);
      cursor: pointer; padding: 0.25rem; transition: var(--transition);
    }
    .btn-close:hover { color: var(--text-primary); }

    .drawer-body {
      flex: 1; overflow-y: auto; padding: 1.25rem;
      display: flex; flex-direction: column; gap: 1rem;
      background: rgba(18, 20, 29, 0.2);
    }

    .welcome-box {
      margin: auto 0; text-align: center; padding: 1rem;
      display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
    }

    .welcome-icon { font-size: 2.5rem; }

    .welcome-box h4 {
      margin: 0; font-size: 1.1rem; color: var(--text-primary);
    }

    .welcome-box p {
      margin: 0; font-size: 0.8125rem; color: var(--text-muted); line-height: 1.5;
    }

    .quick-chips {
      display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; margin-top: 1rem;
    }

    .chip-btn {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 0.45rem 0.875rem;
      font-size: 0.75rem; color: var(--text-secondary);
      cursor: pointer; transition: var(--transition);
    }
    .chip-btn:hover {
      background: rgba(92, 107, 192, 0.1);
      border-color: var(--accent-blue);
      color: var(--text-primary);
      transform: translateY(-1px);
    }

    .chat-feed {
      display: flex; flex-direction: column; gap: 1.25rem;
    }

    .chat-bubble-wrapper {
      display: flex; gap: 0.75rem; align-items: flex-start;
      max-width: 85%;
    }

    .chat-avatar {
      font-size: 1.1rem; width: 28px; height: 28px;
      display: flex; align-items: center; justify-content: center;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border);
      border-radius: 50%; flex-shrink: 0;
    }

    .chat-bubble {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border);
      border-radius: 0 12px 12px 12px;
      padding: 0.75rem 0.875rem;
    }

    .chat-bubble p {
      margin: 0; font-size: 0.8125rem; line-height: 1.5; color: var(--text-primary);
      white-space: pre-line;
    }

    .user-msg {
      align-self: flex-end; flex-direction: row-reverse;
      max-width: 85%;
    }

    .user-msg .chat-bubble {
      background: var(--accent-blue);
      border-color: rgba(92, 107, 192, 0.3);
      border-radius: 12px 0 12px 12px;
    }

    .user-msg .chat-avatar {
      background: rgba(92, 107, 192, 0.2);
    }

    .drawer-footer {
      padding: 1rem; border-top: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.01);
    }

    .chat-form { display: flex; gap: 0.5rem; }

    .chat-input {
      flex: 1; background: var(--bg-input); border: 1px solid var(--border);
      color: var(--text-primary); border-radius: var(--radius-md);
      padding: 0.625rem 0.875rem; font-size: 0.8125rem; outline: none;
      transition: var(--transition);
    }
    .chat-input:focus { border-color: var(--accent-blue); }

    .btn-send {
      width: 38px; height: 38px; border-radius: var(--radius-md);
      background: var(--accent-blue); border: none; color: #fff;
      font-size: 1rem; display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: var(--transition);
    }
    .btn-send:hover:not(:disabled) {
      background: var(--accent-blue-light); transform: scale(1.05);
    }
    .btn-send:disabled {
      background: rgba(255, 255, 255, 0.02); color: var(--text-muted); cursor: not-allowed;
      border: 1px solid var(--border);
    }

    /* Typing Indicator Bubble */
    .typing-indicator {
      display: flex; gap: 0.25rem; align-items: center;
      padding: 0.15rem 0;
    }
    .typing-indicator span {
      width: 6px; height: 6px; background: var(--text-muted);
      border-radius: 50%; display: inline-block;
      animation: bounce 1.4s infinite ease-in-out both;
    }
    .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
    .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }

    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1.0); }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `]
})
export class AiCoachDrawerComponent {
  layout = inject(LayoutService);
  private api = inject(ApiService);

  userInput = '';
  messages = signal<ChatMessage[]>([]);
  loading = signal(false);

  @ViewChild('scrollContainer') private scrollContainer!: ElementRef<HTMLDivElement>;

  constructor() {
    // Automatically scroll to bottom when messages or loading changes
    effect(() => {
      this.messages();
      this.loading();
      setTimeout(() => this.scrollToBottom(), 50);
    });
  }

  sendMessage() {
    const text = this.userInput.trim();
    if (!text || this.loading()) return;

    // Append user message
    this.messages.update(prev => [...prev, { sender: 'user', text }]);
    this.userInput = '';
    this.loading.set(true);

    const history = this.messages().map(m => ({
      sender: m.sender,
      text: m.text
    }));

    this.api.postAiCoach(text, history).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.success && res.data?.reply) {
          this.messages.update(prev => [...prev, { sender: 'assistant', text: res.data.reply }]);
        } else {
          this.messages.update(prev => [...prev, { sender: 'assistant', text: 'Sorry, I encountered an issue processing your request. Please try again.' }]);
        }
      },
      error: () => {
        this.loading.set(false);
        this.messages.update(prev => [...prev, { sender: 'assistant', text: 'Error connecting to the AI Coach service. Please check your network.' }]);
      }
    });
  }

  sendPreset(text: string) {
    this.userInput = text;
    this.sendMessage();
  }

  private scrollToBottom() {
    if (this.scrollContainer?.nativeElement) {
      this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
    }
  }
}
