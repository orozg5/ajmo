"use client";

import { useState } from "react";
import { StickyNote } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  onSave: (title: string, body: string | null) => Promise<void>;
}

export default function AddNoteInline({ onSave }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  function handleCancel() {
    setTitle("");
    setBody("");
    setIsOpen(false);
  }

  async function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    const trimmedBody = body.trim();
    setIsSaving(true);
    try {
      await onSave(trimmedTitle, trimmedBody === "" ? null : trimmedBody);
      setTitle("");
      setBody("");
      setIsOpen(false);
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) {
    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setIsOpen(true)}
        className="text-ink-subtle hover:text-ink"
      >
        <StickyNote className="size-4" strokeWidth={1.5} />
        Add note
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
      <Input
        placeholder="Note title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        autoFocus
        autoComplete="off"
      />
      <Textarea
        placeholder="Details (optional)"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={2}
        className="resize-none text-sm"
      />
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={handleCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={isSaving || !title.trim()}>
          Save note
        </Button>
      </div>
    </div>
  );
}
