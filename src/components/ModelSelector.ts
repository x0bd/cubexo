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
	}

	public init(callback: (oldIndex: number, newIndex: number) => void): void {
		this.modelSelectedCallback = callback;
		this.setupSelectorEvents();
		this.startRenderingPreviews();
	}

	public addModelPreview(modelData: ModelData, modelIdx: number): void {
		// Create preview scene
		const scene = this.createPreviewScene(modelIdx);

		// Add model to preview
		this.addModelToPreview(modelIdx, modelData.model);

		// Add scene to tracking list
		this.previewScenes.push(scene);
	}

	public createPreviewScene(modelIdx: number): THREE.Scene {
		const scene = new THREE.Scene();

		// Set background color based on index
		scene.background = new THREE.Color().setHSL(modelIdx / 6, 0.5, 0.7);

		// Create and set up preview element
		const element = document.createElement("div");
		element.className = "model-prev";
		element.style.width = `${this.previewWidth}px`;
		element.style.height = `${this.previewWidth}px`;
		scene.userData.element = element;
		scene.userData.modelIdx = modelIdx;

		// Add element to selector container
		if (this.selectorElement) {
			this.selectorElement.appendChild(element);
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

		this.previewScenes.push(scene);
		return scene;
	}

	public addModelToPreview(modelIdx: number, model: THREE.Group): void {
		const previewScene = this.previewScenes[modelIdx];
		if (!previewScene) return;

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

		previewScene.add(clonedModel);
	}

	private setupSelectorEvents(): void {
		const highlightActivePreview = () => {
			Array.from(document.querySelectorAll(".model-prev")).forEach(
				(el, idx) => {
					if (idx !== this.activeModelIdx) {
						el.classList.remove("active");
					} else {
						el.classList.add("active");
					}
				}
			);
		};

		let timeOut: number;
		let isHeldDown = false;
		highlightActivePreview();

		this.previewScenes.forEach((scene) => {
			const element = scene.userData.element as HTMLElement;
			element.addEventListener("mouseup", () => {
				window.clearTimeout(timeOut);
				if (!isHeldDown) {
					const oldIndex = this.activeModelIdx;
					this.activeModelIdx = scene.userData.modelIdx;
					highlightActivePreview();

					if (this.modelSelectedCallback) {
						this.modelSelectedCallback(
							oldIndex,
							this.activeModelIdx
						);
					}
				}
				isHeldDown = false;
			});
		});

		window.addEventListener("mousedown", () => {
			timeOut = window.setTimeout(() => {
				isHeldDown = true;
			}, 200);
		});

		window.addEventListener("mouseup", (event) => {
			window.clearTimeout(timeOut);
			if (!isHeldDown) {
				// Check if the click was outside a preview element
				if (
					!(event.target as Element).classList.contains("model-prev")
				) {
					const oldIndex = this.activeModelIdx;

					// Move to the next model in the sequence
					if (this.previewScenes[this.activeModelIdx + 1]) {
						this.activeModelIdx++;
					} else {
						this.activeModelIdx = 0;
					}

					highlightActivePreview();

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
	}

	private startRenderingPreviews(): void {
		const updateSceneSize = () => {
			this.previewScenes.forEach((scene) => {
				const element = scene.userData.element as HTMLElement;
				element.style.width = `${Math.min(
					90,
					(window.innerHeight * 0.8) / this.previewScenes.length
				)}px`;

				const rect = element.getBoundingClientRect();
				scene.userData.rect = {
					width: rect.right - rect.left,
					height: rect.bottom - rect.top,
					left: rect.left,
					bottom: window.innerHeight - rect.bottom,
				};

				const camera = scene.userData.camera as THREE.PerspectiveCamera;
				camera.aspect = element.clientWidth / element.clientHeight;
				camera.updateProjectionMatrix();
			});

			if (this.renderer) {
				this.renderer.setSize(window.innerWidth, window.innerHeight);
			}
		};

		window.addEventListener("resize", updateSceneSize);
		updateSceneSize();

		const animate = () => {
			requestAnimationFrame(animate);

			// Update all preview controls and render
			this.previewScenes.forEach((scene) => {
				const orbit = scene.userData.orbit as OrbitControls;
				orbit.update();

				const rect = scene.userData.rect;
				if (rect) {
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

					const camera = scene.userData.camera as THREE.Camera;
					this.renderer.render(scene, camera);
				}
			});
		};

		animate();
	}
}
