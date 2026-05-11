import { Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import TablePage from "./pages/TablePage";
import PaymentPage from "./pages/PaymentPage";
import StaffLoginPage from "./pages/StaffLoginPage";
import AdminLayout from "./pages/AdminLayout";
import TablesPage from "./pages/TablesPage";
import OrdersPage from "./pages/OrdersPage";
import StaffPage from "./pages/StaffPage";
import ReportsPage from "./pages/ReportsPage";
import MenuPage from "./pages/MenuPage";
import AuditPage from "./pages/AuditPage";
import AdminDashboard from "./pages/AdminDashboard";
import WaiterOrderPage from "./pages/WaiterOrderPage";
import TableLandingPage from "./pages/TableLandingPage";

function App() {
  return (
    <Routes>
      {/* Customer Routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/table/:qrCode" element={<TableLandingPage />} />
      <Route
        path="/table/:sessionToken/:participantId"
        element={<TablePage />}
      />
      <Route
        path="/payment/:sessionToken/:participantId"
        element={<PaymentPage />}
      />

      {/* Staff Login */}
      <Route path="/staff-login" element={<StaffLoginPage />} />

      {/* Admin Routes */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="tables" element={<TablesPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="waiter-order" element={<WaiterOrderPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="menu" element={<MenuPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="audit" element={<AuditPage />} />
      </Route>
    </Routes>
  );
}

export default App;
