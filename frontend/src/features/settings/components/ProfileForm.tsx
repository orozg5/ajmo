"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { type Profile, updateMe } from "@/lib/api";
import AvatarUploader from "@/features/settings/components/AvatarUploader";

const profileSchema = z.object({
  display_name: z
    .string()
    .trim()
    .max(80, "Keep it under 80 characters")
    .optional()
    .or(z.literal("")),
  bio: z.string().trim().max(400, "400 characters max").optional().or(z.literal("")),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

function initialsFor(profile: Profile): string {
  const source = profile.display_name || profile.username || "You";
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((piece) => piece.charAt(0).toUpperCase())
    .join("") || "You";
}

type ProfileFormProps = {
  initialProfile: Profile;
};

export default function ProfileForm({ initialProfile }: ProfileFormProps) {
  const [avatar, setAvatar] = useState<{ url: string | null; path: string | null }>({
    url: initialProfile.avatar_url,
    path: null,
  });

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      display_name: initialProfile.display_name ?? "",
      bio: initialProfile.bio ?? "",
    },
    mode: "onBlur",
  });

  const mutation = useMutation({ mutationFn: updateMe });

  async function onSubmit(values: ProfileFormValues) {
    try {
      await mutation.mutateAsync({
        display_name: values.display_name?.trim() || null,
        bio: values.bio?.trim() || null,
        avatar_url: avatar.url,
      });
      toast.success("Profile updated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't save your profile";
      toast.error(message);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <AvatarUploader
          value={avatar.url}
          onChange={(next) => setAvatar(next)}
          fallbackLabel={initialsFor(initialProfile)}
        />

        <FormField
          control={form.control}
          name="display_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Display name</FormLabel>
              <FormControl>
                <Input placeholder="How friends see you" {...field} />
              </FormControl>
              <FormDescription>Shown on plans you share.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="bio"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bio</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="A few lines about your travel style"
                  rows={4}
                  {...field}
                />
              </FormControl>
              <FormDescription>Optional. Up to 400 characters.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" strokeWidth={1.5} /> Saving…
              </>
            ) : (
              <>
                <Save className="size-4" strokeWidth={1.5} /> Save profile
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
