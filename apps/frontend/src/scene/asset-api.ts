import type {
  AssetDTO,
  AssetDownloadResponse,
  CreateAssetInput,
  CreateAssetResponse,
} from '@innsyn/shared';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiFetch<T>(
  path: string,
  init: RequestInit | undefined,
  token: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init?.headers as Record<string, string> | undefined) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api${path}`, { ...init, headers });
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body?.error?.message ?? '';
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new ApiError(res.status, detail || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function listAssetsForScene(
  sceneId: string,
  token: string | null,
): Promise<{ assets: AssetDTO[] }> {
  return apiFetch(`/assets/scene/${encodeURIComponent(sceneId)}`, undefined, token);
}

export function createAsset(
  input: CreateAssetInput,
  token: string | null,
): Promise<CreateAssetResponse> {
  return apiFetch('/assets', { method: 'POST', body: JSON.stringify(input) }, token);
}

export function finalizeAsset(
  assetId: string,
  token: string | null,
): Promise<{ asset: AssetDTO }> {
  return apiFetch(
    `/assets/${encodeURIComponent(assetId)}/finalize`,
    { method: 'POST' },
    token,
  );
}

export function getDownloadUrl(
  assetId: string,
  token: string | null,
): Promise<AssetDownloadResponse> {
  return apiFetch(`/assets/${encodeURIComponent(assetId)}/download-url`, undefined, token);
}

export function deleteAsset(assetId: string, token: string | null): Promise<void> {
  return apiFetch(`/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' }, token);
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
