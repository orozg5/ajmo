"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { getPreferences, upsertPreferences, type UserPreferencesUpdate } from "@/lib/api";

// Intentionally configurable — options shown in the dietary toggles
const DIETARY_OPTIONS = ["Vegetarian", "Vegan", "Halal", "Gluten-free"];

// Intentionally configurable — options shown in the budget toggle group
const BUDGET_OPTIONS = ["Budget", "Mid-range", "Luxury"] as const;

type Budget = (typeof BUDGET_OPTIONS)[number] | "none";

export default function PreferencesForm() {
  const [interestTags, setInterestTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [dietary, setDietary] = useState<string[]>([]);
  const [budget, setBudget] = useState<Budget>("none");
  const [customNotes, setCustomNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    getPreferences()
      .then((prefs) => {
        setInterestTags(prefs.interest_tags ?? []);
        setDietary(prefs.dietary ?? []);
        setBudget(
          prefs.budget && (BUDGET_OPTIONS as readonly string[]).includes(prefs.budget)
            ? (prefs.budget as Budget)
            : "none",
        );
        setCustomNotes(prefs.custom_notes ?? "");
      })
      .catch((error: Error) => {
        if (!error.message.includes("404")) {
          setLoadError("Couldn't load your preferences.");
        }
      });
  }, []);

  function addTag() {
    const trimmed = tagInput.trim();
    if (trimmed && !interestTags.includes(trimmed)) {
      setInterestTags((previous) => [...previous, trimmed]);
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    setInterestTags((previous) => previous.filter((entry) => entry !== tag));
  }

  function toggleDietary(option: string) {
    setDietary((previous) =>
      previous.includes(option)
        ? previous.filter((entry) => entry !== option)
        : [...previous, option],
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    try {
      const payload: UserPreferencesUpdate = {
        interest_tags: interestTags.length > 0 ? interestTags : null,
        dietary: dietary.length > 0 ? dietary : null,
        budget: budget === "none" ? null : budget,
        custom_notes: customNotes.trim() || null,
      };
      await upsertPreferences(payload);
      toast.success("Preferences saved");
    } catch {
      toast.error("Save failed — please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-7">
      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

      <section className="space-y-2">
        <label className="text-sm font-medium">Interests</label>
        <p className="text-xs text-ink-subtle">
          Tag what you love. The AI weights these across enrichment and suggestions.
        </p>
        <div className="flex gap-2">
          <Input
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addTag();
              }
            }}
            placeholder="e.g. Museums, Jazz, Street food"
            className="flex-1"
          />
          <Button type="button" variant="outline" onClick={addTag}>
            <Plus className="size-4" strokeWidth={1.5} />
            Add
          </Button>
        </div>
        {interestTags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pt-2">
            {interestTags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1.5 pr-1.5">
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="rounded-full p-0.5 text-ink-subtle hover:bg-background/40 hover:text-ink"
                  aria-label={`Remove ${tag}`}
                >
                  <X className="size-3" strokeWidth={1.5} />
                </button>
              </Badge>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-2">
        <label className="text-sm font-medium">Dietary needs</label>
        <div className="flex flex-wrap gap-2">
          {DIETARY_OPTIONS.map((option) => {
            const active = dietary.includes(option);
            return (
              <Button
                key={option}
                type="button"
                variant={active ? "default" : "outline"}
                size="sm"
                onClick={() => toggleDietary(option)}
              >
                {option}
              </Button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <label className="text-sm font-medium">Budget</label>
        <Tabs value={budget} onValueChange={(value) => setBudget(value as Budget)}>
          <TabsList className="w-full">
            <TabsTrigger value="none" className="flex-1">
              No preference
            </TabsTrigger>
            {BUDGET_OPTIONS.map((option) => (
              <TabsTrigger key={option} value={option} className="flex-1">
                {option}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </section>

      <section className="space-y-2">
        <label className="text-sm font-medium">Extra notes</label>
        <Textarea
          value={customNotes}
          onChange={(event) => setCustomNotes(event.target.value)}
          placeholder="Anything else the AI should weight (mobility, travel style, allergies)…"
          rows={3}
        />
      </section>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="size-4 animate-spin" strokeWidth={1.5} /> Saving…
            </>
          ) : (
            <>
              <Save className="size-4" strokeWidth={1.5} /> Save preferences
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
