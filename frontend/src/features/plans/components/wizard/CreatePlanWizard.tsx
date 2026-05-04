"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createDestination, createPlan } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useDestinations } from "@/features/plans/hooks/useDestinations";
import { useSignedUpload } from "@/features/plans/hooks/useCoverUpload";
import StepCoverImage from "@/features/plans/components/wizard/StepCoverImage";
import StepDestinations from "@/features/plans/components/wizard/StepDestinations";
import StepReview from "@/features/plans/components/wizard/StepReview";
import StepTitleDates from "@/features/plans/components/wizard/StepTitleDates";
import {
  type WizardValues,
  wizardSchema,
} from "@/features/plans/components/wizard/schema";

const STEPS = ["Trip", "Destinations", "Cover", "Review"] as const;

export default function CreatePlanWizard() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [tempCoverPath, setTempCoverPath] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);

  const form = useForm<WizardValues>({
    resolver: zodResolver(wizardSchema),
    defaultValues: {
      title: "",
      description: "",
      date_from: "",
      date_to: "",
      cover_image_path: undefined,
      cover_image_url: undefined,
    },
    mode: "onBlur",
  });

  const destinationsController = useDestinations();
  const { destinations } = destinationsController;

  const coverUpload = useSignedUpload("plan-cover");

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
      setTempCoverPath(result.path);
    } catch {
      toast.error("Couldn't upload the cover. Try again?");
    }
  }

  function handleClearCover() {
    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(null);
    setTempCoverPath(null);
    form.setValue("cover_image_path", undefined);
    form.setValue("cover_image_url", undefined);
    coverUpload.reset();
  }

  const submitMutation = useMutation({ mutationFn: createPlan });

  async function handleNext() {
    if (stepIndex === 0) {
      const ok = await form.trigger(["title"]);
      if (!ok) return;
    }
    if (stepIndex === 1 && destinations.length === 0) {
      toast.error("Add at least one destination to continue.");
      return;
    }
    setDirection(1);
    setStepIndex((index) => Math.min(index + 1, STEPS.length - 1));
  }

  function handleBack() {
    setDirection(-1);
    setStepIndex((index) => Math.max(index - 1, 0));
  }

  async function handleSubmit() {
    const values = form.getValues();
    try {
      const plan = await submitMutation.mutateAsync({
        title: values.title,
        description: values.description || undefined,
        date_from: values.date_from || undefined,
        date_to: values.date_to || undefined,
        cover_image_path: values.cover_image_path,
        cover_image_url: values.cover_image_url,
      });

      for (let i = 0; i < destinations.length; i++) {
        await createDestination(plan.id, {
          country: destinations[i].country,
          city: destinations[i].city,
          sort_order: i,
          day_numbers: destinations[i].dayNumbers,
        });
      }

      toast.success("Trip created");
      router.push(`/plans/${plan.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create trip";
      toast.error(message);
    }
  }

  const variants = useMemo(() => {
    const offset = reducedMotion ? 0 : 24;
    return {
      enter: (dir: 1 | -1) => ({ x: dir * offset, opacity: 0 }),
      center: { x: 0, opacity: 1 },
      exit: (dir: 1 | -1) => ({ x: -dir * offset, opacity: 0 }),
    };
  }, [reducedMotion]);

  const currentStep = STEPS[stepIndex];

  return (
    <div className="mx-auto w-full max-w-xl space-y-8 py-10">
      <ol className="flex items-center gap-2" aria-label="Wizard progress">
        {STEPS.map((label, index) => {
          const state =
            index < stepIndex ? "complete" : index === stepIndex ? "current" : "upcoming";
          return (
            <li key={label} className="flex flex-1 items-center gap-2">
              <div
                className={cn(
                  "flex size-7 items-center justify-center rounded-full border text-xs font-semibold",
                  state === "complete" && "border-primary bg-primary text-primary-foreground",
                  state === "current" && "border-primary text-primary",
                  state === "upcoming" && "border-border text-ink-subtle",
                )}
              >
                {state === "complete" ? <Check className="size-4" strokeWidth={2} /> : index + 1}
              </div>
              <span className={cn("text-xs", state === "upcoming" && "text-ink-subtle")}>{label}</span>
              {index < STEPS.length - 1 ? (
                <span className="h-px flex-1 bg-border" aria-hidden />
              ) : null}
            </li>
          );
        })}
      </ol>

      <FormProvider {...form}>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentStep}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: reducedMotion ? 0.15 : 0.2, ease: "easeOut" }}
            className="min-h-[320px]"
          >
            {stepIndex === 0 ? <StepTitleDates /> : null}
            {stepIndex === 1 ? (
              <StepDestinations destinationsController={destinationsController} />
            ) : null}
            {stepIndex === 2 ? (
              <StepCoverImage
                localPreviewUrl={localPreviewUrl}
                isUploading={coverUpload.isUploading}
                uploadError={coverUpload.error}
                onFileSelected={handleFileSelected}
                onClear={handleClearCover}
              />
            ) : null}
            {stepIndex === 3 ? <StepReview destinations={destinations} /> : null}
          </motion.div>
        </AnimatePresence>
      </FormProvider>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={handleBack}
          disabled={stepIndex === 0}
        >
          <ArrowLeft className="size-4" strokeWidth={1.5} /> Back
        </Button>
        {stepIndex < STEPS.length - 1 ? (
          <Button type="button" onClick={handleNext}>
            Next <ArrowRight className="size-4" strokeWidth={1.5} />
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitMutation.isPending}
          >
            {submitMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" strokeWidth={1.5} /> Creating…
              </>
            ) : (
              <>Create trip <Check className="size-4" strokeWidth={1.5} /></>
            )}
          </Button>
        )}
      </div>

      {tempCoverPath ? (
        <p className="text-xs text-ink-subtle">
          Cover ready: <span className="font-mono">{tempCoverPath}</span>
        </p>
      ) : null}
    </div>
  );
}
