"use client";

import { ResourceGroupView } from "@/components/ResourceGroupView";
import { NAMESPACES_KIND } from "@/components/resourceConfig";

export default function NamespacesPage() {
  return <ResourceGroupView title="Namespaces" kinds={[NAMESPACES_KIND]} />;
}
