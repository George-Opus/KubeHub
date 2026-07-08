"use client";

import { ResourceGroupView } from "@/components/ResourceGroupView";
import { EVENTS_KIND } from "@/components/resourceConfig";

export default function EventsPage() {
  return <ResourceGroupView title="Events" kinds={[EVENTS_KIND]} />;
}
