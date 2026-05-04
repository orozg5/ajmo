import { apiFetch } from "./client";

export interface SignedUpload {
  bucket: string;
  path: string;
  signed_url: string;
  token: string | null;
  public_url: string;
}

export const createPlanCoverUpload = (filename: string | null): Promise<SignedUpload> =>
  apiFetch<SignedUpload>("/storage/plan-covers/signed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename }),
  });

export const createUserAvatarUpload = (filename: string | null): Promise<SignedUpload> =>
  apiFetch<SignedUpload>("/storage/user-avatars/signed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename }),
  });
