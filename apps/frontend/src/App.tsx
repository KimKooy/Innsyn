import { TopBar } from '@/components/TopBar';

export function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      <main className="flex-1 p-8">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight">Velkommen til Innsyn</h1>
          <p className="mt-3 text-sm text-ink/70 leading-relaxed">
            3D-innsyn for punktskyer. Innloggings-flyt mot Entra ID kommer i M1 / steg 7,
            så snart IT har levert tenant-ID og client-ID for app-registreringen{' '}
            <code className="rounded bg-white px-1.5 py-0.5 text-xs text-ink">innsyn-dev</code>.
          </p>
          <div className="mt-6 rounded-lg border border-line bg-white p-4 text-sm">
            <p className="font-medium">Helsesjekk</p>
            <p className="mt-1 text-ink/60">
              Verifiser at backend kjører: <code>GET /api/health</code> (proxies til
              <code> http://localhost:3000</code>).
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
