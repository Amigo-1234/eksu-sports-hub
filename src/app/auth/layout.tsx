import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Account", template: "%s · EKSU Sports" },
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: LayoutProps<"/auth">) {
  return <main className="mx-auto w-full max-w-sm flex-1 px-4 py-12">{children}</main>;
}
