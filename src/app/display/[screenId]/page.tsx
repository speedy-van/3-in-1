import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DisplayPlayer } from "@/components/display-player";
export const metadata: Metadata = { title: "Menu display", robots: { index: false, follow: false } };
export default async function DisplayPage({ params }: { params: Promise<{ screenId: string }> }) {
  const { screenId } = await params;
  if (!/^[1-6]$/.test(screenId)) notFound();
  return <DisplayPlayer screenId={Number(screenId)} />;
}
