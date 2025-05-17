import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import gsap from "gsap";
import type { Voxel, AppParameters } from "../types/types";
import { ModelExporter, ExportFormat } from "../utils/ModelExporter";

export class VoxelModelViewer {
	private renderer: THREE.WebGLRenderer | null = null;
	private scene: THREE.Scene | null = null;
	private camera: THREE.PerspectiveCamera | null = null;
	private controls: OrbitControls | null = null;
	private lightHolder: THREE.Group | null = null;
	private raycaster: THREE.Raycaster | null = null;

	private voxelGeometry: RoundedBoxGeometry | null = null;
	private voxelMaterial: THREE.Material | null = null;
	private instancedMesh: THREE.InstancedMesh | null = null;
	private dummy: THREE.Object3D = new THREE.Object3D();

	private canvasElement: HTMLCanvasElement | null = null;
	private voxelsPerModel: Voxel[][] = [];
	private voxels: Voxel[] = [];
	private activeModelIndex = 0;

	private params: AppParameters = {
		modelPreviewSize: 2,
		modelSize: 9,
		gridSize: 0.24,
		boxSize: 0.24,
		boxRoundness: 0.03,
	};

	constructor(params?: Partial<AppParameters>) {
		if (params) {
			this.params = { ...this.params, ...params };
		}
	}

	public init(): void {
		this.canvasElement = document.getElementById(
			"webgl"
		) as HTMLCanvasElement;

		if (!this.canvasElement) {
			console.error("Canvas element not found");
			return;
		}

		this.setupRenderer();
		this.setupScene();
		this.setupCamera();
		this.setupLights();
		this.setupControls();
		this.setupGeometries();

		this.raycaster = new THREE.Raycaster();

		window.addEventListener("resize", this.handleResize.bind(this));
		this.handleResize();

		// Create initial instanced mesh
		this.recreateInstancedMesh(100);
	}

	public addVoxelsForModel(modelIdx: number, modelVoxels: Voxel[]): void {
		// Store voxels for this model
		this.voxelsPerModel[modelIdx] = modelVoxels;

		// Update the mesh if needed
		const numberOfInstances = Math.max(
			...this.voxelsPerModel.map((m) => m.length)
		);
		if (numberOfInstances > (this.instancedMesh?.count || 0)) {
			this.recreateInstancedMesh(numberOfInstances);
		}
	}

	public setActiveModel(modelIdx: number): void {
		this.activeModelIndex = modelIdx;
	}

