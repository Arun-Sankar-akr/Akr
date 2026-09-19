import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

// Auth
import Login from "../pages/auth/Login";

// Guards
import ProtectedRoute from "./ProtectedRoute";
import AdminRoute from "./AdminRoute";
import AttendantRoute from "./AttendantRoute";

// Layouts
import AdminLayout from "../components/layout/AdminLayout";
import AttendantLayout from "../components/layout/AttendantLayout";

// Admin Dashboard
import AdminDashboard from "../pages/admin/AdminDashboard";

// Admin Transactions
import Transactions from "../pages/admin/Transactions";
import TransactionDetails from "../pages/admin/TransactionDetails";

// Admin New Transaction
import NewTransaction from "../pages/attendant/NewTransaction";

// Accounts
import DailyAccounts from "../pages/admin/Accounts/DailyAccounts";
import MonthlyAccounts from "../pages/admin/Accounts/MonthlyAccounts";
import YearlyAccounts from "../pages/admin/Accounts/YearlyAccounts";
import ProfitReport from "../pages/admin/Accounts/ProfitReport";

// Services
import Services from "../pages/admin/Services/Services";
import AddService from "../pages/admin/Services/AddService";
import EditService from "../pages/admin/Services/EditService";

// Expenses
import Expenses from "../pages/admin/Expenses/Expenses";
import AddExpense from "../pages/admin/Expenses/AddExpense";

// Staff
import Staff from "../pages/admin/Staff/Staff";
import AddStaff from "../pages/admin/Staff/AddStaff";
import StaffDetails from "../pages/admin/Staff/StaffDetails";

// Inventory
import Inventory from "../pages/admin/Inventory/Inventory";
import AddStock from "../pages/admin/Inventory/AddStock";
import StockHistory from "../pages/admin/Inventory/StockHistory";

// Customers
import Customers from "../pages/admin/Customers/Customers";
import CustomerDetails from "../pages/admin/Customers/CustomerDetails";

// Cash
import CashRegister from "../pages/admin/Cash/CashRegister";
import CashHistory from "../pages/admin/Cash/CashHistory";

// Money Services
import MoneyTransfer from "../pages/admin/MoneyServices/MoneyTransfer";
import Withdrawal from "../pages/admin/MoneyServices/Withdrawal";
import AadhaarATM from "../pages/admin/MoneyServices/AadhaarATM";

// Reports
import SalesReport from "../pages/admin/Reports/SalesReport";
import ExpenseReport from "../pages/admin/Reports/ExpenseReport";
import ServiceReport from "../pages/admin/Reports/ServiceReport";
import StaffReport from "../pages/admin/Reports/StaffReport";

// Admin Tools
import AuditLogs from "../pages/admin/AuditLogs";
import Settings from "../pages/admin/Settings";

// Attendant
import AttendantDashboard from "../pages/attendant/AttendantDashboard";
import MyTransactions from "../pages/attendant/MyTransactions";
import AttCash from "../pages/attendant/CashRegister";
import AttMoney from "../pages/attendant/MoneyTransfer";
import AttWithdrawal from "../pages/attendant/Withdrawal";
import AttCustomers from "../pages/attendant/Customers";


