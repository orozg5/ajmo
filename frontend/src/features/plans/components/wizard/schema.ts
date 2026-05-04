import { z } from "zod";

export const wizardSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  cover_image_path: z.string().optional(),
  cover_image_url: z.string().optional(),
});

export type WizardValues = z.infer<typeof wizardSchema>;

export const titleStepFields = ["title", "date_from", "date_to"] as const;
export const descriptionStepFields = ["description"] as const;
