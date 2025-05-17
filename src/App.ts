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
	private activeModelIdx = 4; // Start with Bonsai (index 4)
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

		// Listen for model cycle clicks
		this.setupModelCycling();
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

		console.log(`Exporting screenshot of model ${this.activeModelIdx}`);
		this.viewer.exportAsPng();
	}

	/**
	 * Listen for model cycle clicks
	 */
	private setupModelCycling(): void {
		// Listen for the custom model-cycle-click event from the viewer
		window.addEventListener("model-cycle-click", () => {
			// Find next model index
			const currentIdx = this.activeModelIdx;
			const modelCount = this.modelLoader.getURLs().length;
			const nextIdx = (currentIdx + 1) % modelCount;

			// Cycle to next model
			console.log(`Cycling to next model: ${currentIdx} → ${nextIdx}`);
			this.modelSelector.setActiveModelIndex(nextIdx);
			this.viewer.animateToModel(currentIdx, nextIdx);
			this.activeModelIdx = nextIdx;

			// Show click hint on first user click
			this.showClickHint();
		});
	}

	/**
	 * Show hint about clicking to cycle through models
	 */
	private showClickHint(): void {
		// Check if we've shown the hint before
		if (localStorage.getItem("cycle-hint-shown")) return;

		// Create hint element
		const hint = document.createElement("div");
		hint.className = "cycle-hint";
		hint.innerHTML = `
			<div class="hint-content">
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="15 10 20 15 15 20"></polyline>
					<path d="M4 4v7a4 4 0 0 0 4 4h12"></path>
				</svg>
				<span>Click anywhere to cycle models</span>
				<button class="hint-close">
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="18" y1="6" x2="6" y2="18"></line>
						<line x1="6" y1="6" x2="18" y2="18"></line>
					</svg>
				</button>
			</div>
		`;

		// Add to DOM
		document.body.appendChild(hint);

		// Track that we've shown the hint
		localStorage.setItem("cycle-hint-shown", "true");

		// Add close button functionality
		const closeBtn = hint.querySelector(".hint-close");
		closeBtn?.addEventListener("click", (e) => {
			e.stopPropagation();
			hint.classList.add("hint-fade-out");
			hint.addEventListener("animationend", () => {
				hint.remove();
			});
		});

		// Auto-close after 5 seconds
		setTimeout(() => {
			if (document.body.contains(hint)) {
				hint.classList.add("hint-fade-out");
				hint.addEventListener("animationend", () => {
					hint.remove();
				});
			}
		}, 5000);
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
				this.showUploadSuccess(name);
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
	}

	/**
	 * Show success notification after model upload
	 */
	private showUploadSuccess(modelName: string): void {
		// Create notification element
		const notification = document.createElement("div");
		notification.className = "export-notification";

		// Add checkmark icon for success
		const successIcon = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"svg"
		);
		successIcon.setAttribute("width", "16");
		successIcon.setAttribute("height", "16");
		successIcon.setAttribute("viewBox", "0 0 24 24");
		successIcon.setAttribute("fill", "none");
		successIcon.setAttribute("stroke", "currentColor");
		successIcon.setAttribute("stroke-width", "2");
		successIcon.setAttribute("stroke-linecap", "round");
		successIcon.setAttribute("stroke-linejoin", "round");

		const path = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"path"
		);
		path.setAttribute("d", "M20 6L9 17l-5-5");
		successIcon.appendChild(path);

		// Text content
		const textSpan = document.createElement("span");
		textSpan.textContent = `${modelName} uploaded and voxelized`;

		// Append elements
		notification.appendChild(successIcon);
		notification.appendChild(textSpan);

		// Style the container
		notification.style.display = "flex";
		notification.style.alignItems = "center";
		notification.style.gap = "6px";

		// Add to DOM
		document.body.appendChild(notification);

		// Remove after delay with fade-out animation
		setTimeout(() => {
			notification.classList.add("fade-out");
			notification.addEventListener("animationend", () => {
				notification.remove();
			});
		}, 3000);
	}
}
