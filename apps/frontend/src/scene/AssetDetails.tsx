import { useEffect, useState } from 'react';
import type { AssetDTO } from '@innsyn/shared';
import { useAccount } from '@/auth/useAccount';
import { getDownloadUrl } from './asset-api';

type Props = {
  asset: AssetDTO;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
};

function isImage(contentType: string) {
  return contentType.startsWith('image/');
}

function isPdf(contentType: string) {
  return contentType === 'application/pdf';
}

export function AssetDetails({ asset, onClose, onDelete }: Props) {
  const { acquireToken } = useAccount();
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDownloadUrl(null);
    setError(null);
    void (async () => {
      try {
        const token = await acquireToken();
        const res = await getDownloadUrl(asset.id, token);
        if (!cancelled) setDownloadUrl(res.url);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset.id, acquireToken]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <aside className="absolute bottom-3 right-3 z-10 w-72 max-h-[calc(100vh-7rem)] flex flex-col rounded-lg bg-white shadow-md border border-line">
      <header className="px-3 py-2 border-b border-line flex items-center justify-between">
        <span className="text-sm font-semibold truncate" title={asset.title}>
          {asset.title}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Lukk panel"
          className="text-ink/70 hover:text-ink"
        >
          ✕
        </button>
      </header>
      <div className="overflow-y-auto p-3 text-sm space-y-2">
        {asset.description && <p className="text-ink/80">{asset.description}</p>}
        <div className="text-xs text-ink/60 space-y-0.5">
          <div>Filnavn: {asset.fileName}</div>
          <div>Type: {asset.contentType}</div>
          <div>Størrelse: {(asset.sizeBytes / 1024).toFixed(1)} KB</div>
          <div>
            Posisjon: x={asset.position.x.toFixed(2)}, y={asset.position.y.toFixed(2)}, z=
            {asset.position.z.toFixed(2)}
          </div>
          <div>Lastet opp: {new Date(asset.uploadedAt).toLocaleString('no-NO')}</div>
        </div>
        {error && <div className="text-xs text-red-700">Kan ikke hente fil: {error}</div>}
        {downloadUrl && isImage(asset.contentType) && (
          <img
            src={downloadUrl}
            alt={asset.title}
            className="w-full rounded border border-line"
          />
        )}
        {downloadUrl && !isImage(asset.contentType) && (
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="block rounded bg-soft px-3 py-2 text-sm text-primary hover:underline"
          >
            {isPdf(asset.contentType) ? 'Åpne PDF i ny fane' : 'Last ned fil'}
          </a>
        )}
      </div>
      <footer className="border-t border-line px-3 py-2 flex justify-between">
        <button
          type="button"
          onClick={() => onDelete(asset.id)}
          className="text-xs text-ink/70 hover:text-red-700"
        >
          Slett asset
        </button>
      </footer>
    </aside>
  );
}
