const LoadingState = ({ label = 'Loading', compact = false }) => (
  <div className={`flex items-center justify-center gap-3 text-slate-400 ${compact ? 'py-2' : 'min-h-56'}`}>
    <span className="relative flex h-6 w-6 items-center justify-center" aria-hidden="true">
      <span className="absolute h-6 w-6 animate-ping rounded-full border border-sky-400/50" />
      <span className="h-3 w-3 animate-pulse rounded-full bg-sky-400" />
    </span>
    <span className="text-sm">{label}...</span>
  </div>
);

export default LoadingState;