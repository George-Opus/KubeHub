"use client";

import { ResourceGroupView } from "@/components/ResourceGroupView";
import { GROUPS } from "@/components/resourceConfig";

export default function NetworkPage() {
  return <ResourceGroupView title={GROUPS.network.title} kinds={GROUPS.network.kinds} />;
}
