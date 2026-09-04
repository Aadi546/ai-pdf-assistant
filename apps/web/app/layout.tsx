import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "AI PDF Study Companion",
  description: "Read any PDF with an AI study partner beside you.",
};

// Applies the saved/system theme before first paint so there's no flash of
// the wrong mode on load.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('ai-pdf:theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_800px_500px_at_15%_-10%,rgba(99,102,241,0.12),transparent_60%),radial-gradient(ellipse_700px_500px_at_100%_10%,rgba(6,182,212,0.10),transparent_60%)] dark:bg-[radial-gradient(ellipse_800px_500px_at_15%_-10%,rgba(99,102,241,0.18),transparent_60%),radial-gradient(ellipse_700px_500px_at_100%_10%,rgba(6,182,212,0.14),transparent_60%)]"
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
