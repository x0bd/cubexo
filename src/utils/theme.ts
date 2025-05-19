/**
 * Class to manage theme switching functionality
 */
export class ThemeManager {
	private static readonly STORAGE_KEY = "theme-preference";
	private onThemeChangeCallback: ((isDark: boolean) => void) | null = null;

	constructor() {
		// Nothing to do here
	}

	/**
	 * Initialize theme based on saved preference or system settings
	 * @param onThemeChange Optional callback when theme changes
	 */
	public init(onThemeChange?: (isDark: boolean) => void): void {
		if (onThemeChange) {
			this.onThemeChangeCallback = onThemeChange;
		}

		// Set up the button
		const themeToggle = document.getElementById("theme-toggle");
		if (themeToggle) {
			themeToggle.addEventListener("click", () => this.toggleTheme());
		}

		// Initialize based on saved preference or system setting
		this.initializeTheme();

		// Listen for system preference changes
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		mediaQuery.addEventListener("change", (e) => {
			// Only update if the user hasn't set a preference
			if (!localStorage.getItem(ThemeManager.STORAGE_KEY)) {
				this.setTheme(e.matches);
			}
		});
	}

	/**
	 * Initialize theme based on saved preference or system settings
	 */
	private initializeTheme(): void {
		// Check local storage first
		const storedTheme = localStorage.getItem(ThemeManager.STORAGE_KEY);
		if (storedTheme === "dark" || storedTheme === "light") {
			this.setTheme(storedTheme === "dark");
			return;
		}

		// Fall back to system preference
		const prefersDark = window.matchMedia(
			"(prefers-color-scheme: dark)"
		).matches;
		this.setTheme(prefersDark);
	}

	/**
	 * Toggle between light and dark themes
	 */
	public toggleTheme(): void {
		const isDark = document.documentElement.classList.contains("dark");
		this.setTheme(!isDark);
	}

	/**
	 * Set the theme (dark or light)
	 * @param dark Whether to enable dark theme
	 */
	private setTheme(dark: boolean): void {
		if (dark) {
			document.documentElement.classList.add("dark");
			localStorage.setItem(ThemeManager.STORAGE_KEY, "dark");
			document.head
				.querySelector('meta[name="color-scheme"]')
				?.setAttribute("content", "dark");
		} else {
			document.documentElement.classList.remove("dark");
			localStorage.setItem(ThemeManager.STORAGE_KEY, "light");
			document.head
				.querySelector('meta[name="color-scheme"]')
				?.setAttribute("content", "light");
		}

		// Call the callback if provided
		if (this.onThemeChangeCallback) {
			this.onThemeChangeCallback(dark);
		}

		// Dispatch custom event for other components
		const event = new CustomEvent("theme-changed", { detail: { dark } });
		window.dispatchEvent(event);
	}
}
