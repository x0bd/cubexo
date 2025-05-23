import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ModelData } from "../types/types";

export class ModelSelector {
	private selectorElement: HTMLElement | null;
	private previewScenes: THREE.Scene[] = [];
	private previewWidth = 130; // Increased width for better visibility
	private previewHeight = 130; // Matching height for square proportions
	private activeModelIdx = 0;
	private renderer: THREE.WebGLRenderer;
	private modelSelectedCallback:
		| ((oldIndex: number, newIndex: number) => void)
		| null = null;

	constructor() {
		this.selectorElement = document.getElementById("selector");

		// Create a renderer for the preview thumbnails with improved settings
		this.renderer = new THREE.WebGLRenderer({
			antialias: true,
			alpha: true,
			powerPreference: "high-performance",
		});
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.2;
		this.renderer.setScissorTest(true);

		// Enable shadows for better visuals
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

		// Add renderer to the page with proper z-index to be visible
		const rendererElement = document.createElement("div");
		rendererElement.id = "preview-renderer-container";
		rendererElement.style.position = "fixed";
		rendererElement.style.top = "0";
		rendererElement.style.left = "0";
		rendererElement.style.width = "100%";
		rendererElement.style.height = "100%";
		rendererElement.style.zIndex = "15";
		rendererElement.style.pointerEvents = "none";
		document.body.appendChild(rendererElement);
		rendererElement.appendChild(this.renderer.domElement);
	}

	public init(callback: (oldIndex: number, newIndex: number) => void): void {
		this.modelSelectedCallback = callback;
		this.updateSceneSize();
		this.startRenderingPreviews();

		// Listen for theme changes
		window.addEventListener("themechange", (e: Event) => {
			const customEvent = e as CustomEvent;
			const isDark = customEvent.detail?.theme === "dark";
			this.updateSceneBackgrounds(isDark);
		});
	}

	/**
	 * Update scene backgrounds when theme changes
	 */
	private updateSceneBackgrounds(isDark: boolean): void {
		const bgColor = new THREE.Color(isDark ? 0x18181b : 0x27272a);
		this.previewScenes.forEach((scene) => {
			scene.background = bgColor;
		});
	}

	public addModelPreview(modelData: ModelData, modelIdx: number): void {
		const scene = this.previewScenes.find(
			(scene) => scene.userData.modelIdx === modelIdx
		);

		if (scene) {
			// Set the model name in the DOM element
			const element = scene.userData.element as HTMLElement;
			if (element) {
				element.dataset.modelName = modelData.name;

				// Add model label
				const labelEl = element.querySelector(".model-label");
				if (labelEl) {
					// Extract just the base name without the prefix for display
					let displayName = modelData.name;
					if (displayName.startsWith('user-model-')) {
						displayName = displayName.substring('user-model-'.length);
					}
					labelEl.textContent = displayName;
				}
			}

			// Log the model data for debugging
			console.log(`Adding model preview for ${modelData.name} at index ${modelIdx}`);
			
			this.addModelToScene(modelIdx, modelData.model, modelData.name);
		}
	}

