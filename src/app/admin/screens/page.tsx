import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin-dashboard";
export const metadata: Metadata = { title: "Screen management", robots: { index: false, follow: false } };
export default function ScreensPage() { return <AdminDashboard />; }
