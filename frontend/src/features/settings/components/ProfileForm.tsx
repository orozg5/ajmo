"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { IdCard, ImageIcon, Loader2, Save, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

const BIO_LIMIT = 400;
const NAME_LIMIT = 80;

const profileSchema = z.object({
  display_name: z
    .string()
    .trim()
    .max(NAME_LIMIT, `Keep it under ${NAME_LIMIT} characters`)
    .optional()
    .or(z.literal("")),
  bio: z
    .string()
    .trim()
    .max(BIO_LIMIT, `${BIO_LIMIT} characters max`)
    .optional()
    .or(z.literal("")),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

function initialsFor(profile: Profile): string {
  const source = profile.display_name || profile.username || "You";
  return (
    source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((piece) => piece.charAt(0).toUpperCase())
      .join("") || "You"
  );
}

type ProfileFormProps = {
  initialProfile: Profile;
};

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

export default function ProfileForm({ initialProfile }: ProfileFormProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const router = useRouter();

  const [savedAvatarUrl, setSavedAvatarUrl] = useState<string | null>(initialProfile.avatar_url);
  const [avatar, setAvatar] = useState<{ url: string | null; path: string | null }>({
    url: initialProfile.avatar_url,
    path: null,
  });
  const avatarDirty = avatar.url !== savedAvatarUrl;

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      display_name: initialProfile.display_name ?? "",
      bio: initialProfile.bio ?? "",
    },
    mode: "onBlur",
  });

  const bioValue = form.watch("bio") ?? "";
  const nameValue = form.watch("display_name") ?? "";
  const isDirty = form.formState.isDirty || avatarDirty;

  const mutation = useMutation({ mutationFn: updateMe });

  async function onSubmit(values: ProfileFormValues) {
    try {
      await mutation.mutateAsync({
        display_name: values.display_name?.trim() || null,
        bio: values.bio?.trim() || null,
        avatar_url: avatar.url,
      });
      form.reset({
        display_name: values.display_name ?? "",
        bio: values.bio ?? "",
      });
      setSavedAvatarUrl(avatar.url);
      router.refresh();
      toast.success("Profile updated");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't save your profile";
      toast.error(message);
    }
  }

  function handleDiscard() {
    form.reset({
      display_name: initialProfile.display_name ?? "",
      bio: initialProfile.bio ?? "",
    });
    setAvatar({ url: savedAvatarUrl, path: null });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-24">
        <SectionCard
          icon={ImageIcon}
          title="Your photo"
          description="A friendly face helps collaborators recognise you on shared trips."
          delay={0}
          reduceMotion={reduceMotion}
        >
          <AvatarUploader
            value={avatar.url}
            onChange={(next) => setAvatar(next)}
            fallbackLabel={initialsFor(initialProfile)}
          />
        </SectionCard>

        <SectionCard
          icon={IdCard}
          title="About you"
          description="How you appear on plans and in collaborator lists."
          delay={0.05}
          reduceMotion={reduceMotion}
        >
          <FormField
            control={form.control}
            name="display_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Display name</FormLabel>
                <FormControl>
                  <Input placeholder="How friends see you" maxLength={NAME_LIMIT} {...field} />
                </FormControl>
                <div className="flex items-center justify-between gap-3">
                  <FormDescription>Shown on plans you share.</FormDescription>
                  <span className="text-xs tabular-nums text-ink-subtle">
                    {nameValue.length}/{NAME_LIMIT}
                  </span>
                </div>
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
                    maxLength={BIO_LIMIT}
                    {...field}
                  />
                </FormControl>
                <div className="flex items-center justify-between gap-3">
                  <FormDescription>Optional. A short personal blurb.</FormDescription>
                  <span className="text-xs tabular-nums text-ink-subtle">
                    {bioValue.length}/{BIO_LIMIT}
                  </span>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
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
                disabled={mutation.isPending}
              >
                <Undo2 className="size-4" strokeWidth={1.5} />
                Discard
              </Button>
              <Button type="submit" size="sm" disabled={mutation.isPending || !isDirty}>
                {mutation.isPending ? (
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
    </Form>
  );
}
