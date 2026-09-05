"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { register } from "@/lib/auth";
import { ApiError, NetworkError } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";

export function RegisterForm() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const mutation = useMutation({
    mutationFn: () => register(email, password, name),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken);
      router.push("/library");
    },
  });

  return (
    <form
      className="flex w-full max-w-sm flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium">
          Name (optional)
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input-field"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input-field"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input-field"
        />
        <span className="text-xs text-neutral-500">At least 8 characters.</span>
      </div>
      {mutation.isError && (
        <div className="flex items-center gap-2">
          <p className="text-sm text-red-500">
            {mutation.error instanceof ApiError || mutation.error instanceof NetworkError
              ? mutation.error.message
              : "Something went wrong"}
          </p>
          {mutation.error instanceof NetworkError && (
            <button
              type="button"
              onClick={() => mutation.mutate()}
              className="shrink-0 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Retry
            </button>
          )}
        </div>
      )}
      <button type="submit" disabled={mutation.isPending} className="btn-primary w-full">
        {mutation.isPending ? "Creating account…" : "Create account"}
      </button>
      <p className="text-sm text-neutral-500">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
