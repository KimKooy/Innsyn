import type {
  AssetDTO,
  AssetDownloadResponse,
  CreateAssetInput,
  CreateAssetResponse,
} from '@innsyn/shared';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error?.message ?? '';
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new ApiError(res.status, detail || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function listAssetsForScene(sceneId: string): Promise<{ assets: AssetDTO[] }> {
  return apiFetch(`/assets/scene/${encodeURIComponent(sceneId)}`);
}

export function createAsset(input: CreateAssetInput): Promise<CreateAssetResponse> {
  return apiFetch('/assets', { method: 'POST', body: JSON.stringify(input) });
}

export function getDownloadUrl(assetId: string): Promise<AssetDownloadResponse> {
  return apiFetch(`/assets/${encodeURIComponent(assetId)}/download-url`);
}

export function deleteAsset(assetId: string): Promise<void> {
  return apiFetch(`/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' });
}

/** PUT the file bytes directly to Azure Blob using the presigned URL the backend issued. */
export async function uploadToBlob(
  url: string,
  headers: Record<string, string>,
  file: File,
): Promise<void> {
  const res = await fetch(url, {
    method: 'PUT',
    headers,
    body: file,
  });
  if (!res.ok) {
    throw new Error(`Blob upload failed: HTTP ${res.status} ${res.statusText}`);
  }
}
