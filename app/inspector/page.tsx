"use client";
import { PageHeader } from "@/components/ui";
import { ResponseInspector } from "@/components/ResponseInspector";

export default function InspectorPage() {
  return (
    <>
      <PageHeader title="Response inspector">Review the most recent response, or one you reopened from history, and check its JSON against expected fields.</PageHeader>
      <ResponseInspector showEmptyLink />
    </>
  );
}
