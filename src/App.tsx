import { lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "./i18n/LanguageContext";
import { ToastProvider } from "./components/Toast";
import { DataProvider } from "./state/DataContext";
import { RoleProvider } from "./state/RoleContext";
import { Layout } from "./components/Layout";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Products = lazy(() => import("./pages/Products"));
const ImportOrders = lazy(() => import("./pages/ImportOrders"));
const NewImportOrder = lazy(() => import("./pages/NewImportOrder"));
const ImportOrderDetail = lazy(() => import("./pages/ImportOrderDetail"));
const Licenses = lazy(() => import("./pages/Licenses"));
const Customers = lazy(() => import("./pages/Customers"));
const CustomerDetail = lazy(() => import("./pages/CustomerDetail"));
const SalesOrders = lazy(() => import("./pages/SalesOrders"));
const NewSalesOrder = lazy(() => import("./pages/NewSalesOrder"));
const SalesOrderDetail = lazy(() => import("./pages/SalesOrderDetail"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Approvals = lazy(() => import("./pages/Approvals"));
const AuditTrail = lazy(() => import("./pages/AuditTrail"));
const Reports = lazy(() => import("./pages/Reports"));
const Suppliers = lazy(() => import("./pages/Suppliers"));
const Warehouses = lazy(() => import("./pages/Warehouses"));
const PriceLists = lazy(() => import("./pages/PriceLists"));
const TaxRates = lazy(() => import("./pages/TaxRates"));
const ReorderPolicies = lazy(() => import("./pages/ReorderPolicies"));
const StockMovements = lazy(() => import("./pages/StockMovements"));
const StockAlerts = lazy(() => import("./pages/StockAlerts"));
const LotTrace = lazy(() => import("./pages/LotTrace"));
const GoodsReceipts = lazy(() => import("./pages/GoodsReceipts"));
const ArDocuments = lazy(() => import("./pages/ArDocuments"));
const ArAging = lazy(() => import("./pages/ArAging"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Users = lazy(() => import("./pages/Users"));
const ExchangeRates = lazy(() => import("./pages/ExchangeRates"));
const Payables = lazy(() => import("./pages/Payables"));
const AccountingOverview = lazy(() => import("./pages/Accounting").then((m) => ({ default: m.AccountingOverview })));
const Journal = lazy(() => import("./pages/Accounting").then((m) => ({ default: m.Journal })));
const TrialBalance = lazy(() => import("./pages/Accounting").then((m) => ({ default: m.TrialBalance })));
const ProfitLoss = lazy(() => import("./pages/Accounting").then((m) => ({ default: m.ProfitLoss })));
const BalanceSheet = lazy(() => import("./pages/Accounting").then((m) => ({ default: m.BalanceSheet })));
const VatReturn = lazy(() => import("./pages/Accounting").then((m) => ({ default: m.VatReturn })));
const CompanyProfile = lazy(() => import("./pages/CompanyProfile"));
const Expenses = lazy(() => import("./pages/Finance").then((m) => ({ default: m.Expenses })));
const Withholding = lazy(() => import("./pages/Finance").then((m) => ({ default: m.Withholding })));
const ManualJournals = lazy(() => import("./pages/Finance").then((m) => ({ default: m.ManualJournals })));
const PeriodClosing = lazy(() => import("./pages/Finance").then((m) => ({ default: m.PeriodClosing })));
const BankReconciliation = lazy(() => import("./pages/Finance").then((m) => ({ default: m.BankReconciliation })));
const Quotations = lazy(() => import("./pages/Quotations"));
const PurchaseRequests = lazy(() => import("./pages/PurchaseRequests"));
const SalesOverview = lazy(() => import("./pages/SalesOverview"));
const PurchasingOverview = lazy(() => import("./pages/PurchasingOverview"));
const InventoryOverview = lazy(() => import("./pages/InventoryOverview"));
const TaxOverview = lazy(() => import("./pages/TaxOverview"));

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
                  <Route path="suppliers" element={<Suppliers />} />
                  <Route path="warehouses" element={<Warehouses />} />
                  <Route path="price-lists" element={<PriceLists />} />
                  <Route path="tax-rates" element={<TaxRates />} />
                  <Route path="reorder-policies" element={<ReorderPolicies />} />
                  <Route path="stock-movements" element={<StockMovements />} />
                  <Route path="stock-alerts" element={<StockAlerts />} />
                  <Route path="lot-trace" element={<LotTrace />} />
                  <Route path="goods-receipts" element={<GoodsReceipts />} />
                  <Route path="receipts" element={<ArDocuments />} />
                  <Route path="ar-aging" element={<ArAging />} />
                  <Route path="calendar" element={<Calendar />} />
                  <Route path="users" element={<Users />} />
                  <Route path="exchange-rates" element={<ExchangeRates />} />
                  <Route path="payables" element={<Payables />} />
                  <Route path="accounting" element={<AccountingOverview />} />
                  <Route path="accounting/journal" element={<Journal />} />
                  <Route path="accounting/trial-balance" element={<TrialBalance />} />
                  <Route path="accounting/profit-loss" element={<ProfitLoss />} />
                  <Route path="accounting/balance-sheet" element={<BalanceSheet />} />
                  <Route path="tax/vat-return" element={<VatReturn />} />
                  <Route path="tax/withholding" element={<Withholding />} />
                  <Route path="expenses" element={<Expenses />} />
                  <Route path="accounting/manual-journals" element={<ManualJournals />} />
                  <Route path="accounting/closing" element={<PeriodClosing />} />
                  <Route path="accounting/bank" element={<BankReconciliation />} />
                  <Route path="quotations" element={<Quotations />} />
                  <Route path="purchase-requests" element={<PurchaseRequests />} />
                  <Route path="company" element={<CompanyProfile />} />
                  <Route path="overview/sales" element={<SalesOverview />} />
                  <Route path="overview/purchasing" element={<PurchasingOverview />} />
                  <Route path="overview/inventory" element={<InventoryOverview />} />
                  <Route path="overview/tax" element={<TaxOverview />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </DataProvider>
        </RoleProvider>
      </ToastProvider>
    </LanguageProvider>
  );
}
