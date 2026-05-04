import { toast } from "sonner";
import { create } from "zustand";

type ToastKind = "success" | "error" | "info" | "warning";

type ToastInput = {
  kind?: ToastKind;
  title: string;
  description?: string;
  durationMs?: number;
};

type ToastStore = {
  show: (input: ToastInput) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
};

export const useToastStore = create<ToastStore>(() => ({
  show: ({ kind = "info", title, description, durationMs }) => {
    const duration = durationMs ?? (kind === "error" ? 8000 : 4000);
    if (kind === "success") toast.success(title, { description, duration });
    else if (kind === "error") toast.error(title, { description, duration });
    else if (kind === "warning") toast.warning(title, { description, duration });
    else toast(title, { description, duration });
  },
  success: (title, description) => toast.success(title, { description, duration: 4000 }),
  error: (title, description) => toast.error(title, { description, duration: 8000 }),
}));
