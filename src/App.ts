import { VoxelModelViewer } from "./scenes/VoxelModelViewer";
import { ModelLoader } from "./models/ModelLoader";
import { ModelSelector } from "./components/ModelSelector";
import { Voxelizer } from "./models/Voxelizer";
import * as THREE from "three";
import gsap from "gsap";
import { ExportFormat } from "./utils/ModelExporter";
import { ModelUploader } from "./utils/ModelUploader";
import { ThemeManager } from "./utils/theme"; // Added import for ThemeManager
import { AudioVisualizer } from "./utils/AudioVisualizer"; // Import the AudioVisualizer

export class App {
	private viewer: VoxelModelViewer;
	private modelLoader: ModelLoader;
	private modelSelector: ModelSelector;
	private voxelizer: Voxelizer;
	private modelUploader: ModelUploader;
	private themeManager: ThemeManager; // Declared themeManager property
	private audioVisualizer: AudioVisualizer; // Declare AudioVisualizer property
	private isInitialized = false;
	private loaderElement: HTMLElement | null;
	private activeModelIdx = 0; // Use first model (chicken)
	private userModels: { name: string; url: string; model: THREE.Group }[] =
		[];

	constructor() {
		// Log for debugging
		console.log("App constructor called");

		// Get DOM elements
		this.loaderElement = document.querySelector("#loader");

		// Initialize theme manager
		console.log("[App] Initializing ThemeManager...");
		this.themeManager = new ThemeManager();
		this.themeManager.init(); // Call init() to set up event listeners and initial theme
		console.log("[App] ThemeManager initialized and started.");

		// Initialize components
		this.viewer = new VoxelModelViewer();
		this.modelLoader = new ModelLoader();
		this.voxelizer = new Voxelizer();
		this.modelSelector = new ModelSelector();
		this.modelUploader = new ModelUploader();
		this.audioVisualizer = new AudioVisualizer(); // Initialize AudioVisualizer

		// Remove model panel elements completely
		this.removeModelPanel();

		// Setup export panel buttons
		this.setupExportPanelButtons();

		// Setup theme toggle and utility buttons
		this.setupThemeToggle();

		// Restore these important functions for uploading from the dock
		this.setupUploadButton();
		this.setupModelUploader();

		// Setup effect buttons
		this.setupEffectButtons();

		// Listen for custom notification events
		this.setupNotificationListener();

		// Minimal setup for modelSelector - we only need it for the active model tracking
		this.modelSelector.init((oldIdx, newIdx) => {
			if (this.viewer) {
				this.viewer.setActiveModel(newIdx);
			}
		});

		// No need to call these since we've removed the model panel
		// this.modelSelector.setupModelCycling();
		// this.modelSelector.setupModelPreviews();
	}

	public async init(): Promise<void> {
		if (this.isInitialized) return;
		this.isInitialized = true;

		// Log for debugging
		console.log("App initializing");

		// Initialize the viewer
		this.viewer.init();

		// Initialize the selector with callback for model switching
		this.modelSelector.init((oldIndex, newIndex) => {
			console.log(`Model selected: ${oldIndex} -> ${newIndex}`);
			this.viewer.animateToModel(oldIndex, newIndex);
			this.activeModelIdx = newIndex;
		});

		// Set audio data callback for the viewer
		this.audioVisualizer.setCallback((audioData) => {
			this.viewer.updateWithAudioData(audioData);
		});

		// Load the chicken model
		this.loadModels();
	}

	private loadModels(): void {
		// Show loading message
		if (this.loaderElement) {
			this.loaderElement.innerHTML = "Loading chicken model...";
		}

		// Get model URLs (should be just one now - the chicken)
		const modelURLs = this.modelLoader.getURLs();

		// Log for debugging
		console.log(`Loading ${modelURLs.length} models`);

		// No need to create preview element since we've removed the model panel
		// this.modelSelector.createPreviewElement(0);

		// Load the chicken model
		const url = modelURLs[0];
		console.log(`Loading chicken model: ${url}`);

		this.modelLoader.loadModel(
			url,
			(model) => {
				console.log(`Chicken model loaded successfully`);

				// Get model name from URL
				const name = this.modelLoader.getModelNameFromUrl(url);

				// Store model data but don't create preview
				const modelData = {
					name,
					url,
					model,
				};

				// Store in modelSelector using the proper method
				this.modelSelector.storeModelData(modelData, 0);

				// Voxelize the model
				const modelVoxels = this.voxelizer.voxelizeModel(0, model);
				console.log(
					`Chicken model voxelized with ${modelVoxels.length} voxels`
				);

				// Add voxels to the viewer
				this.viewer.addVoxelsForModel(0, modelVoxels);

				// Start rendering
				console.log("Chicken model loaded, starting render loop");
				if (this.loaderElement) {
					this.loaderElement.innerHTML = "Calculating voxels...";
				}
				this.viewer.startRenderLoop();

				// Fade out loader
				if (this.loaderElement) {
					gsap.to(this.loaderElement, {
						duration: 0.3,
						opacity: 0,
						onComplete: () => {
							if (this.loaderElement) {
								this.loaderElement.style.display = "none";
							}
						},
					});
				}

				// Set active model in viewer directly
				this.viewer.setActiveModel(0);
			},
			(error) => {
				console.error(`Error loading chicken model:`, error);
			}
		);
	}