	public animateToModel(oldModelIdx: number, newModelIdx: number): void {
		// Animate voxels data
		for (let i = 0; i < this.voxels.length; i++) {
			gsap.killTweensOf(this.voxels[i].color);
			gsap.killTweensOf(this.voxels[i].position);

			// Increase duration for slower, more deliberate transitions
			const duration = 1.0 + 0.8 * Math.pow(Math.random(), 6); // Increased from 0.5 + 0.5 to 1.0 + 0.8
			let targetPos: THREE.Vector3;

			// Move to new position if we have one;
			// otherwise, move to a randomly selected existing position
			//
			// Animate to new color if it's determined
			// otherwise, voxel will be just hidden by animation of instancedMesh.count

			if (this.voxelsPerModel[newModelIdx]?.[i]) {
				targetPos = this.voxelsPerModel[newModelIdx][i].position;
				gsap.to(this.voxels[i].color, {
					delay: 0.9 * Math.random() * duration, // Increased from 0.7 to 0.9
					duration: 0.2, // Increased from 0.05 to 0.2
					r: this.voxelsPerModel[newModelIdx][i].color.r,
					g: this.voxelsPerModel[newModelIdx][i].color.g,
					b: this.voxelsPerModel[newModelIdx][i].color.b,
					ease: "power1.in",
					onUpdate: () => {
						if (this.instancedMesh) {
							this.instancedMesh.setColorAt(
								i,
								this.voxels[i].color
							);
							if (this.instancedMesh.instanceColor) {
								this.instancedMesh.instanceColor.needsUpdate =
									true;
							}
						}
					},
				});
			} else {
				// If no direct voxel exists at this index, use a random one from the target model
				const targetModelVoxels = this.voxelsPerModel[newModelIdx];
				if (targetModelVoxels && targetModelVoxels.length > 0) {
					const randomIndex = Math.floor(
						targetModelVoxels.length * Math.random()
					);
					targetPos = targetModelVoxels[randomIndex].position;
				} else {
					// Fallback if target model has no voxels
					targetPos = new THREE.Vector3(0, 0, 0);
				}
			}

			// Move to new position with longer duration
			gsap.to(this.voxels[i].position, {
				delay: 0.4 * Math.random(), // Increased from 0.2 to 0.4
				duration: duration,
				x: targetPos.x,
				y: targetPos.y,
				z: targetPos.z,
				ease: "back.out(3)",
				onUpdate: () => {
					this.updateMatrix(i);
				},
			});
		}

		// Increase the model rotation during transition
		if (this.instancedMesh) {
			gsap.to(this.instancedMesh.rotation, {
				duration: 2.0, // Increased from 1.2 to 2.0
				y: "+=" + 1.3 * Math.PI,
				ease: "power2.out",
			});
		}

		// Show the right number of voxels with longer transition
		if (this.instancedMesh && this.voxelsPerModel[newModelIdx]) {
			gsap.to(this.instancedMesh, {
				duration: 0.8, // Increased from 0.4 to 0.8
				count: this.voxelsPerModel[newModelIdx].length,
			});
		}

		// Update the instanced mesh accordingly to voxels data
		gsap.to(
			{},
			{
				duration: 2.2, // Increased from 1.0 to 2.2 for longer overall transition
				onUpdate: () => {
					if (this.instancedMesh) {
						this.instancedMesh.instanceMatrix.needsUpdate = true;
						if (this.instancedMesh.instanceColor) {
							this.instancedMesh.instanceColor.needsUpdate = true;
						}
					}
				},
			}
		);

		// Set the active model index
		this.activeModelIndex = newModelIdx;
	}

	public startRenderLoop(): void {
		this.render();
	}

	private setupRenderer(): void {
		this.renderer = new THREE.WebGLRenderer({
			canvas: this.canvasElement!,
			antialias: true,
			alpha: true,
		});

		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.setClearColor(0x000000, 0);
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

		// Use standard color space for accurate colors
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;

		// Brighter tone mapping for better visibility
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.2; // Increased exposure for brightness
	}

	private setupScene(): void {
		this.scene = new THREE.Scene();

		// Set initial background color based on theme
		this.updateBackgroundForTheme();

		// Listen for theme changes
		window.addEventListener("theme-changed", ((event: CustomEvent) => {
			this.updateBackgroundForTheme(event.detail?.isDark);
		}) as EventListener);
	}

	private updateBackgroundForTheme(isDark?: boolean): void {
		if (!this.scene) return;

		// If isDark is not provided, detect from the DOM
		if (isDark === undefined) {
			isDark = document.documentElement.classList.contains("dark-theme");
		}

		// Pure black/white for Vercel style
		if (isDark) {
			this.scene.background = new THREE.Color(0x000000);
		} else {
			this.scene.background = new THREE.Color(0xffffff);
		}
	}

	private setupCamera(): void {
		this.camera = new THREE.PerspectiveCamera(
			35, // Narrower field of view for a cleaner look
			window.innerWidth / window.innerHeight,
			0.1,
			1000
		);

		this.camera.position.set(0, 5, 20);
	}

	private setupControls(): void {
		if (!this.camera || !this.canvasElement) return;

		this.controls = new OrbitControls(this.camera, this.canvasElement);
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.05;
		this.controls.enablePan = false;
		this.controls.minDistance = 15;
		this.controls.maxDistance = 25;
		this.controls.minPolarAngle = 0.3;
		this.controls.maxPolarAngle = Math.PI * 0.6;
		this.controls.autoRotate = false; // Disable auto-rotation to let user control the angle
		this.controls.autoRotateSpeed = 0.5; // Slower rotation for a more premium feel

		// Add the mouse move and up listeners to detect dragging
		this.canvasElement.addEventListener(
			"mousedown",
			this.handleMouseDown.bind(this)
		);
	}

