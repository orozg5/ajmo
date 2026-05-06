"use client";

import { useEffect, useRef } from "react";
import { Loader2, NotebookPen } from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { useDayNotes } from "@/features/plans/hooks/useDayNotes";
import { useEditingReporter } from "@/features/plans/hooks/useEditingReporter";
import EditingPresence from "@/features/plans/components/awareness/EditingPresence";

interface Props {
  dayId: string;
  initial: string | null;
  onPersist: (dayId: string, notes: string | null) => Promise<unknown>;
}

export default function DayNotesEditor({ dayId, initial, onPersist }: Props) {
  const { value, isSaving, handleChange } = useDayNotes({ dayId, initial, onPersist });
  const { reportFocus, reportBlur } = useEditingReporter("day_notes", dayId);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-subtle">
          <NotebookPen className="size-3.5" strokeWidth={1.5} />
          Day notes
        </div>
        <div className="flex items-center gap-2">
          <EditingPresence kind="day_notes" id={dayId} />
          {isSaving && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-ink-subtle">
              <Loader2 className="size-3 animate-spin" strokeWidth={1.5} />
              Saving…
            </span>
          )}
        </div>
      </div>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={reportFocus}
        onBlur={reportBlur}
        placeholder="What's the plan for this day? Any notes…"
        rows={2}
        className="min-h-[3rem] resize-none border-none bg-transparent px-2 py-1.5 text-sm shadow-none focus-visible:ring-0"
      />
    </div>
  );
}
