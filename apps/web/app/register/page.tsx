import { RegisterForm } from "@/features/auth/register-form";
import { ThemeToggle } from "@/features/theme/theme-toggle";

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="fixed right-6 top-6">
        <ThemeToggle />
      </div>
      <div className="card flex w-full max-w-sm flex-col items-center gap-6 px-8 py-10">
        <h1 className="text-xl font-semibold tracking-tight">
          Create your <span className="brand-mark">AI PDF</span> account
        </h1>
        <RegisterForm />
      </div>
    </main>
  );
}