	public createPreviewScene(modelIdx: number): THREE.Scene {
		const scene = new THREE.Scene();

		// Make background color theme-aware with zinc palette
		const isDarkMode = document.documentElement.classList.contains("dark");
		scene.background = new THREE.Color(isDarkMode ? 0x18181b : 0x27272a); // zinc-900 for unified look

		// Create preview element with updated Tailwind classes for our aesthetic
		const element = document.createElement("div");
		element.className =
			"w-[130px] h-[130px] bg-zinc-900/50 border border-zinc-700/50 rounded-lg overflow-hidden cursor-pointer relative transition-all duration-200 hover:scale-105 hover:shadow-lg hover:border-zinc-600/70 group";
		element.dataset.modelIdx = modelIdx.toString();
		element.dataset.modelName = `model-${modelIdx}`;

		// Add label element with improved Japanese-inspired styling
		const labelEl = document.createElement("div");
		labelEl.className =
			"model-label absolute bottom-0 left-0 right-0 py-1 px-1.5 text-[10px] jp tracking-wide uppercase text-center bg-zinc-900/80 backdrop-blur-sm border-t border-zinc-700/40 text-zinc-300 transform translate-y-full group-hover:translate-y-0 transition-transform duration-200";
		labelEl.textContent = `Model ${modelIdx + 1}`;
		element.appendChild(labelEl);

		// Make sure the element is clickable
		element.style.pointerEvents = "auto";

		// Add click handler
		element.addEventListener("click", (e) => {
			const oldIndex = this.activeModelIdx;
			this.activeModelIdx = modelIdx;
			this.updateActivePreview();

			// Ensure the callback is called to switch models
			if (this.modelSelectedCallback) {
				console.log(`Model preview clicked: ${oldIndex} → ${modelIdx}`);
				this.modelSelectedCallback(oldIndex, this.activeModelIdx);
			}
			e.stopPropagation();
		});

		// Store data
		scene.userData.element = element;
		scene.userData.modelIdx = modelIdx;

		// Add to selector
		if (this.selectorElement) {
			this.selectorElement.appendChild(element);
		}

		// Setup camera with improved parameters
		const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
		camera.position.set(0, 0.8, 2.5);
		scene.userData.camera = camera;

		// Setup controls with better parameters
		const orbit = new OrbitControls(camera, element);
		orbit.minDistance = 1.5;
		orbit.maxDistance = 4;
		orbit.enableZoom = false; // Disable zoom in preview thumbnails
		orbit.enablePan = false; // Disable panning in preview thumbnails
		orbit.rotateSpeed = 1.0; // Adjust rotation speed
		orbit.autoRotate = true;
		orbit.autoRotateSpeed = 3; // Slower rotation for better viewing
		orbit.enableDamping = true;
		orbit.dampingFactor = 0.05;
		scene.userData.orbit = orbit;

		// Improved lighting setup for better model visibility
		// 1. Brighter ambient light for better overall illumination
		const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
		scene.add(ambientLight);

		// 2. Main directional light for shadows and definition
		const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
		mainLight.position.set(1, 2, 2);
		mainLight.castShadow = true;
		mainLight.shadow.mapSize.width = 512;
		mainLight.shadow.mapSize.height = 512;
		scene.add(mainLight);

		// 3. Fill light from the opposite side to reduce harsh shadows
		const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
		fillLight.position.set(-2, 0, -1);
		scene.add(fillLight);

		// 4. Rim light for better edge definition
		const rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
		rimLight.position.set(0, 1, -2);
		scene.add(rimLight);

		// 5. Add a ground plane to receive shadows
		const groundGeometry = new THREE.PlaneGeometry(10, 10);
		const groundMaterial = new THREE.ShadowMaterial({
			opacity: 0.2,
			transparent: true,
		});
		const groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
		groundPlane.rotation.x = -Math.PI / 2;
		groundPlane.position.y = -0.8; // Raised position to better match models
		groundPlane.receiveShadow = true;
		scene.add(groundPlane);

		// Initialize rect
		scene.userData.rect = {
			width: this.previewWidth,
			height: this.previewWidth,
			left: 0,
			bottom: 0,
		};

		this.previewScenes.push(scene);
		return scene;
	}

	public addModelToPreview(modelData: ModelData, modelIdx: number): void {
		const scene = this.previewScenes.find(
			(scene) => scene.userData.modelIdx === modelIdx
		);

		if (scene) {
			this.addModelToScene(modelIdx, modelData.model, modelData.name);
		}
	}

	private addModelToScene(
		modelIdx: number,
		model: THREE.Group,
		modelName?: string
	): void {
		const scene = this.previewScenes.find(
			(scene) => scene.userData.modelIdx === modelIdx
		);

		if (!scene) return;

		// Remove any existing models
		scene.children.forEach((child) => {
			if (
				child instanceof THREE.Group &&
				!(child instanceof THREE.Light)
			) {
				scene.remove(child);
			}
		});

		// Clone the model
		const clonedModel = model.clone();

		// Enhance material properties for better lighting
		clonedModel.traverse((object) => {
			if (object instanceof THREE.Mesh) {
				// Update any existing materials to better reflect light
				if (object.material) {
					if (object.material instanceof THREE.MeshStandardMaterial) {
						object.material = object.material.clone();
						object.material.roughness = 0.3;
						object.material.metalness = 0.15;
						object.material.envMapIntensity = 1.0;
					} else if (
						object.material instanceof THREE.MeshPhongMaterial
					) {
						object.material = object.material.clone();
						object.material.shininess = 60;
						object.material.specular = new THREE.Color(0x333333);
					} else if (
						object.material instanceof THREE.MeshLambertMaterial
					) {
						object.material = object.material.clone();
						object.material.emissive = new THREE.Color(0x111111);
					}
				}

				// Enable shadows
				object.castShadow = true;
				object.receiveShadow = true;
			}
		});

		// Log model information for debugging
		console.log(`Processing model ${modelIdx} (${modelName || 'unnamed'})`);
		console.log(`Original model dimensions before scaling:`, clonedModel);

		// Determine if this is a user-uploaded model (still needed for potential y-offset)
		const isUserUploadedModel = modelName && modelName.includes("user-model") || 
									 modelIdx >= 4; // Assuming first 4 models are built-in

		console.log(`Is user uploaded model (for y-offset): ${isUserUploadedModel}`);

		// Scale and center. Models should arrive pre-normalized (largest dimension ~1.0).
		const box = new THREE.Box3().setFromObject(clonedModel);
		const size = box.getSize(new THREE.Vector3());
		const maxDimension = Math.max(size.x, size.y, size.z);
		
		console.log(`ModelSelector - Max dimension of (pre-normalized?) model: ${maxDimension}`);

		// Target a consistent final largest dimension for the preview (e.g., 1.8 units)
		const DESIRED_PREVIEW_DIMENSION = 1.8;
		let finalScale = DESIRED_PREVIEW_DIMENSION;
		if (maxDimension > 0) { // Avoid division by zero if model is empty or flat
			finalScale = DESIRED_PREVIEW_DIMENSION / maxDimension;
		}

		console.log(`ModelSelector - Applying final scale: ${finalScale} (target dim: ${DESIRED_PREVIEW_DIMENSION}, current maxDim: ${maxDimension})`);

		// Precisely center the model based on the new final scale
		const center = box.getCenter(new THREE.Vector3());
		clonedModel.position.set(
			-center.x * finalScale,
			-center.y * finalScale,
			-center.z * finalScale
		);
		
		// Apply the final scaling to all models
		clonedModel.scale.set(finalScale, finalScale, finalScale);

		// Adjust position for better visibility
		if (isUserUploadedModel) {
			// For uploaded models, we might need more vertical adjustment
			clonedModel.position.y += 0.5;
		} else {
			// Standard elevation for built-in models
			clonedModel.position.y += 0.2;
		}

		console.log(`Final model position and scale:`, {
			position: clonedModel.position,
			scale: clonedModel.scale
		});

		// Store model name in the element for export functionality
		if (modelName) {
			const element = scene.userData.element as HTMLElement;
			if (element) {
				element.dataset.modelName = modelName;
				
				// Add a special class for uploaded models to style them differently if needed
				if (modelName.includes("user-model")) {
					element.classList.add("user-uploaded-model");
				}
			}
		}

		// Add to scene
		scene.add(clonedModel);
		this.updateSceneSize();
	}

