"use client";

import Image from "next/image";
import { useRef } from "react";
import { useFormContext } from "react-hook-form";
import { ImagePlus, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { WizardValues } from "@/features/plans/components/wizard/schema";

type StepCoverImageProps = {
  localPreviewUrl: string | null;
  isUploading: boolean;
  uploadError: string | null;
  onFileSelected: (file: File) => void;
  onClear: () => void;
};

export default function StepCoverImage({
  localPreviewUrl,
  isUploading,
  uploadError,
  onFileSelected,
  onClear,
}: StepCoverImageProps) {
  const form = useFormContext<WizardValues>();
  const publicUrl = form.watch("cover_image_url") ?? null;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const previewSource = localPreviewUrl ?? publicUrl;

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h2 className="text-display-lg">Set a cover</h2>
        <p className="text-sm text-ink-subtle">A photo to anchor the trip. You can always change it later.</p>
      </div>

      <div className="relative aspect-[16/7] w-full overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/20 via-accent/20 to-secondary/20">
        {previewSource ? (
          <Image
            src={previewSource}
            alt="Plan cover preview"
            fill
            sizes="(max-width: 768px) 100vw, 640px"
            className="object-cover"
            unoptimized={previewSource.startsWith("blob:")}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-ink-subtle">
            <div className="flex flex-col items-center gap-2">
              <ImagePlus className="size-6" strokeWidth={1.5} />
              No cover yet
            </div>
          </div>
        )}
        {isUploading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 className="size-5 animate-spin" strokeWidth={1.5} />
          </div>
        ) : null}
        {previewSource && !isUploading ? (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-3 top-3 rounded-full bg-background/80 p-1 shadow-sm hover:bg-background"
            aria-label="Remove cover"
          >
            <X className="size-4" strokeWidth={1.5} />
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {previewSource ? "Replace image" : "Upload image"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileSelected(file);
            e.target.value = "";
          }}
        />
        <p className="text-xs text-ink-subtle">JPG, PNG, or WEBP. Up to 5 MB.</p>
      </div>

      {uploadError ? (
        <p className="text-sm text-destructive">{uploadError}</p>
      ) : null}
    </div>
  );
}
