import { API_URL, authenticatedFetch } from './api-config';

class ApiClient {
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await authenticatedFetch(`${API_URL}${path}`, {
      method,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `Request failed: ${res.status}`);
    }
    return res.json();
  }

  // Projects
  async getProjects() {
    return this.request<{ projects: Project[] }>('GET', '/api/projects');
  }

  async createProject(data: { id?: string; name: string; description?: string }) {
    return this.request<{ project: Project }>('POST', '/api/projects', data);
  }

  async getProject(id: string) {
    return this.request<{ project: Project }>('GET', `/api/projects/${id}`);
  }

  async updateProject(id: string, data: { name?: string; description?: string }) {
    return this.request<{ project: Project }>('PUT', `/api/projects/${id}`, data);
  }

  async deleteProject(id: string) {
    return this.request<{ success: boolean }>('DELETE', `/api/projects/${id}`);
  }

  // Build
  async startBuild(projectId: string, prompt: string) {
    return this.request<{ sessionId: string; projectId: string }>('POST', '/api/execute', { projectId, prompt });
  }

  async sendDirective(projectId: string, text: string) {
    return this.request<{ success: boolean }>('POST', `/api/execute/${projectId}/directive`, { text });
  }

  async respondToQuestion(projectId: string, nodeId: string, answer: string) {
    return this.request<{ success: boolean }>('POST', `/api/execute/${projectId}/respond`, { nodeId, answer });
  }

  async sendCorrection(projectId: string, correctionText: string, eventContext: Record<string, unknown>) {
    return this.request<{ success: boolean }>('POST', `/api/execute/${projectId}/correct`, { correctionText, eventContext });
  }

  async stopBuild(projectId: string) {
    return this.request<{ success: boolean }>('POST', `/api/execute/${projectId}/stop`);
  }

  // OAuth
  async getOAuthCatalog() {
    return this.request<{ providers: OAuthCatalogEntry[] }>('GET', '/api/oauth/catalog');
  }

  async startOAuth(providerId: string, projectId: string) {
    return this.request<{ authorizationUrl: string; state: string }>('POST', `/api/oauth/${providerId}/authorize`, { projectId });
  }

  // Credentials
  async getCredentials(projectId: string) {
    return this.request<{ credentials: { id: string; providerId: string; providerEmail: string | null; status: string }[] }>('GET', `/api/credentials/${projectId}`);
  }

  // Event replay (chat history)
  async getEventReplay(projectId: string) {
    return this.request<{ events: unknown[] }>('GET', `/api/events/replay?projectId=${projectId}`);
  }

  // Publish
  async checkSlug(slug: string) {
    return this.request<{ available: boolean; slug: string; url: string; error?: string }>('GET', `/api/publish/check-slug?slug=${encodeURIComponent(slug)}`);
  }

  async setSlug(projectId: string, slug: string) {
    return this.request<{ slug: string; url: string }>('PUT', `/api/publish/${projectId}/slug`, { slug });
  }

  async publishProject(projectId: string) {
    return this.request<{ published: boolean; slug: string; url: string; version: number }>('POST', `/api/publish/${projectId}/publish`);
  }

  async unpublishProject(projectId: string) {
    return this.request<{ published: boolean }>('POST', `/api/publish/${projectId}/unpublish`);
  }

  // Speculative analysis
  async speculate(text: string, projectId: string) {
    return this.request<{ speculation: unknown; reason?: string; model?: string }>('POST', '/api/speculate', { text, projectId });
  }

  // Account
  async getProfile() {
    return this.request<{ profile: UserProfile }>('GET', '/api/account/profile');
  }

  async updateProfile(data: { name?: string; image?: string; slug?: string }) {
    return this.request<{ profile: UserProfile }>('PUT', '/api/account/profile', data);
  }

  async changePassword(currentPassword: string, newPassword: string) {
    return this.request<{ success: boolean }>('PUT', '/api/account/password', { currentPassword, newPassword });
  }

  async getSessions() {
    return this.request<{ sessions: SessionInfo[] }>('GET', '/api/account/sessions');
  }

  async revokeSession(sessionId: string) {
    return this.request<{ success: boolean }>('DELETE', `/api/account/sessions/${sessionId}`);
  }

  async getUsage() {
    return this.request<{ usage: UsageData }>('GET', '/api/account/usage');
  }

  async getOAuthConnections() {
    return this.request<{ connections: OAuthConnection[] }>('GET', '/api/account/oauth-connections');
  }

  async deleteAccount() {
    return this.request<{ success: boolean }>('DELETE', '/api/account');
  }

  // Billing
  async getBillingBalance() {
    return this.request<{ credits: number; tier: string }>('GET', '/api/billing/balance');
  }

  async getCreditPackages() {
    return this.request<{ packages: CreditPackage[] }>('GET', '/api/billing/packages');
  }

  async createCheckout(packageId: string) {
    return this.request<{ url: string }>('POST', '/api/billing/checkout', { packageId });
  }

  async createPortalSession() {
    return this.request<{ url: string }>('POST', '/api/billing/portal');
  }

  async getBillingHistory() {
    return this.request<{ transactions: CreditTransaction[] }>('GET', '/api/billing/history');
  }

  // GitHub Integration
  async getGitHubConnection() {
    return this.request<{ connected: boolean; username?: string; avatarUrl?: string; scope?: string; connectedAt?: string }>('GET', '/api/github/connection');
  }

  async getGitHubAuthUrl() {
    return this.request<{ url: string; state: string }>('GET', '/api/github/auth/url');
  }

  async getGitHubRepos() {
    return this.request<{ repos: GitHubRepo[] }>('GET', '/api/github/repos');
  }

  async disconnectGitHub() {
    return this.request<{ success: boolean }>('DELETE', '/api/github/connection');
  }

  // GitLab Integration
  async getGitLabConnection() {
    return this.request<{ connected: boolean; username?: string; avatarUrl?: string }>('GET', '/api/gitlab/connection');
  }

  async getGitLabAuthUrl() {
    return this.request<{ url: string; state: string }>('GET', '/api/gitlab/auth/url');
  }

  async getGitLabRepos() {
    return this.request<{ repos: GitHubRepo[] }>('GET', '/api/gitlab/repos');
  }

  async disconnectGitLab() {
    return this.request<{ success: boolean }>('DELETE', '/api/gitlab/connection');
  }

  // File upload
  async uploadFiles(projectId: string, files: FormData) {
    const res = await authenticatedFetch(`${API_URL}/api/projects/${projectId}/upload`, {
      method: 'POST',
      body: files,
      headers: {}, // Let browser set Content-Type for FormData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `Upload failed: ${res.status}`);
    }
    return res.json() as Promise<{ success: boolean; fileCount: number }>;
  }
}

export interface OAuthCatalogEntry {
  id: string;
  displayName: string;
  category: string;
  authType: string;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  status: 'idle' | 'building' | 'complete' | 'failed';
  engineSessionId: string | null;
  appSlug: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  publishedVersion: number;
  previewUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  image: string | null;
  slug: string | null;
  credits: number;
  tier: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface SessionInfo {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export interface UsageData {
  totalProjects: number;
  totalCreditsUsed: number;
  recentProjects: Array<{
    id: string;
    name: string;
    status: string;
    createdAt: string;
  }>;
  transactions: CreditTransaction[];
}

export interface OAuthConnection {
  id: string;
  providerId: string;
  accountId: string;
  createdAt: string;
}

export interface CreditPackage {
  id: string;
  credits: number;
  label: string;
  available: boolean;
}

export interface CreditTransaction {
  id: string;
  userId: string;
  type: string;
  amount: number;
  balance: number;
  description: string | null;
  projectId: string | null;
  stripeSessionId: string | null;
  createdAt: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  htmlUrl: string;
  defaultBranch: string;
  language: string | null;
  updatedAt: string;
}

export const apiClient = new ApiClient();
