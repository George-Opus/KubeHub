"use client";

import { ResourceGroupView } from "@/components/ResourceGroupView";
import { GROUPS } from "@/components/resourceConfig";

export default function ConfigPage() {
  return <ResourceGroupView title={GROUPS.config.title} kinds={GROUPS.config.kinds} />;
}
