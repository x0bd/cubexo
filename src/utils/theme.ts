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
		console.log('[ThemeManager] Initializing theme manager...');
		
		// Check if user has a saved preference
		const savedTheme = localStorage.getItem(this.themeKey);
		console.log(`[ThemeManager] Saved theme preference: ${savedTheme || 'none'}`);
		
		// Apply theme based on preference or default to dark
		if (savedTheme === 'light') {
			this.enableLightTheme(false);
		} else {
			// Default to dark theme for our Vercel-inspired design
			this.enableDarkTheme(false);
		}
		
		// Set up event listeners for theme toggle button
		this.setupEventListeners();
		
		// Temporarily disable transitions during initial load
		this.disableTransitionsTemporarily();
		
		console.log(`[ThemeManager] Initialization complete with theme: ${this.getCurrentTheme()}`);
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
				this.toggleTheme();
			});
		}
	}

	public toggleTheme(): void {
		console.log('[ThemeManager] toggleTheme called.');
		const currentTheme = this.getCurrentTheme();
		console.log(`[ThemeManager] Current theme before toggle: ${currentTheme}`);
		if (currentTheme === "dark") {
			this.enableLightTheme();
		} else {
			this.enableDarkTheme();
		}
		console.log(`[ThemeManager] Current theme after toggle: ${this.getCurrentTheme()}`);
	}

	private enableDarkTheme(savePreference = true): void {
		console.log('[ThemeManager] enableDarkTheme called.');
		// Apply dark mode class to html element for Tailwind
		document.documentElement.classList.add("dark");
		
		// Apply dark mode class to body for additional styling
		document.body.classList.add("dark-mode");
		document.body.classList.remove("light-mode");

		if (savePreference) {
			localStorage.setItem(this.themeKey, "dark");
			console.log('[ThemeManager] Dark theme preference saved to localStorage.');
		}

		// Update meta theme color
		this.updateMetaThemeColor("#111111");

		// Dispatch event for scene to update
		this.dispatchThemeChangeEvent("dark");
		console.log('[ThemeManager] Dark theme enabled and event dispatched.');
	}

	private enableLightTheme(savePreference = true): void {
		console.log('[ThemeManager] enableLightTheme called.');
		// Remove dark mode class from html element for Tailwind
		document.documentElement.classList.remove("dark");
		
		// Apply light mode class to body for additional styling
		document.body.classList.add("light-mode");
		document.body.classList.remove("dark-mode");

		if (savePreference) {
			localStorage.setItem(this.themeKey, "light");
			console.log('[ThemeManager] Light theme preference saved to localStorage.');
		}

		// Update meta theme color for light mode
		this.updateMetaThemeColor("#f4f4f5"); // zinc-100

		// Dispatch event for scene to update
		this.dispatchThemeChangeEvent("light");
		console.log('[ThemeManager] Light theme enabled and event dispatched.');
	}

	private dispatchThemeChangeEvent(theme: "dark" | "light"): void {
		console.log(`[ThemeManager] dispatchThemeChangeEvent called with theme: ${theme}`);
		// Create and dispatch a custom event
		const event = new CustomEvent("themechange", {
			detail: { theme }
		});

		// Dispatch on window
		window.dispatchEvent(event);
		console.log(`[ThemeManager] 'themechange' event dispatched on window with detail:`, event.detail);

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
