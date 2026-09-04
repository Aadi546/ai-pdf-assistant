"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { clearAiConfig, getAiConfigStatus, setAiConfig } from "@/lib/ai-config";

export function AiConfigForm() {
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["ai-config-status"], queryFn: getAiConfigStatus });

  const saveMutation = useMutation({
    mutationFn: () => setAiConfig(apiKey),
    onSuccess: () => {
      setApiKey("");
      queryClient.invalidateQueries({ queryKey: ["ai-config-status"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: clearAiConfig,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-config-status"] }),
  });

  if (isLoading) return <p className="text-sm text-neutral-500">Checking…</p>;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Gemini API key</h2>
        <p className="text-sm text-neutral-500">
          The AI study partner uses your own Gemini key — get one free at{" "}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            aistudio.google.com/apikey
          </a>
          . Never stored permanently — it lives in your session and expires after 24 hours.
        </p>
      </div>

      <p className="text-sm">
        Status:{" "}
        {data?.configured ? (
          <span className="text-green-600 dark:text-green-400">Configured</span>
        ) : (
          <span className="text-neutral-500">Not configured</span>
        )}
      </p>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          saveMutation.mutate();
        }}
      >
        <input
          type="password"
          autoComplete="off"
          placeholder="AIzaSy…"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="input-field"
        />
        {saveMutation.isError && <p className="text-sm text-red-500">{(saveMutation.error as Error).message}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={!apiKey || saveMutation.isPending} className="btn-primary">
            {saveMutation.isPending ? "Validating…" : "Save key"}
          </button>
          {data?.configured && (
            <button
              type="button"
              onClick={() => removeMutation.mutate()}
              disabled={removeMutation.isPending}
              className="btn-ghost"
            >
              Remove key
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
