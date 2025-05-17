import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ModelData } from "../types/types";

export class ModelSelector {
	private selectorElement: HTMLElement | null;
	private previewScenes: THREE.Scene[] = [];
	private previewWidth = 80; // Width in pixels
	private activeModelIdx = 0;
	private renderer: THREE.WebGLRenderer;
	private modelSelectedCallback:
		| ((oldIndex: number, newIndex: number) => void)
		| null = null;

	constructor() {
		this.selectorElement = document.getElementById("selector");

		// Create a shared renderer for the preview thumbnails
		this.renderer = new THREE.WebGLRenderer({
			antialias: true,
			alpha: true,
		});
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.setScissorTest(true);

		// Append the renderer to the document body
		document.body.appendChild(this.renderer.domElement);

		// Style the renderer canvas
		this.renderer.domElement.style.position = "fixed";
		this.renderer.domElement.style.top = "0";
		this.renderer.domElement.style.left = "0";
		this.renderer.domElement.style.width = "100%";
		this.renderer.domElement.style.height = "100%";
		this.renderer.domElement.style.zIndex = "1";
		this.renderer.domElement.style.pointerEvents = "none";
	}

	public init(callback: (oldIndex: number, newIndex: number) => void): void {
		this.modelSelectedCallback = callback;
		this.setupSelectorEvents();
		this.startRenderingPreviews();

		// Log for debugging
		console.log(
			"ModelSelector initialized with",
			this.previewScenes.length,
			"scenes"
		);
	}

	public addModelPreview(modelData: ModelData, modelIdx: number): void {
		// Find the scene for this model index
		const scene = this.previewScenes.find(
			(scene) => scene.userData.modelIdx === modelIdx
		);

		if (scene) {
			// Log for debugging
			console.log(`Adding model preview for index ${modelIdx}`);

			// Add the model to the preview scene
			this.addModelToPreview(modelIdx, modelData.model);
		} else {
			console.error(`No scene found for model index ${modelIdx}`);
		}
	}

	public createPreviewScene(modelIdx: number): THREE.Scene {
		// Log for debugging
		console.log(`Creating preview scene for model ${modelIdx}`);

		const scene = new THREE.Scene();

		// Set background color based on index
		scene.background = new THREE.Color().setHSL(modelIdx / 6, 0.5, 0.7);

		// Create and set up preview element
		const element = document.createElement("div");
		element.className = "model-prev";
		element.style.width = `${this.previewWidth}px`;
		element.style.height = `${this.previewWidth}px`;

		// Store the model index as a data attribute for easy access
		element.dataset.modelIdx = modelIdx.toString();

		// Ensure the element is clickable
		element.style.cursor = "pointer";
		element.style.pointerEvents = "auto";

		// Store element and index in scene userData
		scene.userData.element = element;
		scene.userData.modelIdx = modelIdx;

		// Add element to selector container
		if (this.selectorElement) {
			this.selectorElement.appendChild(element);
		} else {
			console.error("Selector element not found");
		}

		// Set up camera
		const camera = new THREE.PerspectiveCamera(50, 1, 1, 100);
		camera.position.set(0, 1, 2).multiplyScalar(1.2);
		scene.userData.camera = camera;

		// Set up orbit controls
		const orbit = new OrbitControls(camera, element);
		orbit.minDistance = 2;
		orbit.maxDistance = 5;
		orbit.autoRotate = true;
		orbit.autoRotateSpeed = 6;
		orbit.enableDamping = true;
		scene.userData.orbit = orbit;

		// Add lighting
		const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
		scene.add(ambientLight);

		const sideLight = new THREE.PointLight(0xffffff, 0.7);
		sideLight.position.set(2, 0, 5);
		scene.add(sideLight);

		// Initialize rect data structure
		scene.userData.rect = {
			width: this.previewWidth,
			height: this.previewWidth,
			left: 0,
			bottom: 0,
		};

		this.previewScenes.push(scene);
		return scene;
	}

	public addModelToPreview(modelIdx: number, model: THREE.Group): void {
		// Find the scene for this model
		const scene = this.previewScenes.find(
			(scene) => scene.userData.modelIdx === modelIdx
		);

		if (!scene) {
			console.error(`No preview scene found for model index ${modelIdx}`);
			return;
		}

		// First remove any existing models
		scene.children.forEach((child) => {
			if (
				child instanceof THREE.Group &&
				!(child instanceof THREE.Light)
			) {
				scene.remove(child);
			}
		});

		// Clone the model for the preview
		const clonedModel = model.clone();

		// Calculate bounding box and scale
		const box = new THREE.Box3().setFromObject(clonedModel);
		const size = box.getSize(new THREE.Vector3());
		const scaleFactor = 2 / size.length(); // 2 is the normalized size for previews

		// Center and scale the model
		const center = box
			.getCenter(new THREE.Vector3())
			.multiplyScalar(-scaleFactor);
		clonedModel.position.copy(center);
		clonedModel.scale.set(scaleFactor, scaleFactor, scaleFactor);

		// Add the model to the scene
		scene.add(clonedModel);

		// Update scene size
		this.updateSceneSize();

		// Log for debugging
		console.log(`Model added to preview ${modelIdx}`);
	}

