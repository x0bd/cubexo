import "./style.css";
import { App } from "./App";
import { ThemeManager } from "./utils/theme";

// Initialize the application
const app = new App();
app.init();

// Initialize theme manager
const themeManager = new ThemeManager();
themeManager.init();
