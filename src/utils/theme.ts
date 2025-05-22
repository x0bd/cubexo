/**
 * Theme Manager - Handles dark/light mode preferences
 * Works with Tailwind's dark mode
 */

export class ThemeManager {
	private themeToggleBtn: HTMLElement | null;
	private themeKey = "cubexo-theme-preference";
	private initialTransition = "background-color 0.3s ease, color 0.3s ease";

	constructor() {
		this.themeToggleBtn = document.getElementById("theme-toggle");
	}

	public init(): void {
		// Always start with dark theme for our Vercel-inspired design
		this.enableDarkTheme(false);
		this.setupEventListeners();
		this.disableTransitionsTemporarily();
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

	private setupEventListeners(): void {
		// Toggle theme when button is clicked
		if (this.themeToggleBtn) {
			this.themeToggleBtn.addEventListener("click", () => {
				if (document.documentElement.classList.contains("dark")) {
					this.enableLightTheme();
				} else {
					this.enableDarkTheme();
				}
			});
		}
	}

	private enableDarkTheme(savePreference = true): void {
		// Apply dark mode class to html element for Tailwind
		document.documentElement.classList.add("dark");

		if (savePreference) {
			localStorage.setItem(this.themeKey, "dark");
		}

		// Update meta theme color
		this.updateMetaThemeColor("#111111");

		// Dispatch event for scene to update
		this.dispatchThemeChangeEvent("dark");
		console.log('Dark theme enabled');
	}

	private enableLightTheme(savePreference = true): void {
		// Remove dark mode class from html element for Tailwind
		document.documentElement.classList.remove("dark");

		if (savePreference) {
			localStorage.setItem(this.themeKey, "light");
		}

		// Update meta theme color - still dark for our dark UI
		this.updateMetaThemeColor("#111111");

		// Dispatch event for scene to update
		this.dispatchThemeChangeEvent("light");
		console.log('Light theme enabled');
	}

	private dispatchThemeChangeEvent(theme: "dark" | "light"): void {
		// Create and dispatch a custom event
		const event = new CustomEvent("themechange", {
			detail: { theme }
		});

		// Dispatch on window
		window.dispatchEvent(event);

		// Also dispatch on document for broader compatibility
		document.dispatchEvent(event);

		console.log(`Theme change event dispatched: ${theme}`);
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

	// Public method to get current theme
	public getCurrentTheme(): "dark" | "light" {
		return document.documentElement.classList.contains("dark")
			? "dark"
			: "light";
	}
}
