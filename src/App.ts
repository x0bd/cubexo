import { VoxelModelViewer } from "./scenes/VoxelModelViewer";
import { ModelLoader } from "./models/ModelLoader";
import { ModelSelector } from "./components/ModelSelector";
import { Voxelizer } from "./models/Voxelizer";
import * as THREE from "three";
import gsap from "gsap";
import { ExportFormat } from "./utils/ModelExporter";
import { ModelUploader } from "./utils/ModelUploader";
import { ThemeManager } from "./utils/theme"; // Added import for ThemeManager

export class App {
	private viewer: VoxelModelViewer;
	private modelLoader: ModelLoader;
	private modelSelector: ModelSelector;
	private voxelizer: Voxelizer;
	private modelUploader: ModelUploader;
	private themeManager: ThemeManager; // Declared themeManager property
	private isInitialized = false;
	private loaderElement: HTMLElement | null;
	private activeModelIdx = 1; // Start with Chicken (index 1)
	private userModels: { name: string; url: string; model: THREE.Group }[] =
		[];

	constructor() {
		// Log for debugging
		console.log("App constructor called");

		// Get DOM elements
		this.loaderElement = document.querySelector("#loader");

		// Initialize theme manager
		console.log('[App] Initializing ThemeManager...');
		this.themeManager = new ThemeManager();
		this.themeManager.init(); // Call init() to set up event listeners and initial theme
		console.log('[App] ThemeManager initialized and started.');
		// Initialize components
		this.viewer = new VoxelModelViewer();
		this.modelLoader = new ModelLoader();
		this.voxelizer = new Voxelizer();
		this.modelSelector = new ModelSelector();
		this.modelUploader = new ModelUploader();

		// Setup export buttons
		this.setupExportButton();
		this.setupPngExportButton();
		this.setupModelUploader();

		// Setup dock mode switchers
		this.setupModeSwitchers();
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

		// Load models
		this.loadModels();
	}

	private loadModels(): void {
		// Show loading message
		if (this.loaderElement) {
			this.loaderElement.innerHTML = "Loading models...";
		}

		// Get model URLs
		const modelURLs = this.modelLoader.getURLs();

		// Log for debugging
		console.log(`Loading ${modelURLs.length} models`);

		// Create preview scenes first
		modelURLs.forEach((_, modelIdx) => {
			this.modelSelector.createPreviewScene(modelIdx);
		});

		// Counter for loaded models
		let modelsLoadedCount = 0;

		// Load each model
		modelURLs.forEach((url, modelIdx) => {
			console.log(`Loading model ${modelIdx}: ${url}`);

			this.modelLoader.loadModel(
				url,
				(model) => {
					console.log(`Model ${modelIdx} loaded successfully`);

					// Get model name from URL
					const name = this.modelLoader.getModelNameFromUrl(url);

					// Add the model to the selector preview
					this.modelSelector.addModelPreview(
						{
							name,
							url,
							model,
						},
						modelIdx
					);

					// Voxelize the model
					const modelVoxels = this.voxelizer.voxelizeModel(
						modelIdx,
						model
					);
					console.log(
						`Model ${modelIdx} voxelized with ${modelVoxels.length} voxels`
					);

					// Add voxels to the viewer
					this.viewer.addVoxelsForModel(modelIdx, modelVoxels);

					// Increment counter
					modelsLoadedCount++;

					// First model loaded - start rendering
					if (modelsLoadedCount === 1) {
						console.log("First model loaded, starting render loop");
						if (this.loaderElement) {
							this.loaderElement.innerHTML =
								"Calculating voxels...";
						}
						this.viewer.startRenderLoop();
					}

					// All models loaded
					if (modelsLoadedCount === modelURLs.length) {
						console.log("All models loaded");

						// Fade out loader
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

						// Set active model in selector
						this.modelSelector.setActiveModelIndex(
							this.activeModelIdx
						);

						// Animate to initial model (Bonsai)
						this.viewer.setActiveModel(this.activeModelIdx);
						this.viewer.animateToModel(0, this.activeModelIdx);
					}
				},
				(error) => {
					console.error(`Error loading model ${modelIdx}:`, error);
				}
			);
		});
	}

	/**
	 * Setup the export button functionality
	 */
	private setupExportButton(): void {
		const exportButton = document.getElementById("export-model");
		if (!exportButton) return;

		// Simple OBJ export
		exportButton.addEventListener("click", () => {
			console.log("Exporting model as OBJ");
			this.exportCurrentModel();
		});
	}

	/**
	 * Setup the PNG export button functionality
	 */
	private setupPngExportButton(): void {
		const pngExportButton = document.getElementById("export-png");
		if (!pngExportButton) return;

		pngExportButton.addEventListener("click", () => {
			console.log("Exporting high-resolution PNG image");
			this.exportAsPng();
		});
	}

	/**
	 * Export the current model as GLB
	 */
	private exportCurrentModel(): void {
		if (!this.viewer) return;

		console.log(`Exporting model ${this.activeModelIdx} as GLB`);
		this.viewer.exportCurrentModel(ExportFormat.GLB);
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
				const modelData = {
					name,
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

				// Create preview scene for the model
				this.modelSelector.createPreviewScene(modelIdx);

				// Add the model to the selector preview
				this.modelSelector.addModelPreview(modelData, modelIdx);

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

				// Switch to the new model
				this.modelSelector.setActiveModelIndex(modelIdx);
				this.viewer.animateToModel(this.activeModelIdx, modelIdx);
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
			}

			// Reset input so same file can be uploaded again
			uploadInput.value = "";
		});

		// When upload is successful
		this.modelUploader.onModelUploaded = (
			model: THREE.Group,
			fileName: string
		) => {
			this.showNotification(`${fileName} uploaded successfully`);
		};
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
	 * Setup mode switchers in the dock
	 */
	private setupModeSwitchers(): void {
		const modes = ["normal", "edit", "fun"];

		// Add event listeners to each mode button
		modes.forEach((mode) => {
			const button = document.getElementById(`mode-${mode}`);
			if (!button) return;

			button.addEventListener("click", () => {
				// Remove active class from all buttons
				modes.forEach((m) => {
					const btn = document.getElementById(`mode-${m}`);
					if (btn) btn.classList.remove("active");
				});

				// Add active class to clicked button
				button.classList.add("active");

				// Switch mode based on clicked button
				this.switchMode(mode);
			});
		});

		// Move theme button functionality from panel to dock
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
	 * Switch application mode
	 */
	private switchMode(mode: string): void {
		console.log(`Switching to ${mode} mode`);

		// Handle mode-specific functionality
		switch (mode) {
			case "normal":
				// Standard conversion mode
				this.showNotification("STANDARD MODE");
				break;

			case "edit":
				// Voxel editing mode
				this.showNotification("VOXEL EDIT MODE", "success");
				break;

			case "fun":
				// Fun/Magic mode
				this.showNotification("MAGIC MODE ✨", "success");
				break;

			default:
				console.error(`Unknown mode: ${mode}`);
		}
	}
}
