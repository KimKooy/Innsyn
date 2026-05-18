import { randomUUID } from 'node:crypto';
import type { Asset } from '@prisma/client';
import type { AssetDTO, CreateAssetInput } from '@innsyn/shared';
import { prisma } from '~/lib/prisma';
import { ForbiddenError, NotFoundError, ValidationError } from '~/middleware/errors';
import {
  deleteBlob,
  signDownloadUrl,
  signUploadUrl,
  uploadHeaderHints,
} from './blob-service';

// 200 MB per asset. BigInt comparisons keep us future-proof.
export const MAX_FILE_BYTES = 200n * 1024n * 1024n;

// Explicit MIME allowlist — regex is too easy to bypass with parameters
// (e.g. "model/anything; charset=evil"). We strip parameters and lowercase
// before matching against this Set.
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/x-dwg',
  'image/vnd.dwg',
  'application/dxf',
  'model/gltf-binary',
  'model/gltf+json',
]);

function normalizeContentType(raw: string): string {
  // Strip parameters (e.g. "; charset=utf-8") and trim.
  const semi = raw.indexOf(';');
  return (semi >= 0 ? raw.slice(0, semi) : raw).trim().toLowerCase();
}

function buildBlobPath(sceneId: string, fileName: string): string {
  // sceneId is short, alphanumeric-ish from the frontend registry. Sanitize
  // so we never embed user-controllable path traversal segments.
  const safeScene = sceneId.replace(/[^a-z0-9-_]/gi, '_');
  const safeName = fileName.replace(/[^a-z0-9._-]/gi, '_');
  return `${safeScene}/${randomUUID()}/${safeName}`;
}

function toDTO(asset: Asset): AssetDTO {
  // sizeBytes is BigInt in the DB; cap is 200 MB so Number is lossless.
  // uploadedAt is null for rows still pending blob upload — we don't expose
  // those, so callers guarantee it's set.
  return {
    id: asset.id,
    sceneId: asset.sceneId,
    title: asset.title,
    description: asset.description,
    fileName: asset.fileName,
    contentType: asset.contentType,
    sizeBytes: Number(asset.sizeBytes),
    position: { x: asset.x, y: asset.y, z: asset.z },
    uploadedBy: asset.uploadedBy,
    uploadedAt: (asset.uploadedAt ?? asset.createdAt).toISOString(),
  };
}

/**
 * Access-control hook point. Today every authenticated user can view every
 * scene's assets — group-based restrictions land in M5 (GroupMembership +
 * SceneGroupAccess tables). Concentrating the check here means the routes
 * don't need to change when M5 lands.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function assertUserCanAccessScene(_userId: string, _sceneId: string): Promise<void> {
  return;
}

export async function createAsset(input: CreateAssetInput, uploaderUserId: string) {
  const sizeBytes = BigInt(input.sizeBytes);
  if (sizeBytes <= 0n) {
    throw new ValidationError('sizeBytes must be positive');
  }
  if (sizeBytes > MAX_FILE_BYTES) {
    throw new ValidationError(`File exceeds maximum size of ${MAX_FILE_BYTES} bytes`);
  }
  const contentType = normalizeContentType(input.contentType);
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new ValidationError(`Unsupported content type: ${input.contentType}`);
  }
  await assertUserCanAccessScene(uploaderUserId, input.sceneId);

  const blobPath = buildBlobPath(input.sceneId, input.fileName);
  const asset = await prisma.asset.create({
    data: {
      sceneId: input.sceneId,
      title: input.title,
      description: input.description ?? null,
      fileName: input.fileName,
      contentType,
      sizeBytes,
      blobPath,
      x: input.position.x,
      y: input.position.y,
      z: input.position.z,
      uploadedBy: uploaderUserId,
    },
  });

  const signed = signUploadUrl(blobPath, contentType);
  return {
    asset: toDTO(asset),
    uploadUrl: signed.url,
    uploadHeaders: {
      ...uploadHeaderHints,
      'content-type': contentType,
    },
  };
}

export async function finalizeAsset(assetId: string, userId: string) {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, deletedAt: null },
  });
  if (!asset) throw new NotFoundError(`Asset ${assetId} not found`);
  if (asset.uploadedBy !== userId) {
    throw new ForbiddenError('Only the uploader can finalize this asset');
  }
  if (asset.uploadedAt) return toDTO(asset);
  const updated = await prisma.asset.update({
    where: { id: assetId },
    data: { uploadedAt: new Date() },
  });
  return toDTO(updated);
}

export async function listAssetsForScene(sceneId: string, userId: string): Promise<AssetDTO[]> {
  await assertUserCanAccessScene(userId, sceneId);
  const rows = await prisma.asset.findMany({
    where: { sceneId, deletedAt: null, uploadedAt: { not: null } },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toDTO);
}

export async function getDownloadUrl(assetId: string, userId: string) {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, deletedAt: null, uploadedAt: { not: null } },
  });
  if (!asset) throw new NotFoundError(`Asset ${assetId} not found`);
  await assertUserCanAccessScene(userId, asset.sceneId);
  const signed = signDownloadUrl(asset.blobPath);
  return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
}

export async function softDeleteAsset(assetId: string, userId: string) {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, deletedAt: null },
  });
  if (!asset) throw new NotFoundError(`Asset ${assetId} not found`);
  if (asset.uploadedBy !== userId) {
    // Tighten in M5 with admin role check. For now: uploader only.
    throw new ForbiddenError('Only the uploader can delete this asset');
  }
  await prisma.asset.update({
    where: { id: assetId },
    data: { deletedAt: new Date() },
  });
  // Remove the blob immediately to free storage. The DB row stays for audit.
  // If the blob delete fails, the row is still soft-deleted — a sweep job can
  // retry later. We don't throw on partial failure since the asset is gone
  // from the user's perspective.
  await deleteBlob(asset.blobPath);
}