	// Track if user is dragging to prevent model cycling when they're just trying to rotate
	private isDragging = false;
	private mouseDownTime = 0;

	private handleMouseDown(event: MouseEvent): void {
		// Only track primary mouse button (left click)
		if (event.button !== 0) return;

		this.isDragging = false;
		this.mouseDownTime = Date.now();

		// Add temporary listeners that will be removed after mouse up/out
		window.addEventListener("mousemove", this.handleMouseMove.bind(this), {
			once: true,
		});
		window.addEventListener("mouseup", this.handleMouseUp.bind(this));
		this.canvasElement?.addEventListener(
			"mouseout",
			this.handleMouseUp.bind(this)
		);
	}

	private handleMouseMove(): void {
		this.isDragging = true;
	}

	private handleMouseUp(event: MouseEvent): void {
		// Remove the listeners to avoid memory leaks
		window.removeEventListener("mouseup", this.handleMouseUp.bind(this));
		this.canvasElement?.removeEventListener(
			"mouseout",
			this.handleMouseUp.bind(this)
		);

		// If this was a quick click (not a drag) and not on a UI element, it's a valid cycle click
		const clickDuration = Date.now() - this.mouseDownTime;
		if (
			!this.isDragging &&
			clickDuration < 200 &&
			!this.isClickingUI(event)
		) {
			// Dispatch a custom event to notify about the click on the canvas
			const cycleEvent = new CustomEvent("model-cycle-click");
			window.dispatchEvent(cycleEvent);
		}

		this.isDragging = false;
	}

	private isClickingUI(event: MouseEvent): boolean {
		// Check if the click target is a UI element that should not trigger model cycling
		const target = event.target as HTMLElement;

		// Check if the target is a button or inside UI container
		const isUiElement =
			target.closest("#ui-container") !== null ||
			target.closest(".export-buttons") !== null ||
			target.closest("#theme-toggle") !== null ||
			target.tagName === "BUTTON";

		return isUiElement;
	}

	private setupLights(): void {
		if (!this.scene) return;

		// Increase ambient light intensity for better overall brightness
		const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
		this.scene.add(ambientLight);

		// Create a group to hold the lights
		this.lightHolder = new THREE.Group();

		// Increase main light intensity
		const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
		mainLight.position.set(10, 15, 10);
		mainLight.castShadow = true;
		mainLight.shadow.mapSize = new THREE.Vector2(1024, 1024);
		mainLight.shadow.bias = -0.0001;
		this.lightHolder.add(mainLight);

		// Brighter fill light
		const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
		fillLight.position.set(-10, 5, -5);
		this.lightHolder.add(fillLight);

		// Add light holder to scene
		this.scene.add(this.lightHolder);

		// Determine if dark mode is active
		const isDark =
			document.documentElement.classList.contains("dark-theme");

		// Minimal ground shadow with reduced opacity for better contrast
		const planeGeometry = new THREE.PlaneGeometry(40, 40);
		const shadowPlaneMaterial = new THREE.ShadowMaterial({
			opacity: isDark ? 0.06 : 0.1, // Reduced shadow opacity
			transparent: true,
		});
		const shadowPlaneMesh = new THREE.Mesh(
			planeGeometry,
			shadowPlaneMaterial
		);
		shadowPlaneMesh.position.y = -4;
		shadowPlaneMesh.rotation.x = -0.5 * Math.PI;
		shadowPlaneMesh.receiveShadow = true;
		this.lightHolder.add(shadowPlaneMesh);
	}

