"use client";

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        className="w-full rounded-card border border-surface-border bg-surface/80 py-2.5 pr-9 pl-9 text-base outline-none placeholder:text-muted focus:border-accent"
      />
      {value && (
        <button onClick={() => onChange("")} aria-label="Clear search" className="absolute top-1/2 right-2 -translate-y-1/2 px-1.5 text-lg leading-none text-muted">×</button>
      )}
    </div>
  );
}
