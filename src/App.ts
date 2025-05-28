import { VoxelModelViewer } from "./scenes/VoxelModelViewer";
import { ModelLoader } from "./models/ModelLoader";
import { ModelSelector } from "./components/ModelSelector";
import { Voxelizer } from "./models/Voxelizer";
import * as THREE from "three";
import gsap from "gsap";
import { ExportFormat } from "./utils/ModelExporter";
import { ModelUploader } from "./components/ModelUploader";
import { ThemeManager } from "./utils/theme";
import { AudioVisualizer } from "./utils/AudioVisualizer";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { AppParameters, ModelData, Voxel } from "../types/types";

export class App {
	private params: AppParameters;
	public viewer: VoxelModelViewer;
	public modelSelector: ModelSelector;
	private modelLoader: ModelLoader;
	private voxelizer: Voxelizer;
	private modelUploader: ModelUploader;
	private themeManager: ThemeManager;
	private audioVisualizer: AudioVisualizer;
	private isInitialized = false;
	private loaderElement: HTMLElement | null;
	private activeModelIdx = 1;
	private userModels: ModelData[] = [];
	private notificationElement!: HTMLElement;
	private notificationTimeout: number | null = null;

	private demoModels: ModelData[] = [
		{
			name: "Chili Pepper",
			url: "https://ksenia-k.com/models/Chili%20Pepper.glb",
			model: null,
			voxels: [],
			originalIndex: 0,
		},
		{
			name: "Chicken",
			url: "https://ksenia-k.com/models/Chicken.glb",
			model: null,
			voxels: [],
			originalIndex: 1,
		},
		{
			name: "Cherry",
			url: "https://ksenia-k.com/models/Cherry.glb",
			model: null,
			voxels: [],
			originalIndex: 2,
		},
		{
			name: "Banana Bundle",
			url: "https://ksenia-k.com/models/Banana%20Bundle.glb",
			model: null,
			voxels: [],
			originalIndex: 3,
		},
		{
			name: "Bonsai",
			url: "https://ksenia-k.com/models/Bonsai.glb",
			model: null,
			voxels: [],
			originalIndex: 4,
		},
		{
			name: "Egg",
			url: "https://ksenia-k.com/models/egg.glb",
			model: null,
			voxels: [],
			originalIndex: 5,
		},
	];

	constructor(params?: Partial<AppParameters>) {
		this.params = {
			...params,
		} as AppParameters;

		console.log("App constructor called");
		this.loaderElement = document.querySelector("#loader");
		console.log("[App] Initializing ThemeManager...");
		this.themeManager = new ThemeManager();
		this.themeManager.init();
		console.log("[App] ThemeManager initialized and started.");

		this.viewer = new VoxelModelViewer();
		this.modelLoader = new ModelLoader();
		this.voxelizer = new Voxelizer();
		this.modelSelector = new ModelSelector();
		this.modelUploader = new ModelUploader(
			this.viewer,
			this.modelSelector,
			this
		);
		this.audioVisualizer = new AudioVisualizer();

		this.initNotificationSystem();
		this.init();
	}

	private initNotificationSystem(): void {
		this.notificationElement = document.createElement("div");
		this.notificationElement.className =
			"fixed bottom-6 right-6 p-4 rounded-lg shadow-xl text-sm font-geist-mono tracking-wide transition-all duration-300 ease-in-out transform opacity-0 translate-y-2 pointer-events-none flex items-center";
		document.body.appendChild(this.notificationElement);
		this.notificationTimeout = null;
	}

	public async init(): Promise<void> {
		if (this.isInitialized) return;
		this.isInitialized = true;

		console.log("App initializing");

		this.viewer.init();

		this.modelSelector.init((oldIndex, newIndex) => {
			console.log(`Model selected: ${oldIndex} -> ${newIndex}`);
			this.viewer.animateToModel(oldIndex, newIndex);
			this.activeModelIdx = newIndex;
		});

		this.audioVisualizer.setCallback((audioData) => {
			this.viewer.updateWithAudioData(audioData);
		});

		this.loadModels();
	}

