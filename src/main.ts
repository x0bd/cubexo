import "./style.css";
import { Scene } from "./core/Scene";
import { setupUI } from "./utils/ui";
import { loadingManager } from "./utils/loading";

// Create and initialize the scene
const init = async () => {
	try {
		// Show loading screen
		loadingManager.showLoading();

		// Create scene
		const scene = new Scene();

		// Wait for scene to initialize
		await scene.init();

		// Setup UI elements
		setupUI();

		// Hide loading screen when done
		loadingManager.hideLoading();

		// Handle cleanup on window unload
		window.addEventListener("beforeunload", () => {
			scene.dispose();
		});
	} catch (error) {
		console.error("Failed to initialize app:", error);
		loadingManager.showError("Failed to initialize application");
	}
};

// Start the application
init();
