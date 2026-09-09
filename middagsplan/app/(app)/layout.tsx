import { BottomNav } from "@/components/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-dvh w-full bg-app-bg flex justify-center overflow-hidden">
      <div className="w-full max-w-[480px] h-dvh flex flex-col bg-app-bg">
        <main className="flex-1 min-h-0 overflow-y-auto px-5 pt-5 pb-4">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}
