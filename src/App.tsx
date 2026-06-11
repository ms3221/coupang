import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./routes/Dashboard";
import ProductsTab from "./routes/ProductsTab";
import Settings from "./routes/Settings";
import Register from "./routes/Register";
import Logs from "./routes/Logs";
import AppShell from "@/components/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { verifyCoupang } from "@/lib/coupang-status";
import { checkForUpdate } from "@/lib/updater";

function App() {
  // 앱 시작 시: 쿠팡 연결 검증 + 업데이트 확인
  useEffect(() => {
    verifyCoupang();
    checkForUpdate(); // silent — 새 버전 있으면 toast로 안내
  }, []);

  return (
    <>
      <AppShell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/products" element={<ProductsTab />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/register" element={<Register />} />
          <Route path="/logs" element={<Logs />} />
          {/* 이후 추가: /edit */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
      <Toaster position="top-right" richColors />
    </>
  );
}

export default App;
