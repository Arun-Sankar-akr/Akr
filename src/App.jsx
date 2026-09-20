import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ShopProvider } from "./context/ShopContext";
import { ThemeProvider } from "./context/ThemeContext";
import AppRoutes from "./routes/AppRoutes";

export default function App() {
    return (
        <ThemeProvider>
            <AuthProvider>
                <ShopProvider>
                    <BrowserRouter
                        future={{
                            v7_startTransition: true,
                            v7_relativeSplatPath: true,
                        }}
                    >
                        <AppRoutes />
                    </BrowserRouter>
                </ShopProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}