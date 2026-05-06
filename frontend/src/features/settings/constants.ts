import {
  Bike,
  Building2,
  Camera,
  ChefHat,
  Coffee,
  CreditCard,
  Drama,
  Flower2,
  Gem,
  Landmark,
  Mountain,
  Music,
  ShoppingBag,
  Trees,
  Users,
  Wallet,
  Waves,
  Wine,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface InterestOption {
  value: string;
  icon: LucideIcon;
}

// Intentionally configurable — curated travel interests offered as multi-select chips
export const INTEREST_OPTIONS: InterestOption[] = [
  { value: "Museums & galleries", icon: Landmark },
  { value: "History & heritage", icon: Building2 },
  { value: "Food & dining", icon: ChefHat },
  { value: "Cafés & coffee", icon: Coffee },
  { value: "Nightlife & bars", icon: Wine },
  { value: "Nature & parks", icon: Trees },
  { value: "Beaches & coast", icon: Waves },
  { value: "Hiking & outdoors", icon: Mountain },
  { value: "Shopping", icon: ShoppingBag },
  { value: "Architecture", icon: Building2 },
  { value: "Photography spots", icon: Camera },
  { value: "Live music & shows", icon: Music },
  { value: "Local culture", icon: Drama },
  { value: "Family-friendly", icon: Users },
  { value: "Adventure sports", icon: Bike },
  { value: "Wellness & spa", icon: Flower2 },
];

// Intentionally configurable — dietary needs offered as multi-select chips
export const DIETARY_OPTIONS: string[] = [
  "Vegetarian",
  "Vegan",
  "Pescatarian",
  "Halal",
  "Kosher",
  "Gluten-free",
  "Dairy-free",
  "Nut-free",
];

export interface BudgetOption {
  value: "Budget" | "Mid-range" | "Luxury";
  description: string;
  icon: LucideIcon;
}

// Intentionally configurable — budget tiers shown as a segmented card picker
export const BUDGET_OPTIONS: BudgetOption[] = [
  {
    value: "Budget",
    description: "Local spots and free attractions",
    icon: Wallet,
  },
  {
    value: "Mid-range",
    description: "Casual restaurants, mix of free and paid",
    icon: CreditCard,
  },
  {
    value: "Luxury",
    description: "Fine dining and premium experiences",
    icon: Gem,
  },
];

export type BudgetValue = BudgetOption["value"];
