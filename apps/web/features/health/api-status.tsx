"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/env";

interface HealthResponse {
  status: string;
  timestamp: string;
}

async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE_URL}/health`);
  if (!res.ok) throw new Error(`API responded with ${res.status}`);
  return res.json();
}

export function ApiStatus() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    retry: 1,
  });

  if (isLoading) {
    return <p className="text-sm text-neutral-500">Checking API connection…</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-red-500">
        API unreachable at {API_BASE_URL}. Is <code>pnpm dev:api</code> running?
      </p>
    );
  }

  return (
    <p className="text-sm text-green-600 dark:text-green-400">
      API connected — status: {data?.status} ({data?.timestamp})
    </p>
  );
}
