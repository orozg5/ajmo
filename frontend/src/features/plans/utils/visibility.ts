import { Globe, Link2, Lock, Users, type LucideIcon } from "lucide-react";

export type PlanVisibility = "private" | "link" | "friends" | "public";

export const VISIBILITY_ICON: Record<PlanVisibility, LucideIcon> = {
  private: Lock,
  link: Link2,
  friends: Users,
  public: Globe,
};

export const VISIBILITY_LABEL: Record<PlanVisibility, string> = {
  private: "Private",
  link: "Anyone with link",
  friends: "Friends",
  public: "Public",
};
