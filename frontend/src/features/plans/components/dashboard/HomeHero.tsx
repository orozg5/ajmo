"use client";

import Link from "next/link";
import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarClock, Plane, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type Plan } from "@/lib/api";
import { getTripStatus } from "@/features/plans/utils/tripStatus";

type HomeHeroProps = {
  greetingName: string | null;
  // Stats are derived from the user's own ("owner") plans only — these are the
  // trips they actually book/run, distinct from anything shared or discoverable.
  ownerPlans: Plan[];
};

export default function HomeHero({ greetingName, ownerPlans }: HomeHeroProps) {
  const reducedMotion = useReducedMotion();

  const stats = useMemo(() => {
    let total = 0;
    let upcoming = 0;
    let ongoing = 0;
    const today = new Date();
    for (const plan of ownerPlans) {
      total += 1;
      const status = getTripStatus(plan, today);
      if (status === "upcoming") upcoming += 1;
      else if (status === "ongoing") ongoing += 1;
    }
    return { total, upcoming, ongoing };
  }, [ownerPlans]);

  const greeting = greetingName ? `Hey ${greetingName}` : "Where next?";
  const subline =
    stats.ongoing > 0
      ? "You have a trip in motion right now."
      : stats.upcoming > 0
        ? "Next adventure is on the books."
        : "Plan a trip, keep a wishlist, or borrow inspiration.";

  return (
    <motion.section
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative overflow-hidden rounded-3xl border border-border bg-card"
      aria-label="Dashboard greeting"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/15 via-accent/10 to-secondary/15"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-accent/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-12 size-72 rounded-full bg-secondary/15 blur-3xl"
      />

      <div className="relative space-y-6 p-6 sm:p-10">
        <div className="space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-medium text-ink-subtle backdrop-blur">
            <Sparkles className="size-3.5 text-primary" strokeWidth={1.75} />
            Your travel home base
          </span>
          <h1 className="text-display-2xl leading-[1.05]">{greeting}</h1>
        </div>

        <p className="max-w-xl text-base text-ink-subtle">{subline}</p>

        <div className="flex flex-wrap items-end justify-between gap-4 pt-2">
          <div className="flex flex-wrap gap-2">
            <StatChip icon={<Plane className="size-3.5" strokeWidth={1.75} />} label="Trips" value={stats.total} />
            <StatChip
              icon={<CalendarClock className="size-3.5" strokeWidth={1.75} />}
              label="Upcoming"
              value={stats.upcoming}
            />
            <StatChip
              icon={<Plane className="size-3.5 rotate-45" strokeWidth={1.75} />}
              label="In motion"
              value={stats.ongoing}
            />
          </div>
          <Button asChild size="lg" className="px-5">
            <Link href="/plans/new">New plan</Link>
          </Button>
        </div>
      </div>
    </motion.section>
  );
}

type StatChipProps = {
  icon: React.ReactNode;
  label: string;
  value: number;
};

function StatChip({ icon, label, value }: StatChipProps) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1.5 text-sm backdrop-blur">
      <span className="text-primary">{icon}</span>
      <span className="font-semibold text-ink">{value}</span>
      <span className="text-ink-subtle">{label}</span>
    </span>
  );
}
