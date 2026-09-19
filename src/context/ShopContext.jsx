import { createContext, useContext, useState } from "react";

const ShopContext = createContext(null);

export function ShopProvider({ children }) {
  const [shop, setShop] = useState({
    name: "PrintPoint",
    subtitle: "Xerox & Digital Services",
    currency: "INR",
    timezone: "Asia/Kolkata"
  });
  return <ShopContext.Provider value={{ shop, setShop }}>{children}</ShopContext.Provider>;
}
export const useShop = () => useContext(ShopContext);