	/**
	 * Setup the export panel buttons functionality
	 */
	private setupExportPanelButtons(): void {
		// Picture export button
		const pictureButton = document.getElementById("export-picture");
		if (pictureButton) {
			pictureButton.addEventListener("click", () => {
				console.log("Exporting high-resolution PNG image");
				this.exportAsPng();
				this.showNotification("Image exported");
			});
		}

		// Model export button
		const modelButton = document.getElementById("export-model");
		if (modelButton) {
			modelButton.addEventListener("click", () => {
				console.log("Exporting model as GLB");
				this.exportCurrentModel();
				this.showNotification("Model exported as GLB");
			});
		}

		// GIF export button
		const gifButton = document.getElementById("export-gif");
		if (gifButton) {
			gifButton.addEventListener("click", async () => {
				console.log("Exporting as GIF animation");
				if (this.viewer) {
					// Disable button during GIF generation to prevent multiple clicks
					gifButton.setAttribute("disabled", "true");
					gifButton.classList.add("opacity-50", "cursor-not-allowed");

					this.showNotification(
						"Generating GIF frames...",
						"success"
					);
					try {
						await this.viewer.exportTurntableGifFrames();
						console.log("Turntable GIF generation completed");
					} catch (error) {
						console.error("Error generating GIF:", error);
						this.showNotification("Error generating GIF", "error");
					} finally {
						// Re-enable button
						gifButton.removeAttribute("disabled");
						gifButton.classList.remove(
							"opacity-50",
							"cursor-not-allowed"
						);
					}
				}
			});
		}

		// Download button
		const downloadButton = document.getElementById("export-download");
		if (downloadButton) {
			downloadButton.addEventListener("click", () => {
				console.log("Download current export");
				this.exportCurrentModel();
				this.showNotification("Model downloaded");
			});
		}

		// Share button
		const shareButton = document.getElementById("export-share");
		if (shareButton) {
			shareButton.addEventListener("click", () => {
				console.log("Share current model");
				// TODO: Implement sharing functionality
				this.showNotification("Sharing coming soon");
			});
		}

		// AR Mode button (coming soon)
		const arModeButton = document.getElementById("export-ar-mode");
		if (arModeButton) {
			arModeButton.addEventListener("click", () => {
				console.log("AR Mode button clicked");
				this.showNotification("AR Mode coming soon");
			});
		}
	}

	/**
	 * Setup notification listener for custom events
	 */
	private setupNotificationListener(): void {
		window.addEventListener("showNotification", (e: Event) => {
			const customEvent = e as CustomEvent;
			if (customEvent.detail) {
				this.showNotification(
					customEvent.detail.message,
					customEvent.detail.type || "success"
				);
			}
		});
	}

	/**
	 * Export current model in the selected format
	 */
	private exportCurrentModel(): void {
		// The format is determined inside the viewer method with a default of ExportFormat.OBJ
		this.viewer.exportCurrentModel();
		this.showNotification("Model exported successfully");
	}

	/**
	 * Export the current view as a high-resolution PNG image
	 */
	private exportAsPng(): void {
		if (!this.viewer) return;

		console.log(`Exporting model ${this.activeModelIdx} as PNG`);
		this.viewer.exportAsPng();
		this.showNotification("Image exported");
	}

