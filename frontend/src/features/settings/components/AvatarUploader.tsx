"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useSignedUpload } from "@/features/plans/hooks/useCoverUpload";

type AvatarUploaderProps = {
  value: string | null;
  onChange: (next: { url: string | null; path: string | null }) => void;
  fallbackLabel: string;
};

export default function AvatarUploader({ value, onChange, fallbackLabel }: AvatarUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
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

  function handleClear(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(null);
    onChange({ url: null, path: null });
    upload.reset();
  }

  function handleDrop(event: React.DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (upload.isUploading) return;
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("That doesn't look like an image file.");
      return;
    }
    handleFile(file);
  }

  const displayUrl = localPreviewUrl ?? value;
  const busy = upload.isUploading;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            if (!busy) fileInputRef.current?.click();
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (!busy && !isDragging) setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setIsDragging(false);
          }}
          onDrop={handleDrop}
          disabled={busy}
          aria-label={displayUrl ? "Change profile photo" : "Upload profile photo"}
          className={cn(
            "group relative block size-28 rounded-full outline-none transition-all duration-200",
            "ring-2 ring-border ring-offset-2 ring-offset-card",
            "hover:ring-primary/40 focus-visible:ring-primary",
            isDragging && "ring-4 ring-primary scale-[1.02]",
            busy && "cursor-wait",
          )}
        >
          <Avatar className="size-28">
            {displayUrl ? (
              <Image
                src={displayUrl}
                alt="Avatar preview"
                fill
                sizes="112px"
                className="rounded-full object-cover"
                unoptimized={displayUrl.startsWith("blob:")}
              />
            ) : (
              <AvatarFallback className="text-2xl font-semibold">{fallbackLabel}</AvatarFallback>
            )}
          </Avatar>

          <span
            className={cn(
              "pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full text-white transition-opacity duration-200",
              displayUrl
                ? "bg-black/45 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                : "bg-black/30 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
              isDragging && "opacity-100 bg-primary/20",
            )}
          >
            <Camera className="size-6" strokeWidth={1.5} />
            <span className="text-[11px] font-medium tracking-wide">
              {displayUrl ? "Change" : "Upload"}
            </span>
          </span>

          {busy ? (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-background/70 backdrop-blur-sm">
              <Loader2 className="size-6 animate-spin text-foreground" strokeWidth={1.5} />
            </span>
          ) : null}
        </button>

        {displayUrl && !busy ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleClear}
                aria-label="Remove photo"
                className={cn(
                  "absolute -right-1 -top-1 flex size-7 items-center justify-center rounded-full",
                  "border border-border bg-background text-ink-subtle shadow-sm",
                  "transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                )}
              >
                <X className="size-3.5" strokeWidth={2} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Remove photo</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      <p className="text-center text-xs text-ink-subtle">
        Click or drop an image · PNG, JPG, WEBP
      </p>

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

      {upload.error ? (
        <p className="text-center text-xs text-destructive">{upload.error}</p>
      ) : null}
    </div>
  );
}
