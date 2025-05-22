import { VoxelModelViewer } from "./scenes/VoxelModelViewer";
import { ModelLoader } from "./models/ModelLoader";
import { ModelSelector } from "./components/ModelSelector";
import { Voxelizer } from "./models/Voxelizer";
import * as THREE from "three";
import gsap from "gsap";
import { ExportFormat } from "./utils/ModelExporter";
import { ModelUploader } from "./utils/ModelUploader";

export class App {
	private viewer: VoxelModelViewer;
	private modelLoader: ModelLoader;
	private modelSelector: ModelSelector;
	private voxelizer: Voxelizer;
	private modelUploader: ModelUploader;
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
		// Create notification element with Tailwind classes
		const notificationEl = document.createElement("div");
		notificationEl.className =
			"fixed top-8 left-1/2 -translate-x-1/2 py-3 px-4 rounded-lg shadow-lg flex items-center gap-3 backdrop-blur-sm z-50 " +
			(type === "success"
				? "bg-green-50/90 dark:bg-green-950/90 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-900"
				: "bg-red-50/90 dark:bg-red-950/90 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-900");

		// Add success icon
		const iconEl = document.createElement("span");

		// Create SVG icon based on type
		if (type === "success") {
			iconEl.innerHTML = `
				<svg viewBox="0 0 24 24" width="20" height="20" class="stroke-green-600 dark:stroke-green-400 fill-none stroke-2">
					<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
					<polyline points="22 4 12 14.01 9 11.01"></polyline>
				</svg>
			`;
		} else {
			iconEl.innerHTML = `
				<svg viewBox="0 0 24 24" width="20" height="20" class="stroke-red-600 dark:stroke-red-400 fill-none stroke-2">
					<circle cx="12" cy="12" r="10"></circle>
					<line x1="15" y1="9" x2="9" y2="15"></line>
					<line x1="9" y1="9" x2="15" y2="15"></line>
				</svg>
			`;
		}

		notificationEl.appendChild(iconEl);

		// Add message text
		const messageEl = document.createElement("span");
		messageEl.className = "font-medium text-sm";
		messageEl.textContent = message;
		notificationEl.appendChild(messageEl);

		// Add to DOM
		document.body.appendChild(notificationEl);

		// Animate and remove after delay
		setTimeout(() => {
			notificationEl.style.opacity = "0";
			notificationEl.style.transform = "translate(-50%, -20px)";
			notificationEl.style.transition =
				"opacity 0.5s ease, transform 0.5s ease";

			setTimeout(() => {
				document.body.removeChild(notificationEl);
			}, 500);
		}, 3000);
	}
}
