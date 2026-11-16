// Read-only ClickUp API v2 client for the import (TechSpec 7.4). Personal token, import window only.

export interface ClickUpTask {
  id: string;
  name: string;
  text_content?: string | null;
  description?: string | null;
  status: { status: string; type?: string };
  date_created?: string;
  parent?: string | null;
  assignees?: Array<{ username?: string; email?: string }>;
  tags?: Array<{ name: string }>;
  custom_fields?: Array<{ name: string; type?: string; value?: unknown }>;
  list?: { id: string };
}

interface Named {
  id: string;
  name: string;
}

export type Fetcher = (url: string, init: { headers: Record<string, string> }) => Promise<Pick<Response, 'ok' | 'status' | 'json' | 'headers'>>;

export class ClickUpClient {
  constructor(
    private readonly token: string,
    private readonly fetcher: Fetcher = fetch,
    private readonly base = 'https://api.clickup.com/api/v2',
    private readonly sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  private async get<T>(path: string): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await this.fetcher(`${this.base}${path}`, { headers: { Authorization: this.token } });
      if (res.status === 429) {
        // ClickUp allows about 100 requests a minute per token.
        const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
        await this.sleep(Math.max(1000, Math.min(60_000, reset ? reset - Date.now() : 15_000)));
        continue;
      }
      if (!res.ok) throw new Error(`ClickUp ${path} failed with ${res.status}`);
      return (await res.json()) as T;
    }
    throw new Error(`ClickUp ${path}: still rate limited after retries`);
  }

  async spaces(teamId: string): Promise<Named[]> {
    return (await this.get<{ spaces: Named[] }>(`/team/${teamId}/space?archived=false`)).spaces;
  }

  async folders(spaceId: string): Promise<Array<Named & { lists: Named[] }>> {
    return (await this.get<{ folders: Array<Named & { lists: Named[] }> }>(`/space/${spaceId}/folder?archived=false`)).folders;
  }

  async folderlessLists(spaceId: string): Promise<Named[]> {
    return (await this.get<{ lists: Named[] }>(`/space/${spaceId}/list?archived=false`)).lists;
  }

  /** Every task in a list, open and closed, with subtasks; 100 per page. */
  async tasks(listId: string): Promise<ClickUpTask[]> {
    const out: ClickUpTask[] = [];
    for (let page = 0; page < 500; page++) {
      const res = await this.get<{ tasks: ClickUpTask[]; last_page?: boolean }>(
        `/list/${listId}/task?page=${page}&include_closed=true&subtasks=true&archived=false`,
      );
      out.push(...res.tasks);
      if (res.last_page !== false || res.tasks.length === 0) break;
    }
    return out;
  }
}
