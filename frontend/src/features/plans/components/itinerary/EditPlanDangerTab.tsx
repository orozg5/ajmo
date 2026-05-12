"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { deletePlan } from "@/lib/api";
import { useOnlineStatus } from "@/lib/offline/useOnlineStatus";

type EditPlanDangerTabProps = {
  planId: string;
  planTitle: string;
};

export default function EditPlanDangerTab({ planId, planTitle }: EditPlanDangerTabProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const { online } = useOnlineStatus();

  const deleteMutation = useMutation({
    mutationFn: () => deletePlan(planId),
  });

  async function handleConfirm() {
    try {
      await deleteMutation.mutateAsync();
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      toast.success("Trip deleted");
      router.push("/");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't delete trip";
      toast.error(message);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5">
        <h3 className="text-base font-semibold text-foreground">Delete this trip</h3>
        <p className="mt-1 text-sm text-ink-subtle">
          This permanently removes{" "}
          <span className="font-medium text-foreground">{planTitle}</span> and
          everything in it — days, items, hotels, destinations, comments. This
          can&apos;t be undone.
        </p>

        {confirming ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <p className="flex-1 text-sm text-foreground">
              Are you absolutely sure?
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirming(false)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirm}
              disabled={deleteMutation.isPending || !online}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" strokeWidth={1.5} /> Deleting…
                </>
              ) : (
                "Yes, delete trip"
              )}
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirming(true)}
              disabled={!online}
            >
              <Trash2 className="size-4" strokeWidth={1.5} />
              Delete trip
            </Button>
            {!online && (
              <p className="text-xs text-ink-subtle">
                You need to be online to delete a trip.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
