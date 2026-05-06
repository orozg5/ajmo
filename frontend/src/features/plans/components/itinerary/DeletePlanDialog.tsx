"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deletePlan } from "@/lib/api";

type DeletePlanDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  planTitle: string;
  onDeleted: () => void;
};

export default function DeletePlanDialog({
  open,
  onOpenChange,
  planId,
  planTitle,
  onDeleted,
}: DeletePlanDialogProps) {
  const deleteMutation = useMutation({
    mutationFn: () => deletePlan(planId),
  });

  async function handleConfirm() {
    try {
      await deleteMutation.mutateAsync();
      onDeleted();
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't delete trip";
      toast.error(message);
    }
  }

  function handleOpenChange(next: boolean) {
    if (deleteMutation.isPending) return;
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this trip?</DialogTitle>
          <DialogDescription>
            This permanently deletes{" "}
            <span className="font-medium text-foreground">{planTitle}</span> and
            everything in it — days, items, hotels, destinations, comments. This
            can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />{" "}
                Deleting…
              </>
            ) : (
              "Delete trip"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
