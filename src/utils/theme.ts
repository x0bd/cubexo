/**
 * Class to manage theme switching functionality
 */
export class ThemeManager {
	private storageKey = "theme-preference";
	private toggleButton: HTMLElement | null;

	constructor() {
		this.toggleButton = document.getElementById("theme-toggle");
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
		// Get saved preference
		const savedTheme = localStorage.getItem(this.storageKey);

		if (savedTheme === "dark") {
			this.enableDarkTheme();
		} else if (savedTheme === "light") {
			this.enableLightTheme();
		} else {
			// No saved preference, check system
			const prefersDark =
				window.matchMedia &&
				window.matchMedia("(prefers-color-scheme: dark)").matches;

			if (prefersDark) {
				this.enableDarkTheme();
			} else {
				this.enableLightTheme();
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
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		mediaQuery.addEventListener("change", (e) => {
			// Only apply system preference if no saved preference exists
			if (!localStorage.getItem(this.storageKey)) {
				if (e.matches) {
					this.enableDarkTheme(false); // Don't save when system changes
				} else {
					this.enableLightTheme(false); // Don't save when system changes
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

		// Dispatch event for other components to react
		this.dispatchThemeChangeEvent(false);
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
