import { VoxelModelViewer } from "./scenes/VoxelModelViewer";
import { ModelLoader } from "./models/ModelLoader";
import { ModelSelector } from "./components/ModelSelector";
import { Voxelizer } from "./models/Voxelizer";
import * as THREE from "three";
import gsap from "gsap";

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
	private activeModelIdx = 0; // Use first model (flower)
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

		// Add free models question mark toggle
		this.createFreeModelsToggle();

		// Listen for custom notification events
		this.setupNotificationListener();

		// Minimal setup for modelSelector - we only need it for the active model tracking
		this.modelSelector.init((_, newIdx) => {
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

		// Load the flower model
		this.loadModels();
	}

	private loadModels(): void {
		// Show loading message
		if (this.loaderElement) {
			this.loaderElement.innerHTML = "Loading flower model...";
		}

		// Get model URLs (should be just one now - the flower)
		const modelURLs = this.modelLoader.getURLs();

		// Log for debugging
		console.log(`Loading ${modelURLs.length} models`);

		// No need to create preview element since we've removed the model panel
		// this.modelSelector.createPreviewElement(0);

		// Load the flower model
		const url = modelURLs[0];
		console.log(`Loading flower model: ${url}`);

		this.modelLoader.loadModel(
			url,
			(model) => {
				console.log(`Flower model loaded successfully`);

				// Get model name from URL
				const name = this.modelLoader.getModelNameFromUrl(url);

				// Preprocess model to ensure colors are preserved, similar to uploaded models
				this.preprocessModel(model);

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
					`Flower model voxelized with ${modelVoxels.length} voxels`
				);

				// Add voxels to the viewer
				this.viewer.addVoxelsForModel(0, modelVoxels);

				// Start rendering
				console.log("Flower model loaded, starting render loop");
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
				console.error(`Error loading flower model:`, error);
			}
		);
	}

	/**
	 * Preprocess model to ensure colors are preserved, similar to how ModelUploader handles it
	 */
	private preprocessModel(model: THREE.Group): void {
		// Check if this is likely the default model or an uploaded model
		const isDefaultModel = this.userModels.length === 0;
		console.log("Processing model, isDefaultModel:", isDefaultModel);

		// Ensure all objects in the model preserve colors
		model.traverse((obj) => {
			if (obj instanceof THREE.Mesh) {
				obj.castShadow = true;
				obj.receiveShadow = true;

				// Handle different material types while preserving colors
				if (obj.material) {
					// Handle material arrays
					if (Array.isArray(obj.material)) {
						obj.material = obj.material.map((mat) =>
							this.processMaterial(mat)
						);
					} else {
						obj.material = this.processMaterial(obj.material);
					}
				}
			}
		});

		// Only add vibrant colors for the default model
		// For uploaded models, we want to preserve the original colors
		if (isDefaultModel) {
			this.ensureVibrantColors(model);
		} else {
			console.log("Skipping color enhancement for uploaded model");
		}
	}

	/**
	 * Process a material to ensure it's suitable for voxelization while preserving color
	 */
	private processMaterial(material: THREE.Material): THREE.Material {
		// If it's already a standard material, just ensure properties are set
		if (material instanceof THREE.MeshStandardMaterial) {
			const newMat = material.clone();
			newMat.roughness = 0.3;
			newMat.metalness = 0.2;
			return newMat;
		}

		// Extract color from various material types
		let color = new THREE.Color(0xffffff);

		// Try to get the color from the material - preserve original colors
		if ("color" in material && material.color instanceof THREE.Color) {
			color = material.color.clone();

			// Log color for debugging
			console.log(
				`Material color found: r=${color.r.toFixed(
					2
				)}, g=${color.g.toFixed(2)}, b=${color.b.toFixed(2)}`
			);

			// Check if it's a red material - ensure we preserve red colors
			if (color.r > 0.7 && color.g < 0.3 && color.b < 0.3) {
				console.log("Preserving red color");
				// Make sure it's a vibrant red
				color.r = Math.max(color.r, 0.9);
				color.g = Math.min(color.g, 0.2);
				color.b = Math.min(color.b, 0.2);
			}

			// Check if it's a white material - ensure we preserve white colors
			if (color.r > 0.9 && color.g > 0.9 && color.b > 0.9) {
				console.log("Preserving white color");
				color.setRGB(1, 1, 1);
			}
		} else if (
			"emissive" in material &&
			material.emissive instanceof THREE.Color &&
			!material.emissive.equals(new THREE.Color(0x000000)) // Only use emissive if it's not black
		) {
			// MeshPhongMaterial and MeshStandardMaterial have emissive
			color = material.emissive.clone();
		} else if ("map" in material && material.map) {
			// If there's a texture, use a consistent color based on the texture
			// Generate a deterministic color from the texture
			let textureId = 0;
			const map = material.map as THREE.Texture;

			// Check if material name contains color hints
			if (material.name) {
				const name = material.name.toLowerCase();
				if (name.includes("red")) {
					console.log("Material name suggests red color");
					return new THREE.MeshStandardMaterial({
						color: new THREE.Color(0xf44336),
						roughness: 0.3,
						metalness: 0.2,
					});
				} else if (name.includes("white")) {
					console.log("Material name suggests white color");
					return new THREE.MeshStandardMaterial({
						color: new THREE.Color(0xffffff),
						roughness: 0.3,
						metalness: 0.2,
					});
				} else if (name.includes("blue")) {
					console.log("Material name suggests blue color");
					return new THREE.MeshStandardMaterial({
						color: new THREE.Color(0x2196f3),
						roughness: 0.3,
						metalness: 0.2,
					});
				}
			}

			if (map && typeof map === "object" && "uuid" in map) {
				// Create a simple hash from the UUID string
				textureId = map.uuid
					.split("")
					.reduce((acc: number, char: string) => {
						return (acc << 5) - acc + char.charCodeAt(0);
					}, 0);
			} else {
				// Fallback to a random number if no UUID
				textureId = Math.floor(Math.random() * 100);
			}

			// Generate a color based on the hash (consistent for same texture)
			// Use a more conservative saturation and lightness
			const hue = Math.abs(textureId % 100) / 100;
			color = new THREE.Color().setHSL(hue, 0.7, 0.5);
		}

		// Create a new standard material with the extracted color
		const stdMaterial = new THREE.MeshStandardMaterial({
			color: color,
			roughness: 0.3,
			metalness: 0.2,
		});

		return stdMaterial;
	}

	/**
	 * Ensure the model has vibrant colors for better voxelization results
	 */
	private ensureVibrantColors(model: THREE.Group): void {
		// Count meshes with actual color information
		let coloredMeshCount = 0;
		let totalMeshCount = 0;
		let hasRedMesh = false;
		let hasWhiteMesh = false;

		model.traverse((obj) => {
			if (obj instanceof THREE.Mesh) {
				totalMeshCount++;

				// Check if this mesh has a non-white color
				if (obj.material) {
					const materials = Array.isArray(obj.material)
						? obj.material
						: [obj.material];

					for (const mat of materials) {
						if (
							"color" in mat &&
							mat.color instanceof THREE.Color
						) {
							const c = mat.color;

							// Check for red-ish colors
							if (c.r > 0.7 && c.g < 0.3 && c.b < 0.3) {
								hasRedMesh = true;
							}

							// Check for white colors
							if (c.r > 0.9 && c.g > 0.9 && c.b > 0.9) {
								hasWhiteMesh = true;
							} else {
								// Only count as colored if it's not close to white
								coloredMeshCount++;
								break;
							}
						}
					}
				}
			}
		});

		console.log(
			`Model color stats: ${coloredMeshCount}/${totalMeshCount} colored meshes, hasRed: ${hasRedMesh}, hasWhite: ${hasWhiteMesh}`
		);

		// If model has almost no color (very white or no colors at all)
		// AND doesn't have specific colors we want to preserve (like red)
		// ONLY then add colors
		if (
			coloredMeshCount / Math.max(1, totalMeshCount) < 0.1 &&
			!hasRedMesh
		) {
			console.log("Model has almost no colors, adding vibrant colors");

			// Use a more vibrant palette with carefully selected colors
			const palette = [
				new THREE.Color(0xf44336), // Red
				new THREE.Color(0x2196f3), // Blue
				new THREE.Color(0x4caf50), // Green
				new THREE.Color(0xff9800), // Orange
				new THREE.Color(0x9c27b0), // Purple
				new THREE.Color(0x00bcd4), // Cyan
				new THREE.Color(0xffeb3b), // Yellow
				new THREE.Color(0x795548), // Brown
				new THREE.Color(0xff4081), // Pink
			];

			let colorIndex = 0;
			model.traverse((obj) => {
				if (obj instanceof THREE.Mesh) {
					// Only change colors of white or very light materials
					const isWhiteMaterial = (mat: THREE.Material) => {
						return (
							"color" in mat &&
							mat.color instanceof THREE.Color &&
							mat.color.r > 0.9 &&
							mat.color.g > 0.9 &&
							mat.color.b > 0.9
						);
					};

					// Process materials
					if (Array.isArray(obj.material)) {
						obj.material.forEach((mat, idx) => {
							if (isWhiteMaterial(mat)) {
								mat.color.set(
									palette[(colorIndex + idx) % palette.length]
								);
							}
						});
						colorIndex++;
					} else if (isWhiteMaterial(obj.material)) {
						obj.material.color.set(
							palette[colorIndex % palette.length]
						);
						colorIndex++;
					}
				}
			});
		} else if (
			coloredMeshCount / Math.max(1, totalMeshCount) < 0.3 &&
			!hasRedMesh
		) {
			// If model has some colors but they might be too subtle,
			// enhance their saturation and brightness ONLY if there are no red meshes
			console.log("Model has some colors, enhancing existing colors");

			model.traverse((obj) => {
				if (obj instanceof THREE.Mesh) {
					if (obj.material) {
						const materials = Array.isArray(obj.material)
							? obj.material
							: [obj.material];

						for (const mat of materials) {
							if (
								"color" in mat &&
								mat.color instanceof THREE.Color
							) {
								// Only enhance non-white, non-red colors
								const c = mat.color;
								const isWhite =
									c.r > 0.9 && c.g > 0.9 && c.b > 0.9;
								const isRed =
									c.r > 0.7 && c.g < 0.3 && c.b < 0.3;

								if (!isWhite && !isRed) {
									// Convert to HSL to adjust saturation and lightness
									const hsl = { h: 0, s: 0, l: 0 };
									mat.color.getHSL(hsl);

									// Boost saturation slightly
									hsl.s = Math.min(1.0, hsl.s * 1.2); // Increase saturation by 20%

									// Ensure lightness is in a good range (not too dark or light)
									if (hsl.l < 0.3) hsl.l = 0.3;
									if (hsl.l > 0.8) hsl.l = 0.8;

									// Apply the enhanced color
									mat.color.setHSL(hsl.h, hsl.s, hsl.l);
								}
							}
						}
					}
				}
			});
		} else {
			console.log(
				"Model already has good colors, preserving original colors"
			);
		}
	}

	/**
	 * Check if a color is white or very close to white
	 */


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
		// Create notification element with Apple-style design
		const notificationEl = document.createElement("div");
		// Using refined glassmorphism and rounded corners
		notificationEl.className =
			"fixed bottom-6 right-6 py-3 px-4 rounded-2xl shadow-2xl flex items-center gap-3 z-50 " +
			(type === "success" 
				? "bg-white/80 dark:bg-zinc-800/80 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" 
				: "bg-white/80 dark:bg-zinc-800/80 text-rose-600 dark:text-rose-400 border border-rose-500/20") +
			" backdrop-blur-xl transition-all duration-300 transform translate-y-4 opacity-0";

		// Add icon with premium styling
		const iconEl = document.createElement("span");
		iconEl.className = "flex items-center justify-center";

		// Create SVG icon based on type - slightly refined sizing
		if (type === "success") {
			iconEl.innerHTML = `
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check-circle">
					<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
					<polyline points="22 4 12 14.01 9 11.01"/>
				</svg>
			`;
		} else {
			iconEl.innerHTML = `
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-circle">
					<circle cx="12" cy="12" r="10"/>
					<line x1="12" y1="8" x2="12" y2="12"/>
					<line x1="12" y1="16" x2="12.01" y2="16"/>
				</svg>
			`;
		}

		notificationEl.appendChild(iconEl);

		// Add message text with Inter font
		const messageEl = document.createElement("span");
		messageEl.className =
			"text-sm font-medium tracking-tight text-zinc-900 dark:text-zinc-100 font-sans";
		messageEl.textContent = message;
		notificationEl.appendChild(messageEl);

		// Add to DOM
		document.body.appendChild(notificationEl);

		// Animate appearance (slide up + fade in)
		requestAnimationFrame(() => {
			notificationEl.classList.remove("translate-y-4", "opacity-0");
		});

		// Animate and remove after delay
		setTimeout(() => {
			notificationEl.classList.add("translate-y-4", "opacity-0");
			setTimeout(() => {
				if (document.body.contains(notificationEl)) {
					document.body.removeChild(notificationEl);
				}
			}, 300); // Wait for transition to finish
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
				}, 1200); // Duration slightly longer than the effect
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
				}, 3000); // Increased duration to account for scaled explosion effect
			});
		}

		// Setup pulse effect button
		const pulseButton = document.getElementById("effect-pulse");
		if (pulseButton) {
			pulseButton.addEventListener("click", () => {
				console.log("Applying pulse effect");
				// Apply the pulse effect to the current model
				this.viewer.applyPulseEffect();

				// Add active state to button
				pulseButton.classList.add(
					"bg-indigo-700/90",
					"border-indigo-600/70"
				);
				setTimeout(() => {
					pulseButton.classList.remove(
						"bg-indigo-700/90",
						"border-indigo-600/70"
					);
				}, 2800); // Adjusted for a single, longer pulse effect
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

	/**
	 * Create a question mark toggle button on the bottom left for finding free models
	 */
	private createFreeModelsToggle(): void {
		// Create the toggle button
		const toggleButton = document.createElement("button");
		toggleButton.id = "free-models-toggle";
		toggleButton.className =
			"fixed bottom-6 left-6 z-30 w-9 h-9 flex items-center justify-center rounded-full bg-zinc-900/80 backdrop-blur-md border border-zinc-700/50 text-zinc-200 hover:bg-indigo-700/90 hover:border-indigo-600/70 transition-colors duration-200";
		toggleButton.innerHTML = `
			<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-help-circle">
				<circle cx="12" cy="12" r="10"/>
				<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
				<line x1="12" y1="17" x2="12.01" y2="17"/>
			</svg>
		`;

		// Create the free models panel (initially hidden)
		const modelsPanel = document.createElement("div");
		modelsPanel.id = "free-models-panel";
		modelsPanel.className =
			"fixed bottom-20 left-6 z-30 w-80 rounded-lg shadow-xl bg-zinc-900/80 backdrop-blur-md border border-zinc-700/50 text-zinc-200 p-4 opacity-0 pointer-events-none transition-opacity duration-200";
		modelsPanel.innerHTML = `
			<div class="flex items-center gap-2 mb-3">
				<span class="text-indigo-300">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info">
						<circle cx="12" cy="12" r="10" />
						<path d="M12 16v-4" />
						<path d="M12 8h.01" />
					</svg>
				</span>
				<h3 class="text-sm font-medium">INFORMATION</h3>
			</div>
			
			<div class="space-y-2 text-[11px] sm:text-xs text-zinc-300 mb-4">
				<p>• Only <span class="text-indigo-300 font-medium">.GLB</span> models are currently supported.</p>
				<p>• For best results, use models from <a href="https://poly.pizza" target="_blank" class="text-indigo-400 hover:underline">poly.pizza</a>.</p>
				<p>• This is a pre-release version and may be unstable.</p>
				<p class="text-zinc-400 text-[10px] sm:text-[11px] pt-1">Concept inspired by a <a href="https://tympanus.net/codrops/2023/03/28/turning-3d-models-to-voxel-art-with-three-js/" target="_blank" class="text-indigo-400 hover:underline">tutorial</a> by Ksenia K. at Codrops.</p>
			</div>
			
			<h4 class="text-xs font-medium text-indigo-300 mb-2">Free Model Resources</h4>
			<ul class="space-y-2 text-xs text-zinc-300">
				<li><a href="https://poly.pizza" target="_blank" class="text-indigo-400 hover:underline flex items-center">
					<span class="mr-1">⭐</span> Poly Pizza (Recommended)
				</a></li>
				<li><a href="https://sketchfab.com/features/free-3d-models" target="_blank" class="text-indigo-400 hover:underline flex items-center">
					<span class="mr-1">⭐</span> Sketchfab Free Models
				</a></li>
				<li><a href="https://www.turbosquid.com/Search/3D-Models/free" target="_blank" class="text-indigo-400 hover:underline flex items-center">
					<span class="mr-1">⭐</span> TurboSquid Free Models
				</a></li>
				<li><a href="https://free3d.com/" target="_blank" class="text-indigo-400 hover:underline flex items-center">
					<span class="mr-1">⭐</span> Free3D
				</a></li>
			</ul>
		`;

		// Append elements to the body
		document.body.appendChild(toggleButton);
		document.body.appendChild(modelsPanel);

		// Set up toggle functionality
		let isPanelVisible = false;
		toggleButton.addEventListener("click", () => {
			isPanelVisible = !isPanelVisible;

			if (isPanelVisible) {
				modelsPanel.classList.remove(
					"opacity-0",
					"pointer-events-none"
				);
				modelsPanel.classList.add("opacity-100");
				toggleButton.classList.add(
					"bg-indigo-700/90",
					"border-indigo-600/70"
				);
			} else {
				modelsPanel.classList.remove("opacity-100");
				modelsPanel.classList.add("opacity-0", "pointer-events-none");
				toggleButton.classList.remove(
					"bg-indigo-700/90",
					"border-indigo-600/70"
				);
			}
		});

		// Close panel when clicking outside
		document.addEventListener("click", (event) => {
			if (
				isPanelVisible &&
				!modelsPanel.contains(event.target as Node) &&
				!toggleButton.contains(event.target as Node)
			) {
				isPanelVisible = false;
				modelsPanel.classList.remove("opacity-100");
				modelsPanel.classList.add("opacity-0", "pointer-events-none");
				toggleButton.classList.remove(
					"bg-indigo-700/90",
					"border-indigo-600/70"
				);
			}
		});

		console.log("Free models toggle created");
	}
}
