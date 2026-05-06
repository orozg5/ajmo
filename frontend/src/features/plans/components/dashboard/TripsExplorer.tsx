"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { UseQueryResult } from "@tanstack/react-query";

import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type Plan, type PlanScope } from "@/lib/api";
import { useDashboardPlans } from "@/features/plans/hooks/useDashboardPlans";
import {
  usePlanFilters,
  type UsePlanFiltersReturn,
} from "@/features/plans/hooks/usePlanFilters";
import EmptyPlansState from "@/features/plans/components/dashboard/EmptyPlansState";
import PlanCard from "@/features/plans/components/dashboard/PlanCard";
import TripFilterBar from "@/features/plans/components/dashboard/TripFilterBar";

type TripsExplorerProps = {
  initialOwnerPlans?: Plan[];
  initialMemberPlans?: Plan[];
  initialPublicPlans?: Plan[];
};

type TabValue = PlanScope;

type TabConfig = {
  value: TabValue;
  label: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyShowCta: boolean;
  showDelete: boolean;
  hideVisibilityFilter: boolean;
};

// Intentionally configurable — labels and empty-state copy per scope tab.
const TAB_CONFIGS: TabConfig[] = [
  {
    value: "owner",
    label: "Your trips",
    emptyTitle: "No trips yet. Let's go somewhere.",
    emptyDescription: "Start with a name, pick a few dates, and we'll help you fill in the rest.",
    emptyShowCta: true,
    showDelete: true,
    hideVisibilityFilter: false,
  },
  {
    value: "member",
    label: "Shared",
    emptyTitle: "Nothing shared yet.",
    emptyDescription: "When friends invite you to plan together, you'll see their trips here.",
    emptyShowCta: false,
    showDelete: false,
    hideVisibilityFilter: false,
  },
  {
    value: "public",
    label: "Discover",
    emptyTitle: "Quiet out here.",
    emptyDescription: "Public trips will appear as people start sharing them.",
    emptyShowCta: false,
    showDelete: false,
    hideVisibilityFilter: true,
  },
];

export default function TripsExplorer({
  initialOwnerPlans,
  initialMemberPlans,
  initialPublicPlans,
}: TripsExplorerProps) {
  const { owner, member, publicScope } = useDashboardPlans();

  return (
    <Tabs defaultValue="owner" className="space-y-5">
      <div className="z-20 rounded-2xl border border-border bg-card/85 px-3 py-2 backdrop-blur sm:px-4 md:sticky md:top-[4.5rem]">
        <TabsList variant="line" className="gap-3">
          {TAB_CONFIGS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="px-1">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {TAB_CONFIGS.map((tab) => {
        const initialData =
          tab.value === "owner"
            ? initialOwnerPlans
            : tab.value === "member"
              ? initialMemberPlans
              : initialPublicPlans;
        const query =
          tab.value === "owner" ? owner : tab.value === "member" ? member : publicScope;
        return (
          <TabsContent key={tab.value} value={tab.value} className="space-y-5">
            <ScopePanel config={tab} query={query} initialData={initialData} />
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

type ScopePanelProps = {
  config: TabConfig;
  query: UseQueryResult<Plan[], Error>;
  initialData?: Plan[];
};

function ScopePanel({ config, query, initialData }: ScopePanelProps) {
  const plans = query.data ?? initialData ?? [];
  const isLoading = query.isLoading && !initialData;
  const hasError = Boolean(query.error);

  const filters = usePlanFilters({
    plans,
    hideVisibilityFilter: config.hideVisibilityFilter,
  });

  return (
    <div className="space-y-5">
      {!isLoading && !hasError && plans.length > 0 ? (
        <TripFilterBar
          state={filters.state}
          availableDestinations={filters.availableDestinations}
          resultCount={filters.resultCount}
          visibleCount={filters.visibleCount}
          isFiltering={filters.isFiltering}
          hideVisibilityFilter={config.hideVisibilityFilter}
          onSearchChange={filters.handleSearchChange}
          onStatusToggle={filters.handleStatusToggle}
          onDestinationToggle={filters.handleDestinationToggle}
          onVisibilityToggle={filters.handleVisibilityToggle}
          onSortChange={filters.handleSortChange}
          onPageSizeChange={filters.handlePageSizeChange}
          onClearFilters={filters.clearFilters}
        />
      ) : null}

      <ScopeBody
        config={config}
        plans={plans}
        filters={filters}
        isLoading={isLoading}
        hasError={hasError}
      />
    </div>
  );
}

type ScopeBodyProps = {
  config: TabConfig;
  plans: Plan[];
  filters: UsePlanFiltersReturn;
  isLoading: boolean;
  hasError: boolean;
};

function ScopeBody({ config, plans, filters, isLoading, hasError }: ScopeBodyProps) {
  if (hasError) {
    return (
      <p className="text-sm text-destructive">
        Couldn&apos;t load these trips. Try refreshing.
      </p>
    );
  }
  if (isLoading) {
    return <PlanCardGrid skeletons />;
  }
  if (plans.length === 0) {
    return (
      <EmptyPlansState
        title={config.emptyTitle}
        description={config.emptyDescription}
        showCta={config.emptyShowCta}
      />
    );
  }
  if (filters.filteredPlans.length === 0) {
    return <EmptyPlansState variant="filtered" onClearFilters={filters.clearFilters} />;
  }
  return <PlanCardGrid plans={filters.visiblePlans} showDelete={config.showDelete} />;
}

type PlanCardGridProps = {
  plans?: Plan[];
  showDelete?: boolean;
  skeletons?: boolean;
};

function PlanCardGrid({ plans = [], showDelete = false, skeletons = false }: PlanCardGridProps) {
  const reducedMotion = useReducedMotion();
  const items = useMemo(() => (skeletons ? [0, 1, 2, 3, 4, 5] : plans), [plans, skeletons]);

  return (
    <motion.div
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: reducedMotion ? {} : { staggerChildren: 0.04 },
        },
      }}
    >
      {items.map((entry) => (
        <motion.div
          key={skeletons ? (entry as number) : (entry as Plan).id}
          variants={{
            hidden: { opacity: 0, y: reducedMotion ? 0 : 8 },
            visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
          }}
        >
          {skeletons ? (
            <PlanCardSkeleton />
          ) : (
            <PlanCard plan={entry as Plan} showDelete={showDelete} />
          )}
        </motion.div>
      ))}
    </motion.div>
  );
}

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
