/**
 * Theme Manager - Handles dark/light mode preferences
 * Works with Tailwind's dark mode
 */

export class ThemeManager {
	private darkModeMediaQuery: MediaQueryList;
	private themeToggleBtn: HTMLElement | null;
	private darkThemeClass = "dark-theme";
	private themeKey = "cubexo-theme-preference";
	private initialTransition = "background-color 0.3s ease, color 0.3s ease";

	constructor() {
		this.darkModeMediaQuery = window.matchMedia(
			"(prefers-color-scheme: dark)"
		);
		this.themeToggleBtn = document.getElementById("theme-toggle");
	}

	public init(): void {
		this.loadThemePreference();
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

	private loadThemePreference(): void {
		const savedTheme = localStorage.getItem(this.themeKey);

		if (savedTheme === "dark") {
			this.enableDarkTheme(false);
		} else if (savedTheme === "light") {
			this.enableLightTheme(false);
		} else {
			// No saved preference, use system preference
			if (this.darkModeMediaQuery.matches) {
				this.enableDarkTheme(false);
			} else {
				this.enableLightTheme(false);
			}
		}
	}

	private setupEventListeners(): void {
		// Toggle theme when button is clicked
		if (this.themeToggleBtn) {
			this.themeToggleBtn.addEventListener("click", () => {
				if (document.body.classList.contains(this.darkThemeClass)) {
					this.enableLightTheme();
				} else {
					this.enableDarkTheme();
				}
			});
		}

		// Listen for system theme changes
		this.darkModeMediaQuery.addEventListener("change", (e) => {
			// Only apply system preference if no manual preference is set
			if (!localStorage.getItem(this.themeKey)) {
				if (e.matches) {
					this.enableDarkTheme(false);
				} else {
					this.enableLightTheme(false);
				}
			}
		});
	}

	private enableDarkTheme(savePreference = true): void {
		document.body.classList.add(this.darkThemeClass);
		document.documentElement.classList.add("dark");

		if (savePreference) {
			localStorage.setItem(this.themeKey, "dark");
		}
		// Update meta theme color
		this.updateMetaThemeColor("#000000");

		// Dispatch event for other components that need to be aware of theme changes
		window.dispatchEvent(
			new CustomEvent("themechange", {
				detail: { theme: "dark" },
			})
		);
	}

	private enableLightTheme(savePreference = true): void {
		document.body.classList.remove(this.darkThemeClass);
		document.documentElement.classList.remove("dark");

		if (savePreference) {
			localStorage.setItem(this.themeKey, "light");
		}
		// Update meta theme color
		this.updateMetaThemeColor("#ffffff");

		// Dispatch event for other components that need to be aware of theme changes
		window.dispatchEvent(
			new CustomEvent("themechange", {
				detail: { theme: "light" },
			})
		);
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
	}

	// Public method to get current theme
	public getCurrentTheme(): "dark" | "light" {
		return document.body.classList.contains(this.darkThemeClass)
			? "dark"
			: "light";
	}
}