	/**
	 * Show notification
	 */
	private showNotification(
		message: string,
		type: "success" | "error" = "success"
	): void {
		// Create notification element with updated premium Japanese design
		const notificationEl = document.createElement("div");
		notificationEl.className =
			"fixed bottom-6 right-6 py-2.5 px-3.5 rounded-lg shadow-xl flex items-center gap-3 z-50 " +
			"bg-zinc-900/80 backdrop-blur-md border border-zinc-700/50 " +
			(type === "success" ? "text-emerald-500" : "text-rose-500");

		// Add icon with premium styling
		const iconEl = document.createElement("span");
		iconEl.className = "flex items-center justify-center";

		// Create SVG icon based on type
		if (type === "success") {
			iconEl.innerHTML = `
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle">
					<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
					<polyline points="22 4 12 14.01 9 11.01"/>
				</svg>
			`;
		} else {
			iconEl.innerHTML = `
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-circle">
					<circle cx="12" cy="12" r="10"/>
					<line x1="12" y1="8" x2="12" y2="12"/>
					<line x1="12" y1="16" x2="12.01" y2="16"/>
				</svg>
			`;
		}

		notificationEl.appendChild(iconEl);

		// Add message text with premium Japanese-style typography
		const messageEl = document.createElement("span");
		messageEl.className =
			"text-xs jp tracking-wide uppercase text-zinc-200";
		messageEl.textContent = message;
		notificationEl.appendChild(messageEl);

		// Add to DOM
		document.body.appendChild(notificationEl);

		// Animate appearance
		gsap.fromTo(
			notificationEl,
			{ y: 20, opacity: 0 },
			{ y: 0, opacity: 1, duration: 0.3, ease: "power2.out" }
		);

		// Animate and remove after delay
		setTimeout(() => {
			gsap.to(notificationEl, {
				y: 10,
				opacity: 0,
				duration: 0.4,
				ease: "power3.in",
				onComplete: () => {
					document.body.removeChild(notificationEl);
				},
			});
		}, 3000);
	}

	/**
	 * Setup effect buttons in the effects panel
	 */
	private setupEffectButtons(): void {
		// Setup shake effect button
		const shakeButton = document.getElementById("effect-shake");
		if (shakeButton) {
			shakeButton.addEventListener("click", () => {
				console.log("Applying shake effect");
				// Apply the shake effect to the current model
				this.viewer.applyShakeEffect();

				// Add active state to button
				shakeButton.classList.add(
					"bg-indigo-700/90",
					"border-indigo-600/70"
				);
				setTimeout(() => {
					shakeButton.classList.remove(
						"bg-indigo-700/90",
						"border-indigo-600/70"
					);
				}, 800); // Duration slightly longer than the effect
			});
		}

		// Setup explode effect button
		const explodeButton = document.getElementById("effect-explode");
		if (explodeButton) {
			explodeButton.addEventListener("click", () => {
				console.log("Applying explode effect");
				// Apply the explode effect to the current model
				this.viewer.applyExplodeEffect();

				// Add active state to button
				explodeButton.classList.add(
					"bg-indigo-700/90",
					"border-indigo-600/70"
				);
				setTimeout(() => {
					explodeButton.classList.remove(
						"bg-indigo-700/90",
						"border-indigo-600/70"
					);
				}, 900); // Duration slightly longer than the effect (explode is 0.3s + 0.1s + 0.5s animation)
			});
		}

		// Setup audio reactive button
		const audioReactiveButton = document.getElementById(
			"effect-audio-reactive"
		);
		if (audioReactiveButton) {
			audioReactiveButton.addEventListener("click", () => {
				console.log("Opening audio visualizer panel");
				this.audioVisualizer.showPanel();

				// Add active state to button
				audioReactiveButton.classList.add(
					"bg-indigo-700/90",
					"border-indigo-600/70"
				);
				setTimeout(() => {
					audioReactiveButton.classList.remove(
						"bg-indigo-700/90",
						"border-indigo-600/70"
					);
				}, 300);
			});
		}

		// Setup for other effect buttons will be added here in the future
		// Each effect will follow a similar pattern to the shake and explode effects
	}

	/**
	 * Setup theme toggle button
	 */
	private setupThemeToggle(): void {
		const themeToggle = document.getElementById("theme-toggle");
		if (themeToggle) {
			themeToggle.addEventListener("click", () => {
				const isDark =
					document.documentElement.classList.contains("dark");
				document.documentElement.classList.toggle("dark");

				// Dispatch custom event for components to react to theme change
				window.dispatchEvent(
					new CustomEvent("themechange", {
						detail: { theme: !isDark ? "dark" : "light" },
					})
				);
			});
		}
	}

