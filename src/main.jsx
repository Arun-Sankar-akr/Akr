import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";

import "./styles/global.css";
import "./styles/variables.css";
import "./styles/responsive.css";
import Develop from "./components/common/Develop";

createRoot(document.getElementById("root")).render(
    <StrictMode>
        <App />
        <Develop/>
    </StrictMode>
);