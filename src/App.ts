import { VoxelModelViewer } from "./scenes/VoxelModelViewer";
import { ModelLoader } from "./models/ModelLoader";
import { ModelSelector } from "./components/ModelSelector";
import { Voxelizer } from "./models/Voxelizer";
import * as THREE from "three";
import gsap from "gsap";

export class App {
	private viewer: VoxelModelViewer;
	private modelLoader: ModelLoader;
	private modelSelector: ModelSelector;
	private voxelizer: Voxelizer;
	private isInitialized = false;
	private loaderElement: HTMLElement | null;
	private activeModelIdx = 4; // Start with Bonsai (index 4)

	constructor() {
		this.loaderElement = document.querySelector("#loader");
		this.viewer = new VoxelModelViewer();
		this.modelLoader = new ModelLoader();
		this.voxelizer = new Voxelizer();
		this.modelSelector = new ModelSelector();
	}

	public async init(): Promise<void> {
		if (this.isInitialized) return;

		// Set up the scene
		this.viewer.init();
		this.loadModels();
	}

	private loadModels(): void {
		if (this.loaderElement) {
			this.loaderElement.innerHTML = "Loading models...";
		}

		// Load each model
		let modelsLoadedCount = 0;
		this.modelLoader.getURLs().forEach((url, modelIdx) => {
			// Create preview scene
			const scene = this.modelSelector.createPreviewScene(modelIdx);

			// Load the GLTF model
			this.modelLoader.loadModel(
				url,
				(model) => {
					// Add the model to the preview
					this.modelSelector.addModelToPreview(modelIdx, model);

					// Voxelize the model
					const modelVoxels = this.voxelizer.voxelizeModel(
						modelIdx,
						model
					);

					// Add voxels to the viewer
					this.viewer.addVoxelsForModel(modelIdx, modelVoxels);

					// Update loading status
					modelsLoadedCount++;
					if (modelsLoadedCount === 1) {
						// Once we have the first model loaded, start rendering
						if (this.loaderElement) {
							this.loaderElement.innerHTML =
								"calculating the voxels...";
						}
						this.viewer.startRenderLoop();
					}

					if (
						modelsLoadedCount === this.modelLoader.getURLs().length
					) {
						// All models loaded, fade out loader and animate to initial model
						if (this.loaderElement) {
							gsap.to(this.loaderElement, {
								duration: 0.3,
								opacity: 0,
							});
						}

						// Setup model selector events
						this.setupSelectorEvents();

						// Animate to the initial model (Bonsai)
						this.viewer.animateToModel(0, this.activeModelIdx);
					}
				},
				(error) => {
					console.error(`Error loading model: ${error}`);
				}
			);
		});
	}

	private setupSelectorEvents(): void {
		this.modelSelector.init((oldIndex, newIndex) => {
			this.viewer.animateToModel(oldIndex, newIndex);
			this.activeModelIdx = newIndex;
		});
	}
}