export default function AppRoutes() {
    return (
        <Routes>

            {/* =====================================================
          PUBLIC
      ===================================================== */}

            <Route path="/login" element={<Login />} />


            {/* =====================================================
          ADMIN
      ===================================================== */}

            <Route element={<ProtectedRoute />}>

                <Route element={<AdminRoute />}>

                    <Route element={<AdminLayout />}>

                        {/* Admin dashboard */}
                        <Route
                            path="/admin/dashboard"
                            element={<AdminDashboard />}
                        />

                        {/* If /admin is opened */}
                        <Route
                            path="/admin"
                            element={
                                <Navigate
                                    to="/admin/dashboard"
                                    replace
                                />
                            }
                        />

                        {/* Transactions */}
                        <Route
                            path="/admin/transactions"
                            element={<Transactions />}
                        />

                        <Route
                            path="/admin/transactions/:id"
                            element={<TransactionDetails />}
                        />

                        <Route
                            path="/admin/new-transaction"
                            element={<NewTransaction />}
                        />


                        {/* =================================================
                ACCOUNTS
            ================================================= */}

                        <Route
                            path="/admin/accounts/daily"
                            element={<DailyAccounts />}
                        />

                        <Route
                            path="/admin/accounts/monthly"
                            element={<MonthlyAccounts />}
                        />

                        <Route
                            path="/admin/accounts/yearly"
                            element={<YearlyAccounts />}
                        />

                        <Route
                            path="/admin/accounts/profit"
                            element={<ProfitReport />}
                        />


                        {/* =================================================
                SERVICES
            ================================================= */}

                        <Route
                            path="/admin/services"
                            element={<Services />}
                        />

                        <Route
                            path="/admin/services/add"
                            element={<AddService />}
                        />

                        <Route
                            path="/admin/services/:id/edit"
                            element={<EditService />}
                        />


                        {/* =================================================
                EXPENSES
            ================================================= */}

                        <Route
                            path="/admin/expenses"
                            element={<Expenses />}
                        />

                        <Route
                            path="/admin/expenses/add"
                            element={<AddExpense />}
                        />


                        {/* =================================================
                STAFF
            ================================================= */}

                        <Route
                            path="/admin/staff"
                            element={<Staff />}
                        />

                        <Route
                            path="/admin/staff/add"
                            element={<AddStaff />}
                        />

                        <Route
                            path="/admin/staff/:id"
                            element={<StaffDetails />}
                        />


                        {/* =================================================
                INVENTORY
            ================================================= */}

                        <Route
                            path="/admin/inventory"
                            element={<Inventory />}
                        />

                        <Route
                            path="/admin/inventory/add"
                            element={<AddStock />}
                        />

                        <Route
                            path="/admin/inventory/history"
                            element={<StockHistory />}
                        />


                        {/* =================================================
                CUSTOMERS
            ================================================= */}

                        <Route
                            path="/admin/customers"
                            element={<Customers />}
                        />

                        <Route
                            path="/admin/customers/:id"
                            element={<CustomerDetails />}
                        />


                        {/* =================================================
                CASH
            ================================================= */}

                        <Route
                            path="/admin/cash"
                            element={<CashRegister />}
                        />

                        <Route
                            path="/admin/cash/history"
                            element={<CashHistory />}
                        />


                        {/* =================================================
                MONEY SERVICES
            ================================================= */}

                        <Route
                            path="/admin/money-transfer"
                            element={<MoneyTransfer />}
                        />

                        <Route
                            path="/admin/withdrawal"
                            element={<Withdrawal />}
                        />

                        <Route
                            path="/admin/aadhaar-atm"
                            element={<AadhaarATM />}
                        />


                        {/* =================================================
                REPORTS
            ================================================= */}

                        <Route
                            path="/admin/reports/sales"
                            element={<SalesReport />}
                        />

                        <Route
                            path="/admin/reports/expenses"
                            element={<ExpenseReport />}
                        />

                        <Route
                            path="/admin/reports/services"
                            element={<ServiceReport />}
                        />

                        <Route
                            path="/admin/reports/staff"
                            element={<StaffReport />}
                        />


                        {/* =================================================
                ADMIN TOOLS
            ================================================= */}

                        <Route
                            path="/admin/audit"
                            element={<AuditLogs />}
                        />

                        <Route
                            path="/admin/settings"
                            element={<Settings />}
                        />

                    </Route>

                </Route>

            </Route>


            {/* =====================================================
          ATTENDANT
      ===================================================== */}

            <Route element={<ProtectedRoute />}>

                <Route element={<AttendantRoute />}>

                    <Route element={<AttendantLayout />}>

                        <Route
                            path="/attendant"
                            element={<AttendantDashboard />}
                        />

                        <Route
                            path="/attendant/new-transaction"
                            element={<NewTransaction />}
                        />

                        <Route
                            path="/attendant/transactions"
                            element={<MyTransactions />}
                        />

                        <Route
                            path="/attendant/cash"
                            element={<AttCash />}
                        />

                        <Route
                            path="/attendant/money-transfer"
                            element={<AttMoney />}
                        />

                        <Route
                            path="/attendant/withdrawal"
                            element={<AttWithdrawal />}
                        />

                        <Route
                            path="/attendant/customers"
                            element={<AttCustomers />}
                        />

                    </Route>

                </Route>

            </Route>


            {/* =====================================================
          FALLBACK
      ===================================================== */}

            <Route
                path="*"
                element={<Navigate to="/login" replace />}
            />

        </Routes>
    );
}