import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ModelData } from "../types/types";

export class ModelSelector {
	private selectorElement: HTMLElement | null;
	private previewScenes: THREE.Scene[] = [];
	private previewWidth = 100; // Width in pixels
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
			}

			this.addModelToScene(modelIdx, modelData.model, modelData.name);
		}
	}

	public createPreviewScene(modelIdx: number): THREE.Scene {
		const scene = new THREE.Scene();

		// Use background color based on model index with better saturation and lightness
		scene.background = new THREE.Color().setHSL(modelIdx / 6, 0.6, 0.8);

		// Create preview element
		const element = document.createElement("div");
		element.className =
			"model-prev relative w-[100px] h-[100px] rounded-xl border-2 border-gray-200 mx-1.5 cursor-pointer shadow-md overflow-hidden transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-lg dark:border-gray-800";
		element.dataset.modelIdx = modelIdx.toString();
		element.dataset.modelName = `model-${modelIdx}`;

		// Make sure the element is clickable with proper pointer events
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

		// 2. Main directional light with shadows
		const mainLight = new THREE.DirectionalLight(0xffffff, 1.5);
		mainLight.position.set(3, 5, 3);
		mainLight.castShadow = true;
		mainLight.shadow.mapSize.width = 512;
		mainLight.shadow.mapSize.height = 512;
		scene.add(mainLight);

		// 3. Rim light for better edge definition
		const rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
		rimLight.position.set(-3, 2, -1);
		scene.add(rimLight);

		// 4. Ground plane to receive shadows
		const groundPlane = new THREE.Mesh(
			new THREE.PlaneGeometry(10, 10),
			new THREE.ShadowMaterial({ opacity: 0.2 })
		);
		groundPlane.position.y = -1;
		groundPlane.rotation.x = -Math.PI / 2;
		groundPlane.receiveShadow = true;
		scene.add(groundPlane);

		// Store the scene in our previewScenes array
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
		const previews = document.querySelectorAll(
			".model-prev"
		) as NodeListOf<HTMLElement>;

		previews.forEach((el) => {
			const idx = parseInt(el.getAttribute("data-model-idx") || "-1");
			if (idx !== this.activeModelIdx) {
				el.classList.remove(
					"border-black",
					"border-white",
					"scale-110",
					"shadow-lg",
					"dark:border-white"
				);
				el.classList.add("border-gray-200", "dark:border-gray-800");
			} else {
				el.classList.remove("border-gray-200", "dark:border-gray-800");
				el.classList.add(
					"border-black",
					"dark:border-white",
					"scale-110",
					"shadow-lg"
				);
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
