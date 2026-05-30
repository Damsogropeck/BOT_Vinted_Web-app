export type SearchRecord = {
  id: number;
  url: string;
  normalizedUrl: string;
  label: string;
  isActive: boolean;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  lastCheckAt: string | null;
};

export type ItemRecord = {
  itemId: string;
  searchId: number;
  searchLabel: string;
  title: string;
  price: string;
  brand: string;
  size: string;
  condition: string;
  imageUrl: string;
  itemUrl: string;
  detectedAt: string;
};

export type StatusRecord = {
  scheduler: {
    running: boolean;
    cycleInProgress: boolean;
    intervalMs: number;
    startedAt: string | null;
    lastRunAt: string | null;
    lastRunDurationMs: number | null;
    lastRunSearches: number;
    lastRunNewItems: number;
    totalNewItemsDetected: number;
    lastError: string | null;
  };
  counters: {
    searchesTotal: number;
    searchesActive: number;
    itemsTotal: number;
  };
  timestamp: string;
};

type ApiResponse<T> = {
  data: T;
};

const API_TOKEN = import.meta.env.VITE_API_TOKEN as string | undefined;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = ((init?.method ?? 'GET') as string).toUpperCase();
  const isMutation = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';

  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(isMutation && API_TOKEN ? {'Authorization': `Bearer ${API_TOKEN}`} : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `Erreur HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as {error?: string};
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // Ignore JSON parsing error for non-JSON responses
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = (await response.json()) as ApiResponse<T>;
  return payload.data;
}

export const api = {
  listSearches(): Promise<SearchRecord[]> {
    return request<SearchRecord[]>('/api/searches');
  },

  createSearch(payload: {url: string; label: string}): Promise<SearchRecord> {
    return request<SearchRecord>('/api/searches', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateSearch(id: number, patch: Partial<Pick<SearchRecord, 'url' | 'label' | 'isActive' | 'isPinned'>>): Promise<SearchRecord> {
    return request<SearchRecord>(`/api/searches/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  deleteSearch(id: number): Promise<void> {
    return request<void>(`/api/searches/${id}`, {
      method: 'DELETE',
    });
  },

  listItems(limit = 30): Promise<ItemRecord[]> {
    return request<ItemRecord[]>(`/api/items?limit=${limit}`);
  },

  getStatus(): Promise<StatusRecord> {
    return request<StatusRecord>('/api/status');
  },
};
