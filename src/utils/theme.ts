/**
 * Class to manage theme switching functionality
 */
export class ThemeManager {
	private storageKey = "theme-preference";
	private toggleButton: HTMLElement | null;
	private mediaQuery: MediaQueryList;

	constructor() {
		this.toggleButton = document.getElementById("theme-toggle");
		this.mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
	}

	/**
	 * Initialize the theme manager
	 */
	public init(): void {
		// Set initial theme
		this.initializeTheme();

		// Set up event listeners
		this.setupEventListeners();
	}

	/**
	 * Initialize theme based on storage or system preference
	 */
	private initializeTheme(): void {
		// Check for saved user preference
		const savedTheme = localStorage.getItem(this.storageKey);

		if (savedTheme === "dark") {
			this.enableDarkTheme();
		} else if (savedTheme === "light") {
			this.enableLightTheme();
		} else {
			// No saved preference, use system preference
			if (this.mediaQuery.matches) {
				this.enableDarkTheme(false); // Don't save when using system preference
			} else {
				this.enableLightTheme(false); // Don't save when using system preference
			}
		}
	}

	/**
	 * Set up event listeners for theme toggle and system preference changes
	 */
	private setupEventListeners(): void {
		// Toggle button click
		if (this.toggleButton) {
			this.toggleButton.addEventListener("click", () => {
				const isDark =
					document.documentElement.classList.contains("dark-theme");
				if (isDark) {
					this.enableLightTheme();
				} else {
					this.enableDarkTheme();
				}
			});
		}

		// System preference change
		this.mediaQuery.addEventListener("change", (e) => {
			// Only apply system preference if no saved preference exists
			if (!localStorage.getItem(this.storageKey)) {
				if (e.matches) {
					this.enableDarkTheme(false);
				} else {
					this.enableLightTheme(false);
				}
			}
		});
	}

	/**
	 * Enable dark theme
	 */
	private enableDarkTheme(save: boolean = true): void {
		document.documentElement.classList.add("dark-theme");
		document.documentElement.setAttribute("color-scheme", "dark");

		if (save) {
			localStorage.setItem(this.storageKey, "dark");
		}

		// Update text contrast for UI elements
		this.updateUIForDarkTheme();

		// Dispatch event for other components to react
		this.dispatchThemeChangeEvent(true);
	}

	/**
	 * Enable light theme
	 */
	private enableLightTheme(save: boolean = true): void {
		document.documentElement.classList.remove("dark-theme");
		document.documentElement.setAttribute("color-scheme", "light");

		if (save) {
			localStorage.setItem(this.storageKey, "light");
		}

		// Update text contrast for UI elements
		this.updateUIForLightTheme();

		// Dispatch event for other components to react
		this.dispatchThemeChangeEvent(false);
	}

	/**
	 * Update UI elements specifically for dark theme
	 * This ensures better text visibility
	 */
	private updateUIForDarkTheme(): void {
		// Any specific dark mode adjustments can go here
		const loader = document.getElementById("loader");
		if (loader) {
			loader.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.25)";
		}
	}

	/**
	 * Update UI elements specifically for light theme
	 * This ensures better text visibility
	 */
	private updateUIForLightTheme(): void {
		// Any specific light mode adjustments can go here
		const loader = document.getElementById("loader");
		if (loader) {
			loader.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)";
		}
	}

	/**
	 * Dispatch a custom event when the theme changes
	 */
	private dispatchThemeChangeEvent(isDark: boolean): void {
		const event = new CustomEvent("theme-changed", {
			detail: { isDark },
		});
		window.dispatchEvent(event);
	}
}
