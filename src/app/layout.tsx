import type { Metadata } from "next";
import { Provider } from "@/components/provider";
export const metadata: Metadata = {
  title: { default: "Kitchen menu", template: "%s | Kitchen menu" },
  description: "Current menu and in-store display system.",
  robots: { index: false, follow: false }
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-GB"><body><Provider>{children}</Provider></body></html>;
}
