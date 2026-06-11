import * as React from "react";

import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppSidebar from "./app-sidebar";

/** 앱 전체 셸: 고정 사이드바(접힘 가능) + 전체폭 콘텐츠.
 *  라우트 바깥에서 1회 감싸 접힘 상태가 페이지 이동에도 유지된다. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
            <SidebarTrigger />
          </header>
          <div className="flex-1 p-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
