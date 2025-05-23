import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import gsap from "gsap";
import type { Voxel, AppParameters } from "../types/types";
import { ModelExporter, ExportFormat } from "../utils/ModelExporter";

export class VoxelModelViewer {
	private matrixUpdateTween: gsap.core.Tween | null = null;
	private renderer: THREE.WebGLRenderer | null = null;
	private scene: THREE.Scene | null = null;
	private camera: THREE.PerspectiveCamera | null = null;
	private controls: OrbitControls | null = null;
	private lightHolder: THREE.Group | null = null;

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

	public animateToModel(_oldModelIdx: number, newModelIdx: number): void {
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

		// Listen for theme changes on window
		const themeChangeHandler = ((event: CustomEvent) => {
			console.log('[VoxelModelViewer] Received themechange event on window:', event.detail);
			const isDark = event.detail?.theme === 'dark';
			console.log(`[VoxelModelViewer] Theme changed to: ${isDark ? 'dark' : 'light'}`);
			this.updateBackgroundForTheme(isDark);
		}) as EventListener;

		window.addEventListener("themechange", themeChangeHandler);
		console.log('[VoxelModelViewer] Added themechange event listener to window.');
	}

	private updateBackgroundForTheme(isDark?: boolean): void {
		console.log('[VoxelModelViewer] updateBackgroundForTheme called.');
		if (!this.scene) {
			console.error('[VoxelModelViewer] Scene not initialized in updateBackgroundForTheme.');
			return;
		}

		// If isDark is not provided, detect from the DOM
		if (isDark === undefined) {
			isDark = document.documentElement.classList.contains("dark");
			console.log('[VoxelModelViewer] Theme detection from DOM:', isDark ? 'dark' : 'light');
		}

		// Set scene background color based on theme
		if (isDark) {
			// Dark mode - darker background
			this.scene.background = new THREE.Color(0x111111);
			console.log('[VoxelModelViewer] Setting dark background (0x111111).');
			
			// Update lighting for dark mode
			this.updateLightingForTheme(true);
		} else {
			// Light mode - pure white background (shadcn style)
			this.scene.background = new THREE.Color(0xffffff); // Pure white (shadcn)
			console.log('[VoxelModelViewer] Setting light mode background (0xffffff) - shadcn style.');
			
			// Update lighting for light mode
			this.updateLightingForTheme(false);
		}

		// Force a render to show the changes immediately
		if (this.renderer && this.camera) {
			this.renderer.render(this.scene, this.camera);
			console.log('[VoxelModelViewer] Scene rendered after theme update.');
		} else {
			console.warn('[VoxelModelViewer] Renderer or camera not available for immediate render after theme update.');
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
	}

	private setupLights(): void {
		if (!this.scene) return;

		// Create ambient light
		const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
		ambientLight.name = 'ambientLight';
		this.scene.add(ambientLight);

		// Create a group to hold the lights
		this.lightHolder = new THREE.Group();
		this.lightHolder.name = 'lightHolder';

		// Main directional light
		const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
		mainLight.name = 'mainLight';
		mainLight.position.set(10, 15, 10);
		mainLight.castShadow = true;
		mainLight.shadow.mapSize = new THREE.Vector2(1024, 1024);
		mainLight.shadow.bias = -0.0001;
		this.lightHolder.add(mainLight);

		// Fill light
		const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
		fillLight.name = 'fillLight';
		fillLight.position.set(-10, 5, -5);
		this.lightHolder.add(fillLight);

		// Add light holder to scene
		this.scene.add(this.lightHolder);

		// Determine if dark mode is active
		const isDark = document.documentElement.classList.contains("dark");

		// Minimal ground shadow with reduced opacity for better contrast
		const planeGeometry = new THREE.PlaneGeometry(40, 40);
		const shadowPlaneMaterial = new THREE.ShadowMaterial({
			opacity: isDark ? 0.1 : 0.15,
			transparent: true,
		});
		const shadowPlaneMesh = new THREE.Mesh(
			planeGeometry,
			shadowPlaneMaterial
		);
		shadowPlaneMesh.name = 'shadowPlane';
		shadowPlaneMesh.rotation.x = -Math.PI / 2;
		shadowPlaneMesh.position.y = -5;
		shadowPlaneMesh.receiveShadow = true;
		this.scene.add(shadowPlaneMesh);
		
		// Initialize lighting based on current theme
		this.updateLightingForTheme(isDark);
	}

	private updateLightingForTheme(isDark: boolean): void {
		if (!this.scene || !this.lightHolder) return;

		// Find lights by name
		const mainLight = this.lightHolder.children.find(child => child.name === 'mainLight') as THREE.DirectionalLight;
		const fillLight = this.lightHolder.children.find(child => child.name === 'fillLight') as THREE.DirectionalLight;
		const ambientLight = this.scene.children.find(child => child.name === 'ambientLight') as THREE.AmbientLight;
		const shadowPlane = this.scene.children.find(child => child.name === 'shadowPlane') as THREE.Mesh;

		if (isDark) {
			// Dark theme lighting - more dramatic, higher contrast
			if (mainLight) {
				mainLight.intensity = 1.0;
				mainLight.color.set(0xffffff);
			}
			if (fillLight) {
				fillLight.intensity = 0.5;
				fillLight.color.set(0xffffff);
			}
			if (ambientLight) {
				ambientLight.intensity = 0.7;
				ambientLight.color.set(0xffffff);
			}

			// Update shadow opacity
			if (shadowPlane && shadowPlane.material instanceof THREE.ShadowMaterial) {
				shadowPlane.material.opacity = 0.1;
				shadowPlane.material.needsUpdate = true;
			}
		} else {
			// Light theme lighting - clean, crisp shadcn-style lighting
			if (mainLight) {
				mainLight.intensity = 1.2;
				mainLight.color.set(0xffffff); // Pure white (shadcn style)
			}
			if (fillLight) {
				fillLight.intensity = 0.6;
				fillLight.color.set(0xf9fafb); // Very slight cool tint
			}
			if (ambientLight) {
				ambientLight.intensity = 0.8;
				ambientLight.color.set(0xffffff); // Pure white
			}

			// Update shadow opacity - subtle shadows for shadcn aesthetic
			if (shadowPlane && shadowPlane.material instanceof THREE.ShadowMaterial) {
				shadowPlane.material.opacity = 0.1; // More subtle shadow
				shadowPlane.material.needsUpdate = true;
			}
		}

		console.log(`Updated lighting for ${isDark ? 'dark' : 'light'} theme`);
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
	 * Uses the current camera angle set by the user but zooms in for better detail
	 */
	public exportAsPng(): void {
		if (
			!this.renderer ||
			!this.scene ||
			!this.camera ||
			!this.instancedMesh
		) {
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

		// Store original renderer size, pixel ratio and settings
		const originalSize = {
			width: this.renderer.domElement.width,
			height: this.renderer.domElement.height,
			pixelRatio: this.renderer.getPixelRatio(),
		};

		// Store camera state
		const originalCamera = {
			position: this.camera.position.clone(),
			target: new THREE.Vector3(0, 0, 0),
			zoom: this.camera.zoom,
			fov: this.camera.fov,
		};

		// Store renderer settings
		const originalRendererSettings = {
			shadowMapEnabled: this.renderer.shadowMap.enabled,
			shadowMapType: this.renderer.shadowMap.type,
			toneMapping: this.renderer.toneMapping,
			toneMappingExposure: this.renderer.toneMappingExposure,
		};

		// Temporarily disable controls
		if (this.controls) {
			this.controls.enabled = false;
		}

		// Enhance renderer for high-quality export
		this.renderer.setSize(2000, 2000);
		this.renderer.setPixelRatio(2); // Adjusted from 3 to 2 for balanced quality and performance

		// Enhance shadows and tone mapping for export
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.2;

		// Get the current camera direction
		const cameraDirection = new THREE.Vector3();
		this.camera.getWorldDirection(cameraDirection);

		// Calculate the center of the model
		const box = new THREE.Box3().setFromObject(this.instancedMesh);
		const center = new THREE.Vector3();
		box.getCenter(center);

		// Create a new scene for high-res rendering
		const zoomFactor = 0.4; // Adjusted from 0.6 to 0.4 for a closer zoom (larger model in frame)
		const originalDistance = this.camera.position.distanceTo(center);
		const newDistance = originalDistance * zoomFactor;

		// Move camera closer to the model along its current direction
		const newPosition = center
			.clone()
			.add(cameraDirection.multiplyScalar(-newDistance));

		// Apply new camera position
		this.camera.position.copy(newPosition);

		// Update controls if needed
		if (this.controls) {
			this.controls.target = center;
			this.controls.update();
		}

		// Use square aspect ratio for the export
		this.camera.aspect = 1;
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
			this.showExportNotification("High-quality PNG exported");
		} catch (error) {
			console.error("Error exporting PNG:", error);
		}

		// Restore original renderer settings
		this.renderer.setSize(originalSize.width, originalSize.height);
		this.renderer.setPixelRatio(originalSize.pixelRatio);
		this.renderer.shadowMap.enabled =
			originalRendererSettings.shadowMapEnabled;
		this.renderer.shadowMap.type = originalRendererSettings.shadowMapType;
		this.renderer.toneMapping = originalRendererSettings.toneMapping;
		this.renderer.toneMappingExposure =
			originalRendererSettings.toneMappingExposure;

		// Restore camera position and properties
		this.camera.position.copy(originalCamera.position);
		this.camera.zoom = originalCamera.zoom;
		this.camera.aspect = originalSize.width / originalSize.height;
		this.camera.fov = originalCamera.fov;
		this.camera.updateProjectionMatrix();

		// Restore controls
		if (this.controls) {
			this.controls.target.copy(originalCamera.target);
			this.controls.update();
			this.controls.enabled = true;
		}
	}

	/**
	 * Apply a shake effect to the model
	 * Uses GSAP to create a quick shaking animation on the model
	 */
	public applyShakeEffect(): void {
		if (!this.instancedMesh) return;
		const currentMesh = this.instancedMesh; // Assign to a local const

		// Kill any existing animations on scale
		gsap.killTweensOf(currentMesh.scale);

		// Store original rotation and scale
		const originalRotation = currentMesh.rotation.clone();
		const originalScale = currentMesh.scale.clone();

		// Create a timeline for the shake effect
		const timeline = gsap.timeline({
			onComplete: () => {
				// Re-check this.instancedMesh as it's an async callback and its state might have changed
				const meshInCallback = this.instancedMesh; // Assign to a new local constant
				if (meshInCallback) { // Check the new local constant
					// Reset to original rotation and scale
					gsap.to(meshInCallback.rotation, { // Use meshInCallback
						duration: 0.4,
						x: originalRotation.x,
						y: originalRotation.y,
						z: originalRotation.z,
						ease: "elastic.out(1, 0.75)"
					});
					gsap.to(meshInCallback.scale, { // Use meshInCallback
						duration: 0.4,
						x: originalScale.x,
						y: originalScale.y,
						z: originalScale.z,
						ease: "elastic.out(1, 0.75)"
					});
				}
			}
		});

		// Define shake parameters
		const shakeIntensityPosition = 0.05; // Reduced from 0.1
		const shakeIntensityRotation = 0.03; // Reduced from 0.05
		const shakeDuration = 0.07; // Reduced from 0.1
		const numShakes = 4; // Reduced from 5
		const totalDuration = numShakes * shakeDuration;

		// Add shakes to the timeline
		for (let i = 0; i < numShakes; i++) {
			const progress = (i + 1) / numShakes;
			const currentIntensityPos = shakeIntensityPosition * (1 - progress * 0.5); // Intensity decreases slightly
			const currentIntensityRot = shakeIntensityRotation * (1 - progress * 0.5);

			// Shake position
			timeline.to(currentMesh.position, { // Use currentMesh
				x: `+=${(Math.random() - 0.5) * 2 * currentIntensityPos}`,
				y: `+=${(Math.random() - 0.5) * 2 * currentIntensityPos}`,
				z: `+=${(Math.random() - 0.5) * 2 * currentIntensityPos}`,
				duration: shakeDuration,
				ease: "power1.inOut"
			}, i * shakeDuration);

			// Shake rotation
			timeline.to(currentMesh.rotation, { // Use currentMesh
				x: `+=${(Math.random() - 0.5) * 2 * currentIntensityRot}`,
				y: `+=${(Math.random() - 0.5) * 2 * currentIntensityRot}`,
				z: `+=${(Math.random() - 0.5) * 2 * currentIntensityRot}`,
				duration: shakeDuration,
				ease: "power1.inOut"
			}, i * shakeDuration);
		}

		// Return to original position smoothly after shakes
			timeline.to(currentMesh.position, { // Use currentMesh
				x: 0, // Assuming original position is 0,0,0 relative to its parent
				y: 0,
				z: 0,
				duration: 0.3,
				ease: "power2.out"
			}, totalDuration);


		// Ensure the model is exactly at original rotation/scale at the very end via onComplete
		// The onComplete callback already handles this.

		// Show a notification that the effect was applied
		this.showEffectNotification("Shake effect applied");
	}

	/**
	 * Apply an explode effect to the model
	 * Temporarily explodes the model outward and then brings it back together
	 */
	public applyExplodeEffect(): void {
		if (!this.instancedMesh) return;

		// Kill any ongoing global matrix update tween from a previous effect
		if (this.matrixUpdateTween) {
			this.matrixUpdateTween.kill();
			this.matrixUpdateTween = null;
		}

		// Kill existing tweens for all voxel positions to prevent conflicts
		for (let i = 0; i < this.instancedMesh.count; i++) {
			if (this.voxels[i]) {
				gsap.killTweensOf(this.voxels[i].position);
			}
		}

		let maxIndividualAnimationDuration = 0;

		for (let i = 0; i < this.instancedMesh.count; i++) {
			const voxelInfo = this.voxels[i];
			if (!voxelInfo) continue;

			const originalPosition = voxelInfo.position.clone();

			// Calculate exploded position
			let direction = originalPosition.clone();
			if (direction.lengthSq() === 0) { // If original position is at origin
				direction.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
			}
			direction.normalize();

			const explosionDistance = 3 + Math.random() * 4; // Explode out by 3 to 7 units
			const explodedPosition = originalPosition.clone().add(direction.multiplyScalar(explosionDistance));

			const explodeDuration = 0.3 + Math.random() * 0.2;
			const returnDelay = 0.1;
			const returnDuration = 0.5 + Math.random() * 0.3;
			const startDelay = Math.random() * 0.15;

			const individualDuration = startDelay + explodeDuration + returnDelay + returnDuration;
			if (individualDuration > maxIndividualAnimationDuration) {
				maxIndividualAnimationDuration = individualDuration;
			}

			const tl = gsap.timeline({
				onUpdate: () => {
					this.updateMatrix(i);
				}
			});

			tl.to(voxelInfo.position, {
				x: explodedPosition.x,
				y: explodedPosition.y,
				z: explodedPosition.z,
				duration: explodeDuration,
				ease: "power2.out",
				delay: startDelay
			})
			.to(voxelInfo.position, { // Return to original
				x: originalPosition.x,
				y: originalPosition.y,
				z: originalPosition.z,
				duration: returnDuration,
				ease: "elastic.out(1, 0.7)",
				delay: returnDelay
			});
		}

		// Ensure instanceMatrix.needsUpdate is set throughout the animations
		if (maxIndividualAnimationDuration > 0 && this.instancedMesh) {
			this.matrixUpdateTween = gsap.to({}, {
				duration: maxIndividualAnimationDuration,
				onUpdate: () => {
					if (this.instancedMesh) {
						this.instancedMesh.instanceMatrix.needsUpdate = true;
					}
				},
				onComplete: () => {
					// Final update to ensure all matrices are correct
					if (this.instancedMesh) {
						for (let k = 0; k < this.instancedMesh.count; k++) {
							if (this.voxels[k]) {
								this.updateMatrix(k);
							}
						}
						this.instancedMesh.instanceMatrix.needsUpdate = true;
					}
					this.matrixUpdateTween = null; // Clear the reference
				}
			});
		}

		// Show a notification that the effect was applied
		this.showEffectNotification("Explode effect applied");
	}

	/**
	 * Show notification for effects with Tailwind classes (indigo theme)
	 */
	private showEffectNotification(message: string): void {
		// Create notification element with Tailwind classes
		const notification = document.createElement("div");
		notification.className =
			"fixed bottom-8 right-8 bg-indigo-900/90 border border-indigo-800/80 rounded-lg py-3 px-4 flex items-center gap-3 shadow-md z-50 animate-fade-in export-notification"; // Note: class 'export-notification' might be generic, consider 'effect-notification'

		// Effect icon
		const icon = document.createElement("div");
		icon.innerHTML = `
			<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-indigo-400 lucide lucide-sparkles">
				<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
				<path d="M5 3v4"/>
				<path d="M19 17v4"/>
				<path d="M3 5h4"/>
				<path d="M17 19h4"/>
			</svg>
		`;
		if (notification) { // Check notification, not icon, for appending
			notification.appendChild(icon);
		}

		// Message
		const text = document.createElement("span");
		text.className = "text-sm font-medium text-indigo-100";
		text.textContent = message;
		if (notification) { // Check notification for appending
			notification.appendChild(text);
		}

		if (document.body) { // Check document.body for appending
			document.body.appendChild(notification);
		}

		// Add fade-out animation
		setTimeout(() => {
			if (notification) {
				notification.classList.add("animate-fade-out");
				setTimeout(() => {
					if (notification.parentNode) {
						notification.parentNode.removeChild(notification);
					}
				}, 300); // Duration of fade-out animation
			}
		}, 2000); // Display duration before fading out
	}

	/**
	 * Show export notification with Tailwind classes
	 */
	private showExportNotification(message: string = "Model exported"): void {
		// Remove any existing notifications to prevent stacking
		const existingNotifications = document.querySelectorAll(
			".export-notification"
		);
		existingNotifications.forEach((notif) => {
			if (notif.parentNode) {
				notif.parentNode.removeChild(notif);
			}
		});

		// Create notification element with Tailwind classes
		const notification = document.createElement("div");
		notification.className =
			"fixed bottom-8 right-8 bg-gray-900 border border-gray-800 rounded-lg py-3 px-4 flex items-center gap-3 shadow-md z-50 animate-fade-in export-notification";

		// Success icon
		const icon = document.createElement("div");
		icon.innerHTML = `
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-400">
				<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
				<polyline points="22 4 12 14.01 9 11.01"></polyline>
			</svg>
		`;
		// Safely append icon to notification
		if (icon && notification) {
			notification.appendChild(icon);
		}

		// Message
		const text = document.createElement("span");
		text.className = "text-sm font-medium text-gray-100";
		text.textContent = message;
		// Safely append text to notification
		if (text && notification) {
			notification.appendChild(text);
		}

		// Safely append notification to document body
		if (notification && document.body) {
			document.body.appendChild(notification);
		}

		// Add fade-out animation
		if (notification) {
			setTimeout(() => {
				if (notification) {
					notification.classList.add("animate-fade-out");
					setTimeout(() => {
						if (notification && notification.parentNode) {
							notification.parentNode.removeChild(notification);
						}
					}, 300);
				}
			}, 3000);
		}
	}
}
