"use client";

import { FormProvider, type UseFormReturn } from "react-hook-form";
import { z } from "zod";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type Plan, type UpdatePlanPayload } from "@/lib/api";
import StepCoverImage from "@/features/plans/components/wizard/StepCoverImage";
import {
  VISIBILITY_LABEL,
  type PlanVisibility,
} from "@/features/plans/utils/visibility";

const VISIBILITY_OPTIONS: PlanVisibility[] = ["private", "link", "friends", "public"];

export const generalSchema = z
  .object({
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    date_from: z.string().optional(),
    date_to: z.string().optional(),
    visibility: z.enum(["private", "link", "friends", "public"]),
    cover_image_path: z.string().optional(),
    cover_image_url: z.string().optional(),
  })
  .refine(
    (values) => {
      if (!values.date_from || !values.date_to) return true;
      return values.date_to >= values.date_from;
    },
    { path: ["date_to"], message: "End date must be on or after the start date" },
  );

export type GeneralValues = z.infer<typeof generalSchema>;

export function defaultsFromPlan(plan: Plan): GeneralValues {
  return {
    title: plan.title,
    description: plan.description ?? "",
    date_from: plan.date_from ?? "",
    date_to: plan.date_to ?? "",
    visibility: plan.visibility,
    cover_image_path: plan.cover_image_path ?? undefined,
    cover_image_url: plan.cover_image_url ?? undefined,
  };
}

export function buildPatch(initial: GeneralValues, current: GeneralValues): UpdatePlanPayload {
  const patch: UpdatePlanPayload = {};

  const trimmedTitle = current.title.trim();
  if (trimmedTitle && trimmedTitle !== initial.title) {
    patch.title = trimmedTitle;
  }

  const initialDescription = initial.description ?? "";
  const currentDescription = current.description ?? "";
  if (currentDescription !== initialDescription) {
    patch.description = currentDescription === "" ? null : currentDescription;
  }

  const initialFrom = initial.date_from ?? "";
  const currentFrom = current.date_from ?? "";
  if (currentFrom !== initialFrom) {
    patch.date_from = currentFrom === "" ? null : currentFrom;
  }

  const initialTo = initial.date_to ?? "";
  const currentTo = current.date_to ?? "";
  if (currentTo !== initialTo) {
    patch.date_to = currentTo === "" ? null : currentTo;
  }

  if (current.visibility !== initial.visibility) {
    patch.visibility = current.visibility;
  }

  const initialPath = initial.cover_image_path ?? "";
  const currentPath = current.cover_image_path ?? "";
  if (currentPath !== initialPath) {
    patch.cover_image_path = currentPath === "" ? null : currentPath;
  }

  const initialUrl = initial.cover_image_url ?? "";
  const currentUrl = current.cover_image_url ?? "";
  if (currentUrl !== initialUrl) {
    patch.cover_image_url = currentUrl === "" ? null : currentUrl;
  }

  return patch;
}

type EditPlanGeneralTabProps = {
  form: UseFormReturn<GeneralValues>;
  localPreviewUrl: string | null;
  coverUploading: boolean;
  coverError: string | null;
  onFileSelected: (file: File) => void;
  onClearCover: () => void;
};

export default function EditPlanGeneralTab({
  form,
  localPreviewUrl,
  coverUploading,
  coverError,
  onFileSelected,
  onClearCover,
}: EditPlanGeneralTabProps) {
  return (
    <FormProvider {...form}>
      <Form {...form}>
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Title</FormLabel>
                <FormControl>
                  <Input placeholder="Summer in Italy" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="What's this trip about?"
                    rows={3}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="date_from"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>From</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="date_to"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>To</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="visibility"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Visibility</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select visibility" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {VISIBILITY_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {VISIBILITY_LABEL[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <StepCoverImage
            localPreviewUrl={localPreviewUrl}
            isUploading={coverUploading}
            uploadError={coverError}
            onFileSelected={onFileSelected}
            onClear={onClearCover}
          />
        </div>
      </Form>
    </FormProvider>
  );
}
