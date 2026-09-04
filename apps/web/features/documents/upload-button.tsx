"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { uploadDocument } from "@/lib/documents";

export function UploadButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: uploadDocument,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  return (
    <div className="flex flex-col items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) mutation.mutate(file);
          e.target.value = "";
        }}
      />
      <button onClick={() => inputRef.current?.click()} disabled={mutation.isPending} className="btn-primary">
        {mutation.isPending ? "Uploading…" : "Upload PDF"}
      </button>
      {mutation.isError && <p className="text-sm text-red-500">{(mutation.error as Error).message}</p>}
    </div>
  );
}
