/** A pulsing placeholder block — sized via className, e.g. `<Skeleton className="h-4 w-32" />`. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800 ${className}`} />;
}
