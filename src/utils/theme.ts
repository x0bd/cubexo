/**
 * Theme Manager - Dark mode only
 * Works with Tailwind's dark mode
 */

export class ThemeManager {
	private initialTransition = "background-color 0.3s ease, color 0.3s ease";

	constructor() {
		// No theme toggle button needed
	}

	public init(): void {
		console.log('[ThemeManager] Initializing theme manager (dark mode only)...');
		
		// Always use dark theme
		this.enableDarkTheme();
		
		// Temporarily disable transitions during initial load
		this.disableTransitionsTemporarily();
		
		console.log('[ThemeManager] Initialization complete with dark theme');
	}

	private disableTransitionsTemporarily(): void {
		// Disable transitions during initial load to prevent flash
		document.body.style.transition = "none";

		// Force a reflow to ensure the transition is applied
		document.body.offsetHeight;

		// Re-enable transitions after a small delay
		setTimeout(() => {
			document.body.style.transition = this.initialTransition;
		}, 50);
	}

	private enableDarkTheme(): void {
		console.log('[ThemeManager] enableDarkTheme called.');
		// Apply dark mode class to html element for Tailwind
		document.documentElement.classList.add("dark");
		
		// Apply dark mode class to body for additional styling
		document.body.classList.add("dark-mode");

		// Update meta theme color
		this.updateMetaThemeColor("#111111");

		// Dispatch event for scene to update
		this.dispatchThemeChangeEvent("dark");
		console.log('[ThemeManager] Dark theme enabled and event dispatched.');
	}

	private dispatchThemeChangeEvent(theme: "dark"): void {
		console.log(`[ThemeManager] dispatchThemeChangeEvent called with theme: ${theme}`);
		// Create and dispatch a custom event
		const event = new CustomEvent("themechange", {
			detail: { theme }
		});

		// Dispatch on window
		window.dispatchEvent(event);
		console.log(`[ThemeManager] 'themechange' event dispatched on window with detail:`, event.detail);
	}

	private updateMetaThemeColor(color: string): void {
		// Update theme-color meta tag for mobile browsers
		let metaThemeColor = document.querySelector('meta[name="theme-color"]');

		if (!metaThemeColor) {
			metaThemeColor = document.createElement("meta");
			metaThemeColor.setAttribute("name", "theme-color");
			document.head.appendChild(metaThemeColor);
		}

		metaThemeColor.setAttribute("content", color);
		console.log(`Theme color updated to: ${color}`);
	}

	// Public method to get current theme - always returns dark now
	public getCurrentTheme(): "dark" {
		return "dark";
	}
}
