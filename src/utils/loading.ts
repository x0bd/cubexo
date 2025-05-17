import { gsap } from "gsap";

class LoadingManager {
	private loadingScreen: HTMLDivElement | null = null;
	private loadingProgress: HTMLDivElement | null = null;
	private loadingProgressBar: HTMLDivElement | null = null;
	private loadingText: HTMLDivElement | null = null;

	constructor() {
		this.createLoadingScreen();
	}

	private createLoadingScreen(): void {
		// Create loading screen
		this.loadingScreen = document.createElement("div");
		this.loadingScreen.className = "loading-screen";

		// Create loading text
		this.loadingText = document.createElement("div");
		this.loadingText.className = "loading-text";
		this.loadingText.textContent = "Loading...";
		this.loadingScreen.appendChild(this.loadingText);

		// Create progress container
		this.loadingProgress = document.createElement("div");
		this.loadingProgress.className = "loading-progress";
		this.loadingScreen.appendChild(this.loadingProgress);

		// Create progress bar
		this.loadingProgressBar = document.createElement("div");
		this.loadingProgressBar.className = "loading-progress-bar";
		this.loadingProgress.appendChild(this.loadingProgressBar);

		// Add to body
		document.body.appendChild(this.loadingScreen);

		// Hide initially
		this.loadingScreen.style.display = "none";
	}

	public showLoading(): void {
		if (this.loadingScreen) {
			this.loadingScreen.style.display = "flex";

			// Animate progress bar
			if (this.loadingProgressBar) {
				gsap.to(this.loadingProgressBar, {
					width: "100%",
					duration: 3,
					ease: "power1.inOut",
				});
			}
		}
	}

	public hideLoading(): void {
		if (this.loadingScreen) {
			gsap.to(this.loadingScreen, {
				opacity: 0,
				duration: 0.5,
				onComplete: () => {
					if (this.loadingScreen) {
						this.loadingScreen.style.display = "none";
						this.loadingScreen.style.opacity = "1";
					}
				},
			});
		}
	}

	public updateProgress(progress: number): void {
		if (this.loadingProgressBar) {
			const percentage = Math.min(100, Math.max(0, progress * 100));
			gsap.to(this.loadingProgressBar, {
				width: `${percentage}%`,
				duration: 0.3,
				ease: "power1.out",
			});
		}
	}

	public showError(message: string): void {
		if (this.loadingText) {
			this.loadingText.textContent = `Error: ${message}`;
			this.loadingText.style.color = "#ff0000";
		}
	}
}

// Create a singleton instance
export const loadingManager = new LoadingManager();
