import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-medium text-neutral-400">404</p>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="max-w-sm text-sm text-neutral-500">
        The page you&apos;re looking for doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <Link href="/library" className="btn-primary mt-2">
        Go to your library
      </Link>
    </main>
  );
}
