import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "./i18n/LanguageContext";
import { ToastProvider } from "./components/Toast";
import { DataProvider } from "./state/DataContext";
import { RoleProvider } from "./state/RoleContext";
import { Layout } from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import ImportOrders from "./pages/ImportOrders";
import NewImportOrder from "./pages/NewImportOrder";
import ImportOrderDetail from "./pages/ImportOrderDetail";
import Licenses from "./pages/Licenses";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import SalesOrders from "./pages/SalesOrders";
import NewSalesOrder from "./pages/NewSalesOrder";
import SalesOrderDetail from "./pages/SalesOrderDetail";
import Inventory from "./pages/Inventory";
import Approvals from "./pages/Approvals";
import AuditTrail from "./pages/AuditTrail";
import Reports from "./pages/Reports";

export default function App() {
  return (
    <LanguageProvider>
      <ToastProvider>
        <RoleProvider>
          <DataProvider>
            <BrowserRouter>
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="products" element={<Products />} />
                  <Route path="import-orders" element={<ImportOrders />} />
                  <Route path="import-orders/new" element={<NewImportOrder />} />
                  <Route path="import-orders/:orderNo" element={<ImportOrderDetail />} />
                  <Route path="licenses" element={<Licenses />} />
                  <Route path="customers" element={<Customers />} />
                  <Route path="customers/:customerId" element={<CustomerDetail />} />
                  <Route path="sales-orders" element={<SalesOrders />} />
                  <Route path="sales-orders/new" element={<NewSalesOrder />} />
                  <Route path="sales-orders/:orderNo" element={<SalesOrderDetail />} />
                  <Route path="inventory" element={<Inventory />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="approvals" element={<Approvals />} />
                  <Route path="audit-trail" element={<AuditTrail />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </DataProvider>
        </RoleProvider>
      </ToastProvider>
    </LanguageProvider>
  );
}
