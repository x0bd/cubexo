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
	// Audio visualizer properties
	private audioContext: AudioContext | null = null;
	private audioElement: HTMLAudioElement | null = null;
	private audioSource: MediaElementAudioSourceNode | null = null;
	private audioAnalyser: AnalyserNode | null = null;
	private isVisualizerActive = false;
	private visualizerAnimationFrame: number | null = null;

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

		// Setup export panel buttons
		this.setupExportPanelButtons();

		// Setup theme toggle and utility buttons
		this.setupThemeToggle();
		this.setupUploadButton();

		// Setup effect buttons
		this.setupEffectButtons();

		// Setup audio visualizer modal
		this.setupAudioVisualizerModal();
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
			gifButton.addEventListener("click", () => {
				console.log("Exporting as GIF animation");
				// TODO: Implement GIF export functionality
				this.showNotification("GIF export coming soon");
			});
		}

		// Audio reactive button
		const audioReactiveButton = document.getElementById(
			"export-audio-reactive"
		);
		if (audioReactiveButton) {
			audioReactiveButton.addEventListener("click", () => {
				console.log("Opening audio visualizer modal");
				this.openAudioVisualizerModal();
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
			} finally {
				// Reset the file input value so the same file can be uploaded again if needed
				uploadInput.value = "";
			}
		});
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
	 * Setup upload button in the dock
	 */
	private setupUploadButton(): void {
		const uploadBtn = document.getElementById("upload-btn");
		if (!uploadBtn) return;

		uploadBtn.addEventListener("click", () => {
			console.log("Triggering model upload");
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
	 * Setup audio visualizer modal and controls
	 */
	private setupAudioVisualizerModal(): void {
		// Get modal elements
		const modal = document.getElementById("audio-visualizer-modal");
		const closeBtn = document.getElementById("close-audio-modal");
		const cancelBtn = document.getElementById("cancel-audio-visualizer");
		const startBtn = document.getElementById("start-audio-visualizer");
		const audioFileInput = document.getElementById(
			"audio-file-input"
		) as HTMLInputElement;
		const audioFilename = document.getElementById("audio-filename");
		const audioPreview = document.getElementById("audio-preview");
		const audioName = document.getElementById("audio-name");
		const audioDuration = document.getElementById("audio-duration");
		const playPauseBtn = document.getElementById("play-pause-audio");
		const sensitivitySlider = document.getElementById(
			"sensitivity-slider"
		) as HTMLInputElement;
		const sensitivityValue = document.getElementById("sensitivity-value");
		const intensitySlider = document.getElementById(
			"intensity-slider"
		) as HTMLInputElement;
		const intensityValue = document.getElementById("intensity-value");

		// Close modal handlers
		const closeModal = () => {
			if (modal) {
				gsap.to(modal, {
					opacity: 0,
					duration: 0.2,
					onComplete: () => {
						if (modal) {
							modal.classList.add("hidden");
							modal.style.opacity = "1";
						}
					},
				});
			}

			// Stop audio if playing
			if (this.audioElement) {
				this.audioElement.pause();
				this.audioElement.currentTime = 0;
			}
		};

		if (closeBtn) closeBtn.addEventListener("click", closeModal);
		if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

		// Audio file input handler
		if (audioFileInput) {
			audioFileInput.addEventListener("change", (event) => {
				const input = event.target as HTMLInputElement;
				const files = input.files;

				if (files && files.length > 0) {
					const file = files[0];

					// Update the filename display
					if (audioFilename) {
						audioFilename.textContent =
							file.name.length > 20
								? file.name.substring(0, 17) + "..."
								: file.name;
					}

					// Create audio element for preview
					const audio = new Audio();
					audio.src = URL.createObjectURL(file);

					// When audio metadata is loaded
					audio.addEventListener("loadedmetadata", () => {
						if (audioName) audioName.textContent = file.name;

						// Format and display duration
						if (audioDuration) {
							const minutes = Math.floor(audio.duration / 60);
							const seconds = Math.floor(audio.duration % 60);
							audioDuration.textContent = `${minutes}:${seconds
								.toString()
								.padStart(2, "0")}`;
						}

						// Show audio preview
						if (audioPreview)
							audioPreview.classList.remove("hidden");

						// Store the audio element
						this.audioElement = audio;
					});

					// Handle play/pause button
					if (playPauseBtn) {
						playPauseBtn.addEventListener("click", () => {
							if (!this.audioElement) return;

							if (this.audioElement.paused) {
								this.audioElement.play();
								playPauseBtn.innerHTML = `
									<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pause">
										<rect x="6" y="4" width="4" height="16"/>
										<rect x="14" y="4" width="4" height="16"/>
									</svg>
								`;
							} else {
								this.audioElement.pause();
								playPauseBtn.innerHTML = `
									<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play">
										<polygon points="5 3 19 12 5 21 5 3"/>
									</svg>
								`;
							}
						});
					}
				}
			});
		}

		// Slider value updates
		if (sensitivitySlider && sensitivityValue) {
			sensitivitySlider.addEventListener("input", () => {
				sensitivityValue.textContent = `${sensitivitySlider.value}%`;
			});
		}

		if (intensitySlider && intensityValue) {
			intensitySlider.addEventListener("input", () => {
				intensityValue.textContent = `${intensitySlider.value}%`;
			});
		}

		// Start visualizer button
		if (startBtn) {
			startBtn.addEventListener("click", () => {
				if (!this.audioElement) {
					this.showNotification(
						"Please select an audio file first",
						"error"
					);
					return;
				}

				// Get parameter values
				const sensitivity = sensitivitySlider
					? parseInt(sensitivitySlider.value) / 100
					: 0.5;
				const intensity = intensitySlider
					? parseInt(intensitySlider.value) / 100
					: 0.5;

				// Start the audio visualizer
				this.startAudioVisualizer(sensitivity, intensity);

				// Close the modal
				closeModal();

				// Show success notification
				this.showNotification("Audio visualizer started");
			});
		}
	}

	/**
	 * Open the audio visualizer modal
	 */
	private openAudioVisualizerModal(): void {
		const modal = document.getElementById("audio-visualizer-modal");
		if (modal) {
			modal.classList.remove("hidden");

			// Reset the form
			const audioFilename = document.getElementById("audio-filename");
			if (audioFilename) audioFilename.textContent = "SELECT AUDIO FILE";

			const audioPreview = document.getElementById("audio-preview");
			if (audioPreview) audioPreview.classList.add("hidden");

			const sensitivitySlider = document.getElementById(
				"sensitivity-slider"
			) as HTMLInputElement;
			if (sensitivitySlider) sensitivitySlider.value = "50";

			const intensitySlider = document.getElementById(
				"intensity-slider"
			) as HTMLInputElement;
			if (intensitySlider) intensitySlider.value = "50";

			const sensitivityValue =
				document.getElementById("sensitivity-value");
			if (sensitivityValue) sensitivityValue.textContent = "50%";

			const intensityValue = document.getElementById("intensity-value");
			if (intensityValue) intensityValue.textContent = "50%";
		}
	}

	/**
	 * Start the audio visualizer with the given parameters
	 */
	private startAudioVisualizer(sensitivity: number, intensity: number): void {
		if (!this.audioElement) return;

		// Clean up any existing visualizer
		this.stopAudioVisualizer();

		// Create audio context and analyzer
		this.audioContext = new (window.AudioContext ||
			(window as any).webkitAudioContext)();
		this.audioSource = this.audioContext.createMediaElementSource(
			this.audioElement
		);
		this.audioAnalyser = this.audioContext.createAnalyser();

		// Connect the audio nodes
		this.audioSource.connect(this.audioAnalyser);
		this.audioAnalyser.connect(this.audioContext.destination);

		// Configure the analyzer
		this.audioAnalyser.fftSize = 256;
		const bufferLength = this.audioAnalyser.frequencyBinCount;
		const dataArray = new Uint8Array(bufferLength);

		// Start playing the audio
		this.audioElement.play();
		this.isVisualizerActive = true;

		// Visualizer animation loop
		const visualize = () => {
			if (!this.isVisualizerActive || !this.audioAnalyser) {
				return;
			}

			// Get frequency data
			this.audioAnalyser.getByteFrequencyData(dataArray);

			// Calculate average frequency
			let sum = 0;
			for (let i = 0; i < bufferLength; i++) {
				sum += dataArray[i];
			}
			const average = sum / bufferLength;

			// Apply sensitivity and intensity
			const normalizedValue =
				Math.min(1, (average / 255) * sensitivity) * intensity;

			// Apply visualization effect to the model
			if (this.viewer) {
				this.viewer.applyAudioVisualization(normalizedValue);
			}

			// Continue the animation loop
			this.visualizerAnimationFrame = requestAnimationFrame(visualize);
		};

		// Start the visualization loop
		this.visualizerAnimationFrame = requestAnimationFrame(visualize);
	}

	/**
	 * Stop the audio visualizer
	 */
	private stopAudioVisualizer(): void {
		this.isVisualizerActive = false;

		// Cancel animation frame
		if (this.visualizerAnimationFrame !== null) {
			cancelAnimationFrame(this.visualizerAnimationFrame);
			this.visualizerAnimationFrame = null;
		}

		// Clean up audio resources
		if (this.audioSource) {
			this.audioSource.disconnect();
			this.audioSource = null;
		}

		if (this.audioAnalyser) {
			this.audioAnalyser.disconnect();
			this.audioAnalyser = null;
		}

		if (this.audioContext && this.audioContext.state !== "closed") {
			this.audioContext.close();
			this.audioContext = null;
		}

		if (this.audioElement) {
			this.audioElement.pause();
			this.audioElement.currentTime = 0;
		}

		// Reset any visualization effects
		if (this.viewer) {
			this.viewer.resetAudioVisualization();
		}
	}
}
