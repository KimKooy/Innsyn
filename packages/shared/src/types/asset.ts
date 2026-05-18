export type ScenePosition = {
  x: number;
  y: number;
  z: number;
};

export type AssetDTO = {
  id: string;
  sceneId: string;
  title: string;
  description: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  position: ScenePosition;
  uploadedBy: string;
  uploadedAt: string;
};

export type CreateAssetInput = {
  sceneId: string;
  title: string;
  description?: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  position: ScenePosition;
};

export type CreateAssetResponse = {
  asset: AssetDTO;
  /** Pre-signed URL the client uses to PUT the file contents directly to Blob. */
  uploadUrl: string;
  /** Headers the client must include on the PUT, e.g. x-ms-blob-type. */
  uploadHeaders: Record<string, string>;
};

export type AssetDownloadResponse = {
  url: string;
  expiresAt: string;
};
