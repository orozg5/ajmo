"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getPreferences, upsertPreferences, type UserPreferencesUpdate } from "@/lib/api";

// Intentionally configurable — options shown in the dietary toggles
const DIETARY_OPTIONS = ["Vegetarian", "Vegan", "Halal", "Gluten-free"];

// Intentionally configurable — options shown in the budget toggle group
const BUDGET_OPTIONS = ["Budget", "Mid-range", "Luxury"];

export default function PreferencesForm() {
  const [interestTags, setInterestTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [dietary, setDietary] = useState<string[]>([]);
  const [budget, setBudget] = useState<string | null>(null);
  const [customNotes, setCustomNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPreferences()
      .then((prefs) => {
        setInterestTags(prefs.interest_tags ?? []);
        setDietary(prefs.dietary ?? []);
        setBudget(prefs.budget ?? null);
        setCustomNotes(prefs.custom_notes ?? "");
      })
      .catch((err: Error) => {
        // 404 = no preferences set yet — start with empty form
        if (!err.message.includes("404")) {
          setError("Failed to load preferences.");
        }
      });
  }, []);

  function addTag() {
    const trimmed = tagInput.trim();
    if (trimmed && !interestTags.includes(trimmed)) {
      setInterestTags((prev) => [...prev, trimmed]);
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    setInterestTags((prev) => prev.filter((t) => t !== tag));
  }

  function toggleDietary(option: string) {
    setDietary((prev) => (prev.includes(option) ? prev.filter((d) => d !== option) : [...prev, option]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setSaved(false);
    setError(null);
    try {
      const payload: UserPreferencesUpdate = {
        interest_tags: interestTags.length > 0 ? interestTags : null,
        dietary: dietary.length > 0 ? dietary : null,
        budget: budget || null,
        custom_notes: customNotes.trim() || null,
      };
      await upsertPreferences(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Failed to save — please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Interests */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Interests</label>
        <div className="flex gap-2">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="e.g. Museums, Jazz, Street food"
            className="flex-1"
          />
          <Button type="button" variant="outline" onClick={addTag}>
            Add
          </Button>
        </div>
        {interestTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {interestTags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs">
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Dietary */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Dietary restrictions</label>
        <div className="flex flex-wrap gap-2">
          {DIETARY_OPTIONS.map((option) => (
            <Button
              key={option}
              type="button"
              variant={dietary.includes(option) ? "default" : "outline"}
              size="sm"
              onClick={() => toggleDietary(option)}
            >
              {option}
            </Button>
          ))}
        </div>
      </div>

      {/* Budget */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Budget</label>
        <div className="flex gap-2">
          {BUDGET_OPTIONS.map((option) => (
            <Button
              key={option}
              type="button"
              variant={budget === option ? "default" : "outline"}
              size="sm"
              onClick={() => setBudget(budget === option ? null : option)}
            >
              {option}
            </Button>
          ))}
        </div>
      </div>

      {/* Custom notes */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Extra notes</label>
        <Textarea
          value={customNotes}
          onChange={(e) => setCustomNotes(e.target.value)}
          placeholder="Anything else the AI should know about you..."
          rows={3}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save preferences"}
        </Button>
        {saved && <span className="text-sm text-muted-foreground">Saved!</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </form>
  );
}
