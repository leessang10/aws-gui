import { createRoot } from "react-dom/client";
import App from "./app";
import "./styles.css";
import { applyTheme } from "./theme";
applyTheme();
createRoot(document.getElementById("app")!).render(<App />);
