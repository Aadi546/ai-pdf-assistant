import Link from "next/link";
import { ApiStatus } from "@/features/health/api-status";
import { ThemeToggle } from "@/features/theme/theme-toggle";

const FEATURES = [
  {
    icon: (
      <path d="M4 4a2 2 0 0 1 2-2h6.5L16 5.5V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Zm8-1v3.5h3.5" />
    ),
    title: "Continuous reading",
    body: "Scroll straight through any PDF — no page-by-page clicking, no losing your place.",
  },
  {
    icon: (
      <path d="M10 2a6 6 0 0 0-6 6c0 2.4 1.4 4 2.4 5 .5.5.6 1 .6 1.5V16a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1.5c0-.5.1-1 .6-1.5 1-.1 2.4-2.6 2.4-5a6 6 0 0 0-6-6ZM8 18h4" />
    ),
    title: "Ask, don't search",
    body: "Chat with the document itself — answers are grounded in exactly what's on the page, cited by page number.",
  },
  {
    icon: (
      <path d="M10 12.5a3 3 0 0 0 3-3v-4a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3ZM5.5 9a4.5 4.5 0 0 0 9 0M10 14.5V17m-2 0h4" />
    ),
    title: "Talk instead of type",
    body: "Ask by voice, and hear replies read back automatically — a real study partner, not another chat window.",
  },
];

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center px-6 py-8">
      <div className="flex w-full max-w-5xl items-center justify-between">
        <span className="text-sm font-semibold tracking-tight">
          <span className="brand-mark">AI PDF</span> Study Companion
        </span>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
            Sign in
          </Link>
          <ThemeToggle />
        </div>
      </div>

      <section className="flex w-full max-w-3xl flex-col items-center gap-5 py-20 text-center">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Read any PDF with an <span className="brand-mark">AI study partner</span> beside you
        </h1>
        <p className="max-w-xl text-neutral-500">
          Upload a PDF, scroll through it naturally, and ask questions out loud — grounded strictly in what the
          document actually says, with a voice that talks back.
        </p>
        <div className="mt-2 flex gap-3">
          <Link href="/register" className="btn-primary px-6 py-2.5 text-base">
            Get started
          </Link>
          <Link href="/login" className="btn-ghost px-6 py-2.5 text-base">
            Sign in
          </Link>
        </div>
        <div className="mt-1">
          <ApiStatus />
        </div>
      </section>

      <section className="grid w-full max-w-4xl grid-cols-1 gap-4 pb-16 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="card flex flex-col items-start gap-3 px-5 py-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 text-white">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
                {f.icon}
              </svg>
            </div>
            <h3 className="text-sm font-semibold">{f.title}</h3>
            <p className="text-sm text-neutral-500">{f.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
