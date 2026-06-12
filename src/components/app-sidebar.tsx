import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Package, ScrollText, Settings, Plus } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";

import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
} from "@/components/ui/sidebar";
import { useLogs } from "@/lib/log-store";
import { useCoupangStatus, type ConnStatus } from "@/lib/coupang-status";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "대시보드", icon: LayoutDashboard, exact: true },
  { to: "/products", label: "쿠팡 상품", icon: Package, exact: false },
  { to: "/register", label: "새 상품 등록", icon: Plus, exact: false },
  { to: "/logs", label: "로그", icon: ScrollText, exact: false },
  { to: "/settings", label: "설정", icon: Settings, exact: false },
] as const;

const CONN_META: Record<ConnStatus, { dot: string; label: string; cls: string }> =
  {
    connected: {
      dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]",
      label: "쿠팡 연결됨",
      cls: "text-emerald-300",
    },
    auth_failed: {
      dot: "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.7)]",
      label: "인증 실패",
      cls: "text-rose-300",
    },
    not_configured: {
      dot: "bg-muted-foreground",
      label: "쿠팡 미설정",
      cls: "text-muted-foreground",
    },
    checking: {
      dot: "bg-amber-400 animate-pulse",
      label: "확인 중",
      cls: "text-amber-300",
    },
    unknown: {
      dot: "bg-muted-foreground animate-pulse",
      label: "확인 중",
      cls: "text-muted-foreground",
    },
  };

export default function AppSidebar() {
  const { pathname } = useLocation();
  const logs = useLogs();
  const errorCount = logs.filter((l) => l.status === "error").length;
  const conn = useCoupangStatus();
  const m = CONN_META[conn.status];
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          to="/"
          className="flex items-center gap-2 px-2 py-1.5 font-mono text-base font-bold"
        >
          <span className="bg-gradient-accent inline-block size-2.5 shrink-0 rounded-full shadow-[0_0_10px_rgba(129,140,248,0.7)]" />
          <span className="text-gradient-accent group-data-[collapsible=icon]:hidden">
            Coupilot
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((n) => {
                const active = n.exact
                  ? pathname === n.to
                  : pathname.startsWith(n.to);
                return (
                  <SidebarMenuItem key={n.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={n.label}
                    >
                      <Link to={n.to}>
                        <n.icon />
                        <span>{n.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {n.to === "/logs" && errorCount > 0 && (
                      <SidebarMenuBadge className="text-rose-300">
                        {errorCount}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={conn.message || m.label}>
              <Link to="/settings">
                <span
                  className={cn("inline-block size-2 shrink-0 rounded-full", m.dot)}
                />
                <span className={m.cls}>{m.label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {version && (
          <div className="px-2 pb-0.5 font-mono text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
            v{version}
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
