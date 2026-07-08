"use client";

import { ResourceGroupView } from "@/components/ResourceGroupView";
import { GROUPS } from "@/components/resourceConfig";

export default function WorkloadsPage() {
  return <ResourceGroupView title={GROUPS.workloads.title} kinds={GROUPS.workloads.kinds} />;
}
