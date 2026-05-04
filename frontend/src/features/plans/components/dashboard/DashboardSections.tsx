"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { type UseQueryResult } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type Plan } from "@/lib/api";
import { useDashboardPlans } from "@/features/plans/hooks/useDashboardPlans";
import EmptyPlansState from "@/features/plans/components/dashboard/EmptyPlansState";
import PlanCard from "@/features/plans/components/dashboard/PlanCard";

type DashboardSectionsProps = {
  initialOwnerPlans?: Plan[];
  initialPublicPlans?: Plan[];
  greeting?: string;
};

function PlanCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card p-0 shadow-sm">
      <Skeleton className="aspect-[16/9] w-full rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-5 w-3/4 rounded" />
        <Skeleton className="h-3 w-1/2 rounded" />
        <div className="flex gap-1.5 pt-1">
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

type SectionProps = {
  title: string;
  subtitle?: string;
  query: UseQueryResult<Plan[], Error>;
  initialData?: Plan[];
  emptyTitle: string;
  emptyDescription: string;
  emptyShowCta: boolean;
  headerRight?: React.ReactNode;
};

function Section({
  title,
  subtitle,
  query,
  initialData,
  emptyTitle,
  emptyDescription,
  emptyShowCta,
  headerRight,
}: SectionProps) {
  const plans = query.data ?? initialData ?? [];
  const isLoading = query.isLoading && !initialData;
  const hasError = Boolean(query.error);

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-display-lg text-2xl">{title}</h2>
          {subtitle ? <p className="text-sm text-ink-subtle">{subtitle}</p> : null}
        </div>
        {headerRight}
      </header>

      {hasError ? (
        <p className="text-sm text-destructive">
          Couldn&apos;t load these plans. Try refreshing.
        </p>
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <PlanCardSkeleton key={index} />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <EmptyPlansState
          title={emptyTitle}
          description={emptyDescription}
          showCta={emptyShowCta}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function DashboardSections({
  initialOwnerPlans,
  initialPublicPlans,
  greeting,
}: DashboardSectionsProps) {
  const { owner, member, publicScope } = useDashboardPlans();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 p-6 md:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-display-2xl leading-tight">
            {greeting ?? "Where next?"}
          </h1>
          <p className="text-sm text-ink-subtle">
            Plan a trip, keep a running wishlist, or see what others are dreaming up.
          </p>
        </div>
      </div>

      <Section
        title="Your trips"
        subtitle="Drafts, plans in motion, and everything you own."
        query={owner}
        initialData={initialOwnerPlans}
        emptyTitle="No trips yet — let's go somewhere."
        emptyDescription="Start with a name, pick a few dates, and we'll help you fill in the rest."
        emptyShowCta
        headerRight={
          <Button asChild>
            <Link href="/plans/new">
              <Plus className="size-4" strokeWidth={1.5} />
              New plan
            </Link>
          </Button>
        }
      />

      <Section
        title="Shared with you"
        subtitle="Trips friends invited you to co-edit."
        query={member}
        emptyTitle="Nothing shared yet."
        emptyDescription="When friends invite you to plan together, you'll see their trips here."
        emptyShowCta={false}
      />

      <Section
        title="Discover"
        subtitle="Public trips from the community."
        query={publicScope}
        initialData={initialPublicPlans}
        emptyTitle="Quiet out here."
        emptyDescription="Public trips will appear as people start sharing them."
        emptyShowCta={false}
      />
    </div>
  );
}
