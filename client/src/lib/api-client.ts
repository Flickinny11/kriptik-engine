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
  createdAt: string;
  updatedAt: string;
}

export const apiClient = new ApiClient();