	private setupGeometries(): void {
		// Clean voxel geometry
		this.voxelGeometry = new RoundedBoxGeometry(
			this.params.boxSize,
			this.params.boxSize,
			this.params.boxSize,
			3, // Segments
			this.params.boxRoundness // Subtle roundness
		);

		// Enhanced material for better light reflection
		this.voxelMaterial = new THREE.MeshStandardMaterial({
			roughness: 0.3, // Lower roughness for better light reflection
			metalness: 0.15, // Slightly more metalness
			flatShading: false,
			envMapIntensity: 1.0, // Better environment reflection
		});
	}

	public recreateInstancedMesh(count: number): void {
		if (!this.scene || !this.voxelGeometry || !this.voxelMaterial) return;

		// Remove existing instanced mesh if it exists
		if (this.instancedMesh) {
			this.scene.remove(this.instancedMesh);
		}

		// Re-initialize the voxel array with random colors and positions
		this.voxels = [];
		for (let i = 0; i < count; i++) {
			const randomCoordinate = () => {
				let v = Math.random() - 0.5;
				v -= v % this.params.gridSize;
				return v;
			};
			this.voxels.push({
				position: new THREE.Vector3(
					randomCoordinate(),
					randomCoordinate(),
					randomCoordinate()
				),
				// Default white color - will be overridden by actual model colors
				color: new THREE.Color(1, 1, 1),
			});
		}

		// Create a new instanced mesh object
		this.instancedMesh = new THREE.InstancedMesh(
			this.voxelGeometry,
			this.voxelMaterial,
			count
		);
		this.instancedMesh.castShadow = true;
		this.instancedMesh.receiveShadow = true;

		// Assign voxels data to the instanced mesh
		for (let i = 0; i < count; i++) {
			this.instancedMesh.setColorAt(i, this.voxels[i].color);
			this.updateMatrix(i);
		}
		this.instancedMesh.instanceMatrix.needsUpdate = true;
		if (this.instancedMesh.instanceColor) {
			this.instancedMesh.instanceColor.needsUpdate = true;
		}

		// Add a new mesh to the scene
		this.scene.add(this.instancedMesh);
	}

	private updateMatrix(index: number): void {
		if (!this.instancedMesh) return;

		this.dummy.position.copy(this.voxels[index].position);
		this.dummy.updateMatrix();
		this.instancedMesh.setMatrixAt(index, this.dummy.matrix);
		this.instancedMesh.instanceMatrix.needsUpdate = true;
	}

	private render = (): void => {
		if (
			!this.renderer ||
			!this.scene ||
			!this.camera ||
			!this.controls ||
			!this.lightHolder
		)
			return;

		// Update controls
		this.controls.update();

		// Update light position to follow camera
		this.lightHolder.quaternion.copy(this.camera.quaternion);

		// Render scene
		this.renderer.render(this.scene, this.camera);

		// Continue animation loop
		requestAnimationFrame(this.render);
	};

	private handleResize(): void {
		if (!this.renderer || !this.camera) return;

		// Update sizes
		const width = window.innerWidth;
		const height = window.innerHeight;

		// Update camera
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();

		// Update renderer
		this.renderer.setSize(width, height);
	}

	/**
	 * Export the currently visible voxel model
	 * @param format The format to export as
	 */
	public exportCurrentModel(format: ExportFormat = ExportFormat.OBJ): void {
		if (!this.instancedMesh || !this.scene) {
			console.error("Cannot export: no model loaded");
			return;
		}

		// Get the current model's voxels (use only the active ones)
		const activeVoxels = this.voxelsPerModel[this.activeModelIndex] || [];
		if (activeVoxels.length === 0) {
			console.error("Cannot export: no active voxels");
			return;
		}

		// Convert the instanced mesh to regular meshes
		const exportGroup = ModelExporter.convertInstancedMeshToRegular(
			this.instancedMesh,
			activeVoxels.slice(0, this.instancedMesh.count)
		);

		// Get the model name for the filename
		const modelLoader = document.querySelector("#selector")?.childNodes[
			this.activeModelIndex
		] as HTMLElement;
		const modelName =
			modelLoader?.getAttribute("data-model-name") ||
			`model-${this.activeModelIndex}`;

		// Create a sanitized filename
		const filename = `cubexo-${modelName
			.toLowerCase()
			.replace(/[^a-z0-9]/g, "-")}`;

		// Show export notification
		this.showExportNotification();

		// Export the model
		ModelExporter.exportModel(exportGroup, format, filename);
	}