	private updateActivePreview(): void {
		// Update active class on preview elements
		this.previewScenes.forEach((scene) => {
			const element = scene.userData.element as HTMLElement;
			if (element) {
				if (scene.userData.modelIdx === this.activeModelIdx) {
					// Add active styles with premium Japanese-inspired aesthetic
					element.classList.add(
						"border-indigo-500",
						"ring-2",
						"ring-indigo-500/40",
						"scale-105",
						"shadow-lg"
					);

					// Show the label for active model
					const label = element.querySelector(".model-label");
					if (label) {
						(label as HTMLElement).style.transform =
							"translateY(0)";
					}
				} else {
					// Remove active styles
					element.classList.remove(
						"border-indigo-500",
						"ring-2",
						"ring-indigo-500/40",
						"scale-105",
						"shadow-lg"
					);

					// Hide label for inactive models
					const label = element.querySelector(".model-label");
					if (label) {
						(label as HTMLElement).style.transform =
							"translateY(100%)";
					}
				}
			}
		});
	}

	private updateSceneSize(): void {
		if (!this.selectorElement) return;

		// Set renderer size
		this.renderer.setSize(window.innerWidth, window.innerHeight);

		// Update the selector element to create a grid layout
		this.selectorElement.style.display = "grid";
		this.selectorElement.style.gridTemplateColumns = "repeat(2, 1fr)";
		this.selectorElement.style.gap = "12px";
		this.selectorElement.style.justifyItems = "center";

		this.previewScenes.forEach((scene) => {
			const element = scene.userData.element as HTMLElement;
			if (!element) return;

			// Use fixed width and height for consistent square proportions
			element.style.width = `${this.previewWidth}px`;
			element.style.height = `${this.previewHeight}px`;

			// Update rect with precise positioning
			const rect = element.getBoundingClientRect();
			scene.userData.rect = {
				width: rect.width,
				height: rect.height,
				left: rect.left,
				bottom: window.innerHeight - rect.bottom,
			};

			// Update camera
			const camera = scene.userData.camera as THREE.PerspectiveCamera;
			if (camera) {
				camera.aspect = rect.width / rect.height;
				camera.updateProjectionMatrix();
			}
		});
	}

	private startRenderingPreviews(): void {
		// Listen for resize
		window.addEventListener("resize", () => this.updateSceneSize());

		// Animation loop
		const animate = () => {
			requestAnimationFrame(animate);

			// Skip if no previews
			if (this.previewScenes.length === 0) return;

			// Render each preview
			this.previewScenes.forEach((scene) => {
				if (!scene.userData.rect || !scene.userData.camera) return;

				// Update controls
				const orbit = scene.userData.orbit as OrbitControls;
				if (orbit) orbit.update();

				// Set viewport and scissor with exact positioning
				const rect = scene.userData.rect;

				// Ensure perfect alignment by using integer values for all models
				const left = Math.floor(rect.left);
				const bottom = Math.floor(rect.bottom);
				const width = Math.floor(rect.width);
				const height = Math.floor(rect.height);

				this.renderer.setViewport(left, bottom, width, height);
				this.renderer.setScissor(left, bottom, width, height);

				// Render
				const camera = scene.userData.camera as THREE.Camera;
				this.renderer.render(scene, camera);
			});
		};

		animate();
	}

	public getActiveModelIndex(): number {
		return this.activeModelIdx;
	}

	public setActiveModelIndex(index: number): void {
		this.activeModelIdx = index;
		this.updateActivePreview();
	}
}
