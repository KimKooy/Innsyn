export function TopBar() {
  return (
    <header className="bg-white border-b border-line h-14 flex items-center px-6 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="inline-block h-3 w-3 rounded-full bg-primary" aria-hidden />
        <span className="text-lg font-semibold tracking-tight">Innsyn</span>
      </div>
      <div className="ml-auto text-sm text-ink/60">Ikke pålogget</div>
    </header>
  );
}