	/**
	 * Remove all model panel elements from the DOM
	 */
	private removeModelPanel(): void {
		// Remove model panel elements
		const modelPanel = document.getElementById("model-panel");
		if (modelPanel) {
			modelPanel.remove();
		}

		// Remove selector container
		const selectorContainer = document.getElementById("selector-container");
		if (selectorContainer) {
			selectorContainer.remove();
		}

		// Remove model navigation buttons
		const prevModel = document.getElementById("prev-model");
		if (prevModel) {
			prevModel.remove();
		}

		const nextModel = document.getElementById("next-model");
		if (nextModel) {
			nextModel.remove();
		}

		// Remove model panel toggle
		const toggleModelPanel = document.getElementById("toggle-model-panel");
		if (toggleModelPanel) {
			toggleModelPanel.remove();
		}

		// Adjust layout if needed to give more space to the main viewport
		const mainContainer = document.getElementById("main-container");
		if (mainContainer) {
			mainContainer.classList.remove("grid-cols-[1fr_auto]");
			mainContainer.classList.add("grid-cols-1");
		}

		// Ensure export panel is still visible and properly positioned
		const exportPanel = document.getElementById("export-panel");
		if (exportPanel) {
			exportPanel.classList.add("fixed", "top-6", "right-6", "z-30");
		}

		console.log("Model panel elements removed, only export panel remains");
	}

	/**
	 * Setup the model upload button
	 */
	private setupModelUploader(): void {
		const uploadInput = document.getElementById(
			"model-upload"
		) as HTMLInputElement;
		if (!uploadInput) return;

		uploadInput.addEventListener("change", async (event) => {
			const target = event.target as HTMLInputElement;
			const files = target.files;

			if (!files || files.length === 0) return;

			const file = files[0];

			// Show loading message
			if (this.loaderElement) {
				this.loaderElement.innerHTML = "Processing uploaded model...";
				this.loaderElement.style.display = "block";
				this.loaderElement.style.opacity = "1";
			}

			try {
				// Load the model
				const model = await this.modelUploader.loadUserModel(file);

				// Get model name from file
				const name = ModelUploader.getModelNameFromFile(file);

				// Create a data URL as a placeholder "url" for the model
				// Add a prefix to indicate this is a user-uploaded model for proper scaling
				const modelData = {
					name: `user-model-${name}`, // Add prefix to help with identification
					url: `user-model://${name}`,
					model,
				};

				// Add to user models
				this.userModels.push(modelData);

				// Create a new index for this model
				const modelIdx =
					this.modelLoader.getURLs().length +
					this.userModels.length -
					1;

				// Store model data (even though we don't show previews)
				this.modelSelector.storeModelData(modelData, modelIdx);

				// Voxelize the model
				const modelVoxels = this.voxelizer.voxelizeModel(
					modelIdx,
					model
				);
				console.log(
					`User model voxelized with ${modelVoxels.length} voxels`
				);

				// Add voxels to the viewer
				this.viewer.addVoxelsForModel(modelIdx, modelVoxels);

				// Switch to the new model - use setActiveModel instead of animateToModel
				// to avoid transition glitches
				this.viewer.setActiveModel(modelIdx);
				this.activeModelIdx = modelIdx;

				// Hide the loader
				if (this.loaderElement) {
					gsap.to(this.loaderElement, {
						duration: 0.3,
						opacity: 0,
						onComplete: () => {
							if (this.loaderElement) {
								this.loaderElement.style.display = "none";
							}
						},
					});
				}

				// Show success notification
				this.showNotification(`${name} uploaded successfully`);
			} catch (error) {
				console.error("Error processing uploaded model:", error);

				// Show error message
				if (this.loaderElement) {
					this.loaderElement.innerHTML = "Error processing model";
					setTimeout(() => {
						if (this.loaderElement) {
							gsap.to(this.loaderElement, {
								duration: 0.3,
								opacity: 0,
								onComplete: () => {
									if (this.loaderElement) {
										this.loaderElement.style.display =
											"none";
									}
								},
							});
						}
					}, 2000);
				}

				this.showNotification("Error processing model", "error");
			} finally {
				// Reset the file input value so the same file can be uploaded again if needed
				uploadInput.value = "";
			}
		});
	}

	/**
	 * Setup upload button in the dock
	 */
	private setupUploadButton(): void {
		const uploadBtn = document.getElementById("upload-btn");
		if (!uploadBtn) return;

		uploadBtn.addEventListener("click", () => {
			console.log("Triggering model upload from dock button");
			// Trigger the file input click
			const fileInput = document.getElementById(
				"model-upload"
			) as HTMLInputElement;
			if (fileInput) {
				fileInput.click();
			}
		});
	}
}