	private loadModels(): void {
		if (this.loaderElement) {
			this.loaderElement.innerHTML = "Loading models...";
		}
		const modelURLs = this.modelLoader.getURLs();
		console.log(`Loading ${modelURLs.length} models`);
		modelURLs.forEach((_, modelIdx) => {
			this.modelSelector.createPreviewScene(modelIdx);
		});

		let modelsLoadedCount = 0;
		modelURLs.forEach((url, modelIdx) => {
			console.log(`Loading model ${modelIdx}: ${url}`);
			this.modelLoader.loadModel(
				url,
				(model) => {
					console.log(`Model ${modelIdx} loaded successfully`);
					const name = this.modelLoader.getModelNameFromUrl(url);

					const newModelData: ModelData = {
						name,
						url,
						model,
						voxels: [],
						originalIndex: modelIdx,
					};

					this.modelSelector.addModelPreview(newModelData, modelIdx);

					const modelVoxels = this.voxelizer.voxelizeModel(
						modelIdx,
						model
					);
					console.log(
						`Model ${modelIdx} voxelized with ${modelVoxels.length} voxels`
					);
					this.viewer.addVoxelsForModel(modelIdx, modelVoxels);
					modelsLoadedCount++;
					if (modelsLoadedCount === 1) {
						console.log("First model loaded, starting render loop");
						if (this.loaderElement) {
							this.loaderElement.innerHTML =
								"Calculating voxels...";
						}
						this.viewer.startRenderLoop();
					}
					if (modelsLoadedCount === modelURLs.length) {
						console.log("All models loaded");
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
						this.modelSelector.setActiveModelIndex(
							this.activeModelIdx
						);
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

	private setupExportPanelButtons(): void {
		const pictureButton = document.getElementById("export-picture");
		if (pictureButton) {
			pictureButton.addEventListener("click", () => {
				console.log("Exporting high-resolution PNG image");
				this.exportAsPng();
				this.showNotification("Image exported");
			});
		}

		const modelButton = document.getElementById("export-model");
		if (modelButton) {
			modelButton.addEventListener("click", () => {
				console.log("Exporting model as GLB");
				this.exportCurrentModel();
				this.showNotification("Model exported as GLB");
			});
		}

		const gifButton = document.getElementById("export-gif");
		if (gifButton) {
			gifButton.addEventListener("click", () => {
				console.log("Exporting as GIF animation");
				this.showNotification("GIF export coming soon");
			});
		}

		const audioReactiveButton = document.getElementById(
			"export-audio-reactive"
		);
		if (audioReactiveButton) {
			audioReactiveButton.addEventListener("click", () => {
				console.log("Opening audio visualizer panel");
				this.audioVisualizer.showPanel();
			});
		}

		const downloadButton = document.getElementById("export-download");
		if (downloadButton) {
			downloadButton.addEventListener("click", () => {
				console.log("Download current export");
				this.exportCurrentModel();
				this.showNotification("Model downloaded");
			});
		}

		const shareButton = document.getElementById("export-share");
		if (shareButton) {
			shareButton.addEventListener("click", () => {
				console.log("Share current model");
				this.showNotification("Sharing coming soon");
			});
		}
	}

	private setupNotificationListener(): void {
		window.addEventListener("show-notification", ((event: CustomEvent) => {
			const { message, type } = event.detail;
			this.showNotification(message, type);
		}) as EventListener);
	}

	private exportCurrentModel(): void {
		if (!this.viewer) return;

		console.log(`Exporting model ${this.activeModelIdx} as GLB`);
		this.viewer.exportCurrentModel(ExportFormat.GLB);
	}

	private exportAsPng(): void {
		if (!this.viewer) return;

		console.log(`Exporting model ${this.activeModelIdx} as PNG`);
		this.viewer.exportAsPng();
		this.showNotification("Image exported");
	}

	private setupEffectButtons(): void {
		const shakeButton = document.getElementById("effect-shake");
		if (shakeButton) {
			shakeButton.addEventListener("click", () => {
				console.log("Applying shake effect");
				this.viewer.applyShakeEffect();

				shakeButton.classList.add(
					"bg-indigo-700/90",
					"border-indigo-600/70"
				);
				setTimeout(() => {
					shakeButton.classList.remove(
						"bg-indigo-700/90",
						"border-indigo-600/70"
					);
				}, 800);
			});
		}

		const explodeButton = document.getElementById("effect-explode");
		if (explodeButton) {
			explodeButton.addEventListener("click", () => {
				console.log("Applying explode effect");
				this.viewer.applyExplodeEffect();

				explodeButton.classList.add(
					"bg-indigo-700/90",
					"border-indigo-600/70"
				);
				setTimeout(() => {
					explodeButton.classList.remove(
						"bg-indigo-700/90",
						"border-indigo-600/70"
					);
				}, 900);
			});
		}
	}

	private setupThemeToggle(): void {
		const themeToggle = document.getElementById("theme-toggle");
		if (themeToggle) {
			themeToggle.addEventListener("click", () => {
				const isDark =
					document.documentElement.classList.contains("dark");
				document.documentElement.classList.toggle("dark");

				window.dispatchEvent(
					new CustomEvent("themechange", {
						detail: { theme: !isDark ? "dark" : "light" },
					})
				);
			});
		}
	}

	private setupUploadButton(): void {
		const uploadBtn = document.getElementById("upload-btn");
		if (!uploadBtn) return;

		uploadBtn.addEventListener("click", () => {
			console.log("Triggering model upload");
			const fileInput = document.getElementById(
				"model-upload"
			) as HTMLInputElement;
			if (fileInput) {
				fileInput.click();
			}
		});
	}

	private loadDemoModels(): void {
		const loader = new GLTFLoader();
		this.demoModels.forEach((modelData, index) => {
			this.modelSelector.createPreviewScene(modelData.originalIndex);

			loader.load(
				modelData.url,
				(gltf) => {
					const loadedModel = gltf.scene;
					const modelToUpdate = this.demoModels.find(
						(m) => m.originalIndex === modelData.originalIndex
					);
					if (modelToUpdate) {
						modelToUpdate.model = loadedModel;
					} else {
						console.error(
							`Could not find modelData for originalIndex ${modelData.originalIndex} to update with loaded GLTF.`
						);
					}
					this.modelSelector.addModelPreview(
						modelToUpdate,
						modelData.originalIndex
					);

					if (index === 0) {
						this.modelSelector.setActiveModelIndex(
							modelData.originalIndex
						);
						this.viewer.setActiveModel(modelData.originalIndex);
					}
				},
				undefined,
				(error) => {
					console.error(
						`Error loading demo model ${modelData.name}:`,
						error
					);
					this.showNotification(
						`Error loading ${modelData.name}`,
						"error"
					);
				}
			);
		});
	}

	public showNotification(
		message: string,
		type: "success" | "error" | "info" = "info",
		duration: number = 3000
	): void {
		if (!this.notificationElement) this.initNotificationSystem();
		if (this.notificationTimeout) clearTimeout(this.notificationTimeout);
		this.notificationElement.className =
			"fixed bottom-6 right-6 p-4 rounded-lg shadow-xl text-sm font-geist-mono tracking-wide transition-all duration-300 ease-in-out transform opacity-0 translate-y-2 flex items-center pointer-events-none";
		let iconHtml = "";
		switch (type) {
			case "success":
				this.notificationElement.classList.add(
					"bg-green-500/20",
					"text-green-300",
					"border",
					"border-green-500/30"
				);
				iconHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle-2 mr-2 text-green-400"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>`;
				break;
			case "error":
				this.notificationElement.classList.add(
					"bg-red-500/20",
					"text-red-300",
					"border",
					"border-red-500/30"
				);
				iconHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-circle mr-2 text-red-400"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`;
				break;
			case "info":
			default:
				this.notificationElement.classList.add(
					"bg-blue-500/20",
					"text-blue-300",
					"border",
					"border-blue-500/30"
				);
				iconHtml = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info mr-2 text-blue-400"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;
				break;
		}
		this.notificationElement.innerHTML = `${iconHtml}<span>${message}</span>`;
		requestAnimationFrame(() => {
			this.notificationElement.classList.remove(
				"opacity-0",
				"translate-y-2",
				"pointer-events-none"
			);
			this.notificationElement.classList.add(
				"opacity-100",
				"translate-y-0"
			);
		});
		if (duration > 0) {
			this.notificationTimeout = window.setTimeout(
				() => this.clearNotification(),
				duration
			);
		}
	}

	public clearNotification(): void {
		if (!this.notificationElement) return;
		if (this.notificationTimeout) clearTimeout(this.notificationTimeout);
		this.notificationTimeout = null;
		this.notificationElement.classList.remove(
			"opacity-100",
			"translate-y-0"
		);
		this.notificationElement.classList.add(
			"opacity-0",
			"translate-y-2",
			"pointer-events-none"
		);
	}
}
