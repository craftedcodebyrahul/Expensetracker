export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}
