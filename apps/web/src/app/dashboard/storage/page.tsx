"use client";

import { ResourceGroupView } from "@/components/ResourceGroupView";
import { GROUPS } from "@/components/resourceConfig";

export default function StoragePage() {
  return <ResourceGroupView title={GROUPS.storage.title} kinds={GROUPS.storage.kinds} />;
}
