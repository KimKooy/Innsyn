import { useState } from 'react';
import type { CreateAssetInput, ScenePosition } from '@innsyn/shared';

type Props = {
  sceneId: string;
  position: ScenePosition;
  onCancel: () => void;
  onUpload: (
    input: Omit<CreateAssetInput, 'position' | 'fileName' | 'contentType' | 'sizeBytes'>,
    file: File,
  ) => Promise<void>;
};

export function AssetUploadModal({ sceneId, position, onCancel, onUpload }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onUpload(
        {
          sceneId,
          title: title.trim(),
          description: description.trim() || undefined,
        },
        file,
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
      <form
        onSubmit={submit}
        className="bg-white rounded-lg shadow-xl border border-line w-full max-w-md mx-4 p-5"
      >
        <h2 className="text-base font-semibold mb-3">Nytt asset</h2>
        <div className="text-xs text-ink/60 mb-4">
          Posisjon: x={position.x.toFixed(2)}, y={position.y.toFixed(2)}, z=
          {position.z.toFixed(2)}
        </div>
        <label className="block text-sm mb-3">
          <span className="text-ink/70">Tittel</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            autoFocus
            className="mt-1 w-full rounded border border-line px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="block text-sm mb-3">
          <span className="text-ink/70">Beskrivelse (valgfri)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={3}
            className="mt-1 w-full rounded border border-line px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="block text-sm mb-4">
          <span className="text-ink/70">Fil</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,application/acad,application/dxf,model/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
            className="mt-1 block w-full text-sm"
          />
        </label>
        {error && <div className="text-sm text-red-700 mb-3">Feil: {error}</div>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-3 py-2 rounded text-sm text-ink hover:bg-soft disabled:opacity-50"
          >
            Avbryt
          </button>
          <button
            type="submit"
            disabled={submitting || !file || !title.trim()}
            className="px-3 py-2 rounded text-sm font-medium bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? 'Laster opp…' : 'Last opp'}
          </button>
        </div>
      </form>
    </div>
  );
}