	/**
	 * Export a high-resolution PNG image of the current view (2000x2000 pixels)
	 * Uses the current camera angle set by the user
	 */
	public exportAsPng(): void {
		if (!this.renderer || !this.scene || !this.camera) {
			console.error("Cannot export: renderer not initialized");
			return;
		}

		// Get model name for the filename
		const modelLoader = document.querySelector("#selector")?.childNodes[
			this.activeModelIndex
		] as HTMLElement;
		const modelName =
			modelLoader?.getAttribute("data-model-name") ||
			`model-${this.activeModelIndex}`;

		// Create a sanitized filename
		const filename = `cubexo-${modelName
			.toLowerCase()
			.replace(/[^a-z0-9]/g, "-")}.png`;

		// Store original renderer size and pixel ratio
		const originalSize = {
			width: this.renderer.domElement.width,
			height: this.renderer.domElement.height,
			pixelRatio: this.renderer.getPixelRatio(),
		};

		// Temporarily disable controls
		if (this.controls) {
			this.controls.enabled = false;
		}

		// Configure renderer for high-res screenshot
		this.renderer.setSize(2000, 2000);
		this.renderer.setPixelRatio(1);

		// Use current camera angle for the export (keep user's chosen angle)
		// Just update projection matrix for the new aspect ratio
		this.camera.aspect = 1; // Square aspect ratio for the export
		this.camera.updateProjectionMatrix();

		// Render the scene
		this.renderer.render(this.scene, this.camera);

		// Create download link for the PNG
		try {
			const dataURL = this.renderer.domElement.toDataURL("image/png");
			const link = document.createElement("a");
			link.href = dataURL;
			link.download = filename;
			link.click();

			// Show export notification
			this.showExportNotification("PNG exported with your custom angle");
		} catch (error) {
			console.error("Error exporting PNG:", error);
		}

		// Restore original renderer settings
		this.renderer.setSize(originalSize.width, originalSize.height);
		this.renderer.setPixelRatio(originalSize.pixelRatio);

		// Restore camera aspect ratio
		this.camera.aspect = originalSize.width / originalSize.height;
		this.camera.updateProjectionMatrix();

		// Re-enable controls
		if (this.controls) {
			this.controls.enabled = true;
		}
	}

	/**
	 * Display a clean, minimal notification when exporting
	 */
	private showExportNotification(message: string = "Model exported"): void {
		// Remove any existing notifications
		const existingNotification = document.querySelector(
			".export-notification"
		);
		if (existingNotification) {
			existingNotification.remove();
		}

		// Create notification element
		const notification = document.createElement("div");
		notification.className = "export-notification";

		// Add checkmark icon for success
		const checkIcon = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"svg"
		);
		checkIcon.setAttribute("width", "16");
		checkIcon.setAttribute("height", "16");
		checkIcon.setAttribute("viewBox", "0 0 24 24");
		checkIcon.setAttribute("fill", "none");
		checkIcon.setAttribute("stroke", "currentColor");
		checkIcon.setAttribute("stroke-width", "2");
		checkIcon.setAttribute("stroke-linecap", "round");
		checkIcon.setAttribute("stroke-linejoin", "round");

		const path = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"path"
		);
		path.setAttribute("d", "M20 6L9 17l-5-5");
		checkIcon.appendChild(path);

		// Text content
		const textSpan = document.createElement("span");
		textSpan.textContent = message;

		// Append elements
		notification.appendChild(checkIcon);
		notification.appendChild(textSpan);

		// Style the container for horizontal layout
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
		}, 2000);
	}
}
