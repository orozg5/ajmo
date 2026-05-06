"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion, useReducedMotion } from "framer-motion";
import {
  Check,
  Compass,
  Loader2,
  PencilLine,
  Save,
  Undo2,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  BUDGET_OPTIONS,
  DIETARY_OPTIONS,
  INTEREST_OPTIONS,
  type BudgetValue,
} from "@/features/settings/constants";
import {
  upsertPreferences,
  type UserPreferences,
  type UserPreferencesUpdate,
} from "@/lib/api";

const NOTES_LIMIT = 500;

const BUDGET_VALUES = BUDGET_OPTIONS.map((option) => option.value) as readonly BudgetValue[];

const preferencesSchema = z.object({
  interest_tags: z.array(z.string()),
  dietary: z.array(z.string()),
  budget: z.union([z.enum(BUDGET_VALUES as unknown as [BudgetValue, ...BudgetValue[]]), z.null()]),
  custom_notes: z.string().trim().max(NOTES_LIMIT, `${NOTES_LIMIT} characters max`),
});

type PreferencesFormValues = z.infer<typeof preferencesSchema>;

type PreferencesFormProps = {
  initialPreferences: UserPreferences;
};

function toFormValues(prefs: UserPreferences): PreferencesFormValues {
  const validBudget = (BUDGET_VALUES as readonly string[]).includes(prefs.budget ?? "")
    ? (prefs.budget as BudgetValue)
    : null;
  return {
    interest_tags: prefs.interest_tags ?? [],
    dietary: prefs.dietary ?? [],
    budget: validBudget,
    custom_notes: prefs.custom_notes ?? "",
  };
}

type SectionCardProps = {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  description?: string;
  delay: number;
  reduceMotion: boolean;
  children: React.ReactNode;
};

function SectionCard({
  icon: Icon,
  title,
  description,
  delay,
  reduceMotion,
  children,
}: SectionCardProps) {
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut", delay }}
    >
      <Card className="rounded-2xl">
        <CardContent className="space-y-5 p-6">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-4.5" strokeWidth={1.5} />
            </div>
            <div className="space-y-0.5">
              <h2 className="text-base font-medium leading-tight">{title}</h2>
              {description ? (
                <p className="text-sm text-ink-subtle">{description}</p>
              ) : null}
            </div>
          </div>
          {children}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function PreferencesForm({ initialPreferences }: PreferencesFormProps) {
  const reduceMotion = useReducedMotion() ?? false;

  const form = useForm<PreferencesFormValues>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: toFormValues(initialPreferences),
    mode: "onBlur",
  });

  const interestTags = form.watch("interest_tags");
  const dietary = form.watch("dietary");
  const budget = form.watch("budget");
  const notes = form.watch("custom_notes");
  const isDirty = form.formState.isDirty;
  const isSaving = form.formState.isSubmitting;

  function toggleInterest(value: string) {
    const current = form.getValues("interest_tags");
    const next = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];
    form.setValue("interest_tags", next, { shouldDirty: true });
  }

  function toggleDietary(value: string) {
    const current = form.getValues("dietary");
    const next = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];
    form.setValue("dietary", next, { shouldDirty: true });
  }

  function selectBudget(value: BudgetValue) {
    const current = form.getValues("budget");
    form.setValue("budget", current === value ? null : value, { shouldDirty: true });
  }

  async function onSubmit(values: PreferencesFormValues) {
    try {
      const payload: UserPreferencesUpdate = {
        interest_tags: values.interest_tags.length > 0 ? values.interest_tags : null,
        dietary: values.dietary.length > 0 ? values.dietary : null,
        budget: values.budget,
        custom_notes: values.custom_notes.trim() || null,
      };
      await upsertPreferences(payload);
      form.reset(values);
      toast.success("Preferences saved");
    } catch {
      toast.error("Save failed — please try again.");
    }
  }

  function handleDiscard() {
    form.reset();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-24">
      <SectionCard
        icon={Compass}
        title="Interests"
        description="Pick what you love. The AI weights these across enrichment and suggestions."
        delay={0}
        reduceMotion={reduceMotion}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {INTEREST_OPTIONS.map((option) => {
            const active = interestTags.includes(option.value);
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggleInterest(option.value)}
                aria-pressed={active}
                className={cn(
                  "group inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-background text-ink hover:border-primary/40 hover:bg-muted",
                )}
              >
                <Icon className="size-4 shrink-0" strokeWidth={1.5} />
                <span className="truncate">{option.value}</span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        icon={UtensilsCrossed}
        title="Dietary needs"
        description="We'll steer restaurant picks around what you can eat."
        delay={0.05}
        reduceMotion={reduceMotion}
      >
        <div className="flex flex-wrap gap-2">
          {DIETARY_OPTIONS.map((option) => {
            const active = dietary.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => toggleDietary(option)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-background text-ink hover:border-primary/40 hover:bg-muted",
                )}
              >
                {active ? <Check className="size-3.5" strokeWidth={2} /> : null}
                {option}
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        icon={Wallet}
        title="Budget"
        description="Tap a tier — or any selected one again to clear."
        delay={0.1}
        reduceMotion={reduceMotion}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {BUDGET_OPTIONS.map((option) => {
            const active = budget === option.value;
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => selectBudget(option.value)}
                aria-pressed={active}
                className={cn(
                  "relative flex flex-col items-start gap-2 rounded-2xl border bg-background p-4 text-left transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  active
                    ? "border-primary ring-2 ring-primary/40"
                    : "border-border hover:border-primary/40 hover:bg-muted",
                )}
              >
                {active ? (
                  <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-3" strokeWidth={2.5} />
                  </span>
                ) : null}
                <div
                  className={cn(
                    "flex size-9 items-center justify-center rounded-xl",
                    active ? "bg-primary/15 text-primary" : "bg-muted text-ink-subtle",
                  )}
                >
                  <Icon className="size-4.5" strokeWidth={1.5} />
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{option.value}</p>
                  <p className="text-xs text-ink-subtle">{option.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        icon={PencilLine}
        title="Anything else?"
        description="Mobility, allergies, travel style, or anything else our suggestions should know."
        delay={0.15}
        reduceMotion={reduceMotion}
      >
        <div className="space-y-2">
          <Textarea
            value={notes}
            onChange={(event) =>
              form.setValue("custom_notes", event.target.value, { shouldDirty: true })
            }
            placeholder="e.g. Travelling with a stroller, prefer slow mornings, allergic to shellfish…"
            rows={4}
            maxLength={NOTES_LIMIT}
          />
          <div className="flex items-center justify-end">
            <span className="text-xs tabular-nums text-ink-subtle">
              {notes.length}/{NOTES_LIMIT}
            </span>
          </div>
        </div>
      </SectionCard>

      <motion.div
        initial={false}
        animate={{
          opacity: isDirty ? 1 : 0,
          y: isDirty ? 0 : 12,
          pointerEvents: isDirty ? "auto" : "none",
        }}
        transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/85 backdrop-blur"
      >
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-6 py-3 md:px-10">
          <p className="text-sm text-ink-subtle">You have unsaved changes.</p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDiscard}
              disabled={isSaving}
            >
              <Undo2 className="size-4" strokeWidth={1.5} />
              Discard
            </Button>
            <Button type="submit" size="sm" disabled={isSaving || !isDirty}>
              {isSaving ? (
                <>
                  <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="size-4" strokeWidth={1.5} />
                  Save changes
                </>
              )}
            </Button>
          </div>
        </div>
      </motion.div>
    </form>
  );
}
