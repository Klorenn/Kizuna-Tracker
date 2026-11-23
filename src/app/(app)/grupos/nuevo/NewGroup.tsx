"use client";

import { useRouter } from "next/navigation";
import { create } from "@/app/(app)/grupos/actions";
import { GroupForm } from "@/components/groups/create/GroupForm";

/** Binds the create action and goes to the new group. `habits` are already filtered by the page. */
export function NewGroup({ habits }: { habits: { id: string; name: string }[] }) {
  const router = useRouter();
  return <GroupForm habits={habits} actions={{ create }} onCreated={(id) => router.replace(`/grupos/${id}`)} />;
}
