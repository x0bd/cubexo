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

		// Add renderer to the page with proper z-index to be visible
		const rendererElement = document.createElement("div");
		rendererElement.id = "preview-renderer-container";
		rendererElement.style.position = "absolute";
		rendererElement.style.top = "0";
		rendererElement.style.left = "0";
		rendererElement.style.width = "100%";
		rendererElement.style.height = "100%";
		rendererElement.style.zIndex = "5";
		rendererElement.style.pointerEvents = "none";
		document.body.appendChild(rendererElement);
		rendererElement.appendChild(this.renderer.domElement);
	}

	public init(callback: (oldIndex: number, newIndex: number) => void): void {
		this.modelSelectedCallback = callback;
		this.updateSceneSize();
		this.startRenderingPreviews();

		// Add click handlers to window for cycling through models
		window.addEventListener("click", (e) => {
			if (!(e.target as Element).closest(".model-prev")) {
				const oldIndex = this.activeModelIdx;

				// Move to the next model in sequence
				if (this.previewScenes[this.activeModelIdx + 1]) {
					this.activeModelIdx++;
				} else {
					this.activeModelIdx = 0;
				}

				this.updateActivePreview();

				if (this.modelSelectedCallback) {
					this.modelSelectedCallback(oldIndex, this.activeModelIdx);
				}
			}
		});
	}

	public addModelPreview(modelData: ModelData, modelIdx: number): void {
		const scene = this.previewScenes.find(
			(scene) => scene.userData.modelIdx === modelIdx
		);

		if (scene) {
			this.addModelToPreview(modelData, modelIdx);
		}
	}

	public createPreviewScene(modelIdx: number): THREE.Scene {
		const scene = new THREE.Scene();

		// Use background color based on model index with better saturation and lightness
		scene.background = new THREE.Color().setHSL(modelIdx / 6, 0.6, 0.8);

		// Create preview element
		const element = document.createElement("div");
		element.className = "model-prev";
		element.style.width = `${this.previewWidth}px`;
		element.style.height = `${this.previewWidth}px`;
		element.dataset.modelIdx = modelIdx.toString();
		element.dataset.modelName = `model-${modelIdx}`;

		// Add click handler
		element.addEventListener("click", (e) => {
			const oldIndex = this.activeModelIdx;
			this.activeModelIdx = modelIdx;
			this.updateActivePreview();

			if (this.modelSelectedCallback) {
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

		// Setup camera
		const camera = new THREE.PerspectiveCamera(50, 1, 1, 100);
		camera.position.set(0, 1, 2).multiplyScalar(1.2);
		scene.userData.camera = camera;

		// Setup controls
		const orbit = new OrbitControls(camera, element);
		orbit.minDistance = 2;
		orbit.maxDistance = 5;
		orbit.autoRotate = true;
		orbit.autoRotateSpeed = 6;
		orbit.enableDamping = true;
		scene.userData.orbit = orbit;

		// Improved lighting setup
		// 1. Brighter ambient light for better overall illumination
		const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
		scene.add(ambientLight);

		// 2. Main directional light for shadows and definition
		const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
		mainLight.position.set(1, 2, 2);
		scene.add(mainLight);

		// 3. Fill light from the opposite side to reduce harsh shadows
		const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
		fillLight.position.set(-2, 0, -1);
		scene.add(fillLight);

		// 4. Rim light for better edge definition
		const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
		rimLight.position.set(0, 1, -2);
		scene.add(rimLight);

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

		// Scale and center
		const box = new THREE.Box3().setFromObject(clonedModel);
		const size = box.getSize(new THREE.Vector3());
		const scaleFactor = 2 / size.length();

		const center = box
			.getCenter(new THREE.Vector3())
			.multiplyScalar(-scaleFactor);
		clonedModel.position.copy(center);
		clonedModel.scale.set(scaleFactor, scaleFactor, scaleFactor);

		// Store model name in the element for export functionality
		if (modelName) {
			const element = scene.userData.element as HTMLElement;
			if (element) {
				element.dataset.modelName = modelName;
			}
		}

		// Add to scene
		scene.add(clonedModel);
		this.updateSceneSize();
	}

	private updateActivePreview(): void {
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

	private updateSceneSize(): void {
		if (!this.selectorElement) return;

		// Set renderer size
		this.renderer.setSize(window.innerWidth, window.innerHeight);

		this.previewScenes.forEach((scene) => {
			const element = scene.userData.element as HTMLElement;
			if (!element) return;

			// Calculate width
			const width = Math.min(
				90,
				(window.innerHeight * 0.8) /
					Math.max(1, this.previewScenes.length)
			);
			element.style.width = `${width}px`;
			element.style.height = `${width}px`;

			// Update rect
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

				// Set viewport
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
