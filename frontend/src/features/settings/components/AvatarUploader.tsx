"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useSignedUpload } from "@/features/plans/hooks/useCoverUpload";

type AvatarUploaderProps = {
  value: string | null;
  onChange: (next: { url: string | null; path: string | null }) => void;
  fallbackLabel: string;
};

export default function AvatarUploader({ value, onChange, fallbackLabel }: AvatarUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const upload = useSignedUpload("user-avatar");

  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  async function handleFile(file: File) {
    const preview = URL.createObjectURL(file);
    setLocalPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return preview;
    });
    try {
      const result = await upload.upload(file);
      onChange({ url: result.publicUrl, path: result.path });
    } catch {
      toast.error("Couldn't upload your avatar. Try again?");
    }
  }

  function handleClear() {
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(null);
    onChange({ url: null, path: null });
    upload.reset();
  }

  const displayUrl = localPreviewUrl ?? value;

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <Avatar className="size-20">
          {displayUrl ? (
            <Image
              src={displayUrl}
              alt="Avatar preview"
              fill
              sizes="80px"
              className="rounded-full object-cover"
              unoptimized={displayUrl.startsWith("blob:")}
            />
          ) : (
            <AvatarFallback className="text-base font-semibold">{fallbackLabel}</AvatarFallback>
          )}
        </Avatar>
        {upload.isUploading ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60">
            <Loader2 className="size-5 animate-spin" strokeWidth={1.5} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={upload.isUploading}
          >
            <ImagePlus className="size-4" strokeWidth={1.5} />
            {displayUrl ? "Replace" : "Upload"}
          </Button>
          {displayUrl ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={upload.isUploading}
            >
              <X className="size-4" strokeWidth={1.5} />
              Remove
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-ink-subtle">JPG, PNG, or WEBP. Square crops best.</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
            event.target.value = "";
          }}
        />
        {upload.error ? <p className="text-xs text-destructive">{upload.error}</p> : null}
      </div>
    </div>
  );
}
