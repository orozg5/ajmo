"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import AddFriendsTab from "./AddFriendsTab";
import InvitesTab from "./InvitesTab";
import MembersTab from "./MembersTab";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  planId: string;
  isOwner: boolean;
}

export default function ShareDialog({
  open,
  onOpenChange,
  planId,
  isOwner,
}: ShareDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Share this trip</DialogTitle>
          <DialogDescription>
            Manage who can view or edit your itinerary. Roles take effect the next time the
            collaborator opens the plan.
          </DialogDescription>
        </DialogHeader>

        {isOwner ? (
          <Tabs defaultValue="members">
            <TabsList>
              <TabsTrigger value="members">Members</TabsTrigger>
              <TabsTrigger value="friends">Add friends</TabsTrigger>
              <TabsTrigger value="invites">Invite link</TabsTrigger>
            </TabsList>
            <TabsContent value="members" className="mt-4">
              <MembersTab planId={planId} isOwner />
            </TabsContent>
            <TabsContent value="friends" className="mt-4">
              <AddFriendsTab planId={planId} />
            </TabsContent>
            <TabsContent value="invites" className="mt-4">
              <InvitesTab planId={planId} />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="mt-2">
            <MembersTab planId={planId} isOwner={false} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
