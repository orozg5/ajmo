"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type DestinationResponse,
  type Plan,
  createDestination,
  deleteDestination,
  updateDestination,
  updatePlan,
} from "@/lib/api";
import EditPlanDangerTab from "@/features/plans/components/itinerary/EditPlanDangerTab";
import EditPlanDestinationsTab, {
  buildDiff,
  destinationsToRows,
} from "@/features/plans/components/itinerary/EditPlanDestinationsTab";
import EditPlanGeneralTab, {
  buildPatch,
  defaultsFromPlan,
  generalSchema,
  type GeneralValues,
} from "@/features/plans/components/itinerary/EditPlanGeneralTab";
import { useSignedUpload } from "@/features/plans/hooks/useCoverUpload";
import {
  useDestinations,
  validateRowsForSubmit,
} from "@/features/plans/hooks/useDestinations";

type EditPlanDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: Plan;
  destinations: DestinationResponse[];
};

export default function EditPlanDialog({
  open,
  onOpenChange,
  plan,
  destinations,
}: EditPlanDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<string>("general");

  const initialValues = useMemo(() => defaultsFromPlan(plan), [plan]);
  const initialRows = useMemo(() => destinationsToRows(destinations), [destinations]);

  const form = useForm<GeneralValues>({
    resolver: zodResolver(generalSchema),
    defaultValues: initialValues,
    mode: "onBlur",
  });

  const { rows, addRow, removeRow, updateRow, resetRows } = useDestinations(initialRows);
  const [destinationsError, setDestinationsError] = useState<string | null>(null);

  const dateFrom = form.watch("date_from") ?? "";
  const dateTo = form.watch("date_to") ?? "";

  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const coverUpload = useSignedUpload("plan-cover");

  useEffect(() => {
    if (!open) return;
    setTab("general");
    form.reset(initialValues);
    resetRows(initialRows);
    setDestinationsError(null);
    setLocalPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    coverUpload.reset();
    // form/coverUpload/resetRows identities are stable; depending on them would loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialValues, initialRows]);

  async function handleFileSelected(file: File) {
    const previewUrl = URL.createObjectURL(file);
    setLocalPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return previewUrl;
    });

    try {
      const result = await coverUpload.upload(file);
      form.setValue("cover_image_path", result.path, { shouldDirty: true });
      form.setValue("cover_image_url", result.publicUrl, { shouldDirty: true });
    } catch {
      toast.error("Couldn't upload the cover. Try again?");
    }
  }

  function handleClearCover() {
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(null);
    form.setValue("cover_image_path", "", { shouldDirty: true });
    form.setValue("cover_image_url", "", { shouldDirty: true });
    coverUpload.reset();
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const current = form.getValues();
      const patch = buildPatch(initialValues, current);
      const generalChanged = Object.keys(patch).length > 0;
      if (generalChanged) {
        await updatePlan(plan.id, patch);
      }

      const diff = buildDiff(destinations, rows);
      const ops: Promise<unknown>[] = [
        ...diff.toDelete.map((dest) => deleteDestination(plan.id, dest.id)),
        ...diff.toUpdate.map((entry) =>
          updateDestination(plan.id, entry.row.id, {
            country: entry.row.country.trim(),
            city: entry.row.city.trim(),
            sort_order: entry.sortOrder,
            day_numbers: entry.row.dayNumbers,
          }),
        ),
        ...diff.toCreate.map((entry) =>
          createDestination(plan.id, {
            country: entry.row.country.trim(),
            city: entry.row.city.trim(),
            sort_order: entry.sortOrder,
            day_numbers: entry.row.dayNumbers,
          }),
        ),
      ];
      const destinationsChanged = ops.length > 0;
      if (destinationsChanged) {
        await Promise.all(ops);
      }

      return { generalChanged, destinationsChanged };
    },
  });

  async function handleSave() {
    const valid = await form.trigger();
    if (!valid) {
      setTab("general");
      return;
    }
    const validation = validateRowsForSubmit(rows);
    if (!validation.ok) {
      setDestinationsError(validation.error ?? null);
      setTab("destinations");
      return;
    }
    setDestinationsError(null);

    try {
      const result = await saveMutation.mutateAsync();
      if (result.generalChanged || result.destinationsChanged) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["plans"] }),
          queryClient.invalidateQueries({ queryKey: ["plan-itinerary", plan.id] }),
        ]);
        router.refresh();
        toast.success("Trip updated");
      }
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't update trip";
      toast.error(message);
    }
  }

  const showSaveButton = tab !== "danger";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit trip</DialogTitle>
          <DialogDescription>
            Manage everything about this trip in one place.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="destinations">Destinations</TabsTrigger>
            <TabsTrigger value="danger">Danger zone</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="pt-4">
            <EditPlanGeneralTab
              form={form}
              localPreviewUrl={localPreviewUrl}
              coverUploading={coverUpload.isUploading}
              coverError={coverUpload.error}
              onFileSelected={handleFileSelected}
              onClearCover={handleClearCover}
            />
          </TabsContent>

          <TabsContent value="destinations" className="pt-4">
            <EditPlanDestinationsTab
              rows={rows}
              dateFrom={dateFrom}
              dateTo={dateTo}
              error={destinationsError}
              onAddRow={addRow}
              onRemoveRow={removeRow}
              onUpdateRow={updateRow}
            />
          </TabsContent>

          <TabsContent value="danger" className="pt-4">
            <EditPlanDangerTab planId={plan.id} planTitle={plan.title} />
          </TabsContent>
        </Tabs>

        {showSaveButton && (
          <DialogFooter>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending || coverUpload.isUploading}
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" strokeWidth={1.5} /> Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
