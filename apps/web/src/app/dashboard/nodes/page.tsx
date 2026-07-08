"use client";

import { ResourceGroupView } from "@/components/ResourceGroupView";
import { NODES_KIND } from "@/components/resourceConfig";

export default function NodesPage() {
  return <ResourceGroupView title="Nodes" kinds={[NODES_KIND]} />;
}
