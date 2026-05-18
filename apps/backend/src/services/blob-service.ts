import {
  BlobSASPermissions,
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob';
import { blobConfigured, config } from '~/lib/config';
import { ServiceUnavailableError } from '~/middleware/errors';

let cachedClient: { container: ReturnType<BlobServiceClient['getContainerClient']>; credential: StorageSharedKeyCredential } | null = null;

function requireClient() {
  if (!blobConfigured) {
    throw new ServiceUnavailableError(
      'Azure Blob er ikke konfigurert. Sett AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_ACCOUNT_KEY og AZURE_STORAGE_ACCOUNT_URL.',
    );
  }
  if (cachedClient) return cachedClient;
  // Non-null asserted because blobConfigured already proves all three are set.
  const credential = new StorageSharedKeyCredential(
    config.AZURE_STORAGE_ACCOUNT_NAME!,
    config.AZURE_STORAGE_ACCOUNT_KEY!,
  );
  const service = new BlobServiceClient(config.AZURE_STORAGE_ACCOUNT_URL!, credential);
  const container = service.getContainerClient(config.AZURE_STORAGE_CONTAINER);
  cachedClient = { container, credential };
  return cachedClient;
}

const UPLOAD_TTL_MINUTES = 15;
const DOWNLOAD_TTL_MINUTES = 60;

type SignedUrl = {
  url: string;
  expiresAt: Date;
};

export function signUploadUrl(blobPath: string, contentType: string): SignedUrl {
  const { container, credential } = requireClient();
  const now = Date.now();
  const expiresAt = new Date(now + UPLOAD_TTL_MINUTES * 60 * 1000);
  const sas = generateBlobSASQueryParameters(
    {
      containerName: config.AZURE_STORAGE_CONTAINER,
      blobName: blobPath,
      permissions: BlobSASPermissions.parse('cw'),
      startsOn: new Date(now - 60 * 1000),
      expiresOn: expiresAt,
      contentType,
    },
    credential,
  );
  const blobClient = container.getBlockBlobClient(blobPath);
  return { url: `${blobClient.url}?${sas.toString()}`, expiresAt };
}

export function signDownloadUrl(blobPath: string): SignedUrl {
  const { container, credential } = requireClient();
  const now = Date.now();
  const expiresAt = new Date(now + DOWNLOAD_TTL_MINUTES * 60 * 1000);
  const sas = generateBlobSASQueryParameters(
    {
      containerName: config.AZURE_STORAGE_CONTAINER,
      blobName: blobPath,
      permissions: BlobSASPermissions.parse('r'),
      startsOn: new Date(now - 60 * 1000),
      expiresOn: expiresAt,
    },
    credential,
  );
  const blobClient = container.getBlobClient(blobPath);
  return { url: `${blobClient.url}?${sas.toString()}`, expiresAt };
}

export async function deleteBlob(blobPath: string): Promise<void> {
  const { container } = requireClient();
  const blobClient = container.getBlobClient(blobPath);
  await blobClient.deleteIfExists();
}

export const uploadHeaderHints = {
  'x-ms-blob-type': 'BlockBlob',
};
