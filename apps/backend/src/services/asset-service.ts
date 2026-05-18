import { randomUUID } from 'node:crypto';
import type { Asset } from '@prisma/client';
import type { AssetDTO, CreateAssetInput } from '@innsyn/shared';
import { prisma } from '~/lib/prisma';
import { NotFoundError } from '~/middleware/errors';
import {
  deleteBlob,
  signDownloadUrl,
  signUploadUrl,
  uploadHeaderHints,
} from './blob-service';

const MAX_FILE_BYTES = 200 * 1024 * 1024; // 200 MB per asset; tune later
const ALLOWED_TYPES = /^(image\/(jpeg|png|webp|gif)|application\/pdf|application\/(acad|dxf)|model\/.*)$/i;

function buildBlobPath(sceneId: string, fileName: string): string {
  // sceneId is a short identifier from the frontend registry — sanitise to
  // alphanumeric to keep blob paths predictable.
  const safeScene = sceneId.replace(/[^a-z0-9-_]/gi, '_');
  const safeName = fileName.replace(/[^a-z0-9._-]/gi, '_');
  return `${safeScene}/${randomUUID()}/${safeName}`;
}

function toDTO(asset: Asset): AssetDTO {
  return {
    id: asset.id,
    sceneId: asset.sceneId,
    title: asset.title,
    description: asset.description,
    fileName: asset.fileName,
    contentType: asset.contentType,
    sizeBytes: asset.sizeBytes,
    position: { x: asset.x, y: asset.y, z: asset.z },
    uploadedBy: asset.uploadedBy,
    uploadedAt: asset.uploadedAt.toISOString(),
  };
}

export async function createAsset(input: CreateAssetInput, uploaderUserId: string) {
  if (input.sizeBytes > MAX_FILE_BYTES) {
    throw new Error(`File exceeds maximum size of ${MAX_FILE_BYTES} bytes`);
  }
  if (!ALLOWED_TYPES.test(input.contentType)) {
    throw new Error(`Unsupported content type: ${input.contentType}`);
  }

  const blobPath = buildBlobPath(input.sceneId, input.fileName);
  const asset = await prisma.asset.create({
    data: {
      sceneId: input.sceneId,
      title: input.title,
      description: input.description ?? null,
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      blobPath,
      x: input.position.x,
      y: input.position.y,
      z: input.position.z,
      uploadedBy: uploaderUserId,
    },
  });

  const signed = signUploadUrl(blobPath, input.contentType);
  return {
    asset: toDTO(asset),
    uploadUrl: signed.url,
    uploadHeaders: {
      ...uploadHeaderHints,
      'content-type': input.contentType,
    },
  };
}

export async function listAssetsForScene(sceneId: string): Promise<AssetDTO[]> {
  const rows = await prisma.asset.findMany({
    where: { sceneId, deletedAt: null },
    orderBy: { uploadedAt: 'desc' },
  });
  return rows.map(toDTO);
}

export async function getDownloadUrl(assetId: string) {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, deletedAt: null },
  });
  if (!asset) throw new NotFoundError(`Asset ${assetId} not found`);
  const signed = signDownloadUrl(asset.blobPath);
  return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
}

export async function softDeleteAsset(assetId: string) {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, deletedAt: null },
  });
  if (!asset) throw new NotFoundError(`Asset ${assetId} not found`);
  // Soft-delete in DB; remove the blob immediately to free storage. The DB
  // row stays so audit can show who deleted what.
  await prisma.asset.update({
    where: { id: assetId },
    data: { deletedAt: new Date() },
  });
  await deleteBlob(asset.blobPath);
}