	private setupSelectorEvents(): void {
		// Log for debugging
		console.log("Setting up selector events");

		const highlightActivePreview = () => {
			const previews = document.querySelectorAll(".model-prev");
			previews.forEach((el) => {
				const idx = parseInt(el.getAttribute("data-model-idx") || "-1");
				if (idx !== this.activeModelIdx) {
					el.classList.remove("active");
				} else {
					el.classList.add("active");
				}
			});
		};

		let timeOut: number;
		let isHeldDown = false;

		// Add click event listeners to all preview elements
		if (this.selectorElement) {
			const previewElements =
				this.selectorElement.querySelectorAll(".model-prev");
			previewElements.forEach((element) => {
				element.addEventListener("mouseup", (e) => {
					window.clearTimeout(timeOut);
					if (!isHeldDown) {
						const oldIndex = this.activeModelIdx;
						const modelIdx = parseInt(
							element.getAttribute("data-model-idx") || "0"
						);
						this.activeModelIdx = modelIdx;

						// Log for debugging
						console.log(`Preview clicked: ${modelIdx}`);

						highlightActivePreview();

						// Call the callback with the new model index
						if (this.modelSelectedCallback) {
							this.modelSelectedCallback(
								oldIndex,
								this.activeModelIdx
							);
						}
					}
					isHeldDown = false;
					e.stopPropagation(); // Prevent the window mouseup from firing
				});
			});
		}

		// Window-level mouse events for detecting drag vs click
		window.addEventListener("mousedown", () => {
			timeOut = window.setTimeout(() => {
				isHeldDown = true;
			}, 200);
		});

		window.addEventListener("mouseup", (e) => {
			window.clearTimeout(timeOut);
			if (!isHeldDown) {
				// Check if the click was outside a preview element
				if (!(e.target as Element).closest(".model-prev")) {
					const oldIndex = this.activeModelIdx;

					// Move to the next model in sequence
					if (this.previewScenes[this.activeModelIdx + 1]) {
						this.activeModelIdx++;
					} else {
						this.activeModelIdx = 0;
					}

					highlightActivePreview();

					// Call the callback with the new model index
					if (this.modelSelectedCallback) {
						this.modelSelectedCallback(
							oldIndex,
							this.activeModelIdx
						);
					}
				}
			}
			isHeldDown = false;
		});

		// Initial highlight
		highlightActivePreview();
	}

	private updateSceneSize(): void {
		if (!this.selectorElement) return;

		// Set renderer size to match window
		this.renderer.setSize(window.innerWidth, window.innerHeight);

		this.previewScenes.forEach((scene) => {
			const element = scene.userData.element as HTMLElement;
			if (!element) return;

			// Calculate a good width based on available space and number of models
			const width = Math.min(
				90,
				(window.innerHeight * 0.8) / this.previewScenes.length
			);
			element.style.width = `${width}px`;
			element.style.height = `${width}px`;

			// Update rectangles for rendering
			const rect = element.getBoundingClientRect();
			scene.userData.rect = {
				width: rect.width,
				height: rect.height,
				left: rect.left,
				bottom: window.innerHeight - rect.bottom,
			};

			// Update camera aspect ratio
			const camera = scene.userData.camera as THREE.PerspectiveCamera;
			if (camera) {
				camera.aspect = rect.width / rect.height;
				camera.updateProjectionMatrix();
			}
		});
	}

	private startRenderingPreviews(): void {
		// Initially update the scene sizes
		this.updateSceneSize();

		// Handle window resize
		window.addEventListener("resize", () => this.updateSceneSize());

		// Animation loop for rendering previews
		const animate = () => {
			requestAnimationFrame(animate);

			// Skip if no previews
			if (this.previewScenes.length === 0) {
				return;
			}

			// Update and render each preview scene
			this.previewScenes.forEach((scene) => {
				// Skip if scene is not properly set up
				if (!scene.userData.rect || !scene.userData.camera) {
					return;
				}

				// Update orbit controls
				const orbit = scene.userData.orbit as OrbitControls;
				if (orbit) {
					orbit.update();
				}

				// Set viewport and scissor for this preview
				const rect = scene.userData.rect;
				this.renderer.setViewport(
					rect.left,
					rect.bottom,
					rect.width,
					rect.height
				);
				this.renderer.setScissor(
					rect.left,
					rect.bottom,
					rect.width,
					rect.height
				);

				// Render this preview
				const camera = scene.userData.camera as THREE.Camera;
				this.renderer.render(scene, camera);
			});
		};

		// Start the animation loop
		animate();

		// Log for debugging
		console.log("Preview rendering started");
	}

	// Helper method to get the active model index
	public getActiveModelIndex(): number {
		return this.activeModelIdx;
	}

	// Method to set active model index from outside
	public setActiveModelIndex(index: number): void {
		// Log for debugging
		console.log(`Setting active model index to ${index}`);

		this.activeModelIdx = index;

		// Update UI to reflect the change
		const previews = document.querySelectorAll(".model-prev");
		previews.forEach((el) => {
			const idx = parseInt(el.getAttribute("data-model-idx") || "-1");
			if (idx !== this.activeModelIdx) {
				el.classList.remove("active");
			} else {
				el.classList.add("active");
			}
		});
	}
}
