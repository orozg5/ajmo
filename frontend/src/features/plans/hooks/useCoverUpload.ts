"use client";

import { useCallback, useState } from "react";

import { createPlanCoverUpload, createUserAvatarUpload } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";

export type UploadKind = "plan-cover" | "user-avatar";

export type UseSignedUploadReturn = {
  upload: (file: File) => Promise<{ path: string; publicUrl: string }>;
  progress: number;
  isUploading: boolean;
  error: string | null;
  reset: () => void;
};

export function useSignedUpload(kind: UploadKind): UseSignedUploadReturn {
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setProgress(0);
    setIsUploading(false);
    setError(null);
  }, []);

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      setProgress(0);
      setIsUploading(true);
      try {
        const signed =
          kind === "plan-cover"
            ? await createPlanCoverUpload(file.name)
            : await createUserAvatarUpload(file.name);

        const supabase = createClient();
        const { error: uploadError } = await supabase.storage
          .from(signed.bucket)
          .uploadToSignedUrl(signed.path, signed.token ?? "", file, {
            upsert: true,
            contentType: file.type || "application/octet-stream",
          });

        if (uploadError) throw new Error(uploadError.message);
        setProgress(100);
        return { path: signed.path, publicUrl: signed.public_url };
      } catch (uploadError) {
        const message =
          uploadError instanceof Error ? uploadError.message : "Upload failed";
        setError(message);
        throw uploadError;
      } finally {
        setIsUploading(false);
      }
    },
    [kind],
  );

  return { upload, progress, isUploading, error, reset };
}
