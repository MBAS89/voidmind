/**
 * VoidMind SDK — TypeScript Definitions
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatParams {
  model?: string;
  messages: ChatMessage[];
  sessionId?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  session_id?: string;
  cached?: boolean;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface StreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: Partial<ChatMessage>;
    finish_reason: string | null;
  }>;
}

export interface ClientOptions {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
  maxRetries?: number;
}

export declare class VoidMindClient {
  constructor(options: ClientOptions);
  chat(params: ChatParams): Promise<ChatResponse>;
  streamChat(params: ChatParams): AsyncGenerator<StreamChunk>;
  endSession(sessionId: string): Promise<{ session_id: string; wiped: boolean }>;
  listModels(): Promise<{ data: Array<{ id: string }> }>;
  getUsage(): Promise<Record<string, any>>;
  static createAdminClient(baseUrl: string, accessToken: string): VoidMindAdminClient;
}

export declare class VoidMindAdminClient {
  constructor(baseUrl: string, accessToken: string);
  login(email: string, password: string): Promise<{ access_token: string; refresh_token: string }>;
  listKeys(): Promise<{ keys: any[] }>;
  createKey(params: { name: string; monthly_limit?: number; daily_limit?: number; requests_per_minute?: number }): Promise<any>;
  revokeKey(id: string): Promise<any>;
  rotateKey(id: string): Promise<any>;
  updateKeyLimits(id: string, limits: Record<string, number>): Promise<any>;
  getUsage(): Promise<any>;
  getKeyUsage(keyId: string): Promise<any>;
  getSessions(): Promise<any>;
  wipeAllSessions(): Promise<any>;
  getHealth(): Promise<any>;
  getPerformance(): Promise<any>;
  getCompliance(): Promise<any>;
  clearResponseCache(): Promise<any>;
  clearPromptCache(): Promise<any>;
}

export class VoidMindError extends Error {
  statusCode: number;
  responseBody: any;
}

export class AuthenticationError extends VoidMindError {}
export class RateLimitError extends VoidMindError {
  retryAfter?: string;
}
export class ValidationError extends VoidMindError {}
export class ServerError extends VoidMindError {}
export class CircuitBreakerError extends VoidMindError {}
