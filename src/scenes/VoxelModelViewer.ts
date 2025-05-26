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

	// Mouse interaction properties
	private raycaster: THREE.Raycaster = new THREE.Raycaster();
	private mouse: THREE.Vector2 = new THREE.Vector2();
	private hoveredVoxelIndex: number = -1;
	private voxelOriginalPositions: Map<number, THREE.Vector3> = new Map();
	private voxelHoverTweens: Map<
		number,
		gsap.core.Tween | gsap.core.Timeline
	> = new Map();
	private isInteractionEnabled: boolean = true;

	// Audio visualization properties
	private isAudioVisualizationActive: boolean = false;
	private audioData: number[] = [];
	private audioAnimationId: number | null = null;

	private params: AppParameters = {
		modelPreviewSize: 2,
		modelSize: 9,
		gridSize: 0.24,
		boxSize: 0.24,
		boxRoundness: 0.03,
	};

	// Optimization flags
	private instanceMatrixNeedsUpdate: boolean = false;
	private instanceColorNeedsUpdate: boolean = false;

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
		this.setupInteraction();

		// Add resize event listener
		window.addEventListener("resize", () => this.handleResize());

		// Initial resize to set correct sizes
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
		if (modelIdx < 0 || modelIdx >= this.voxelsPerModel.length) {
			console.warn("Invalid model index.");
			return;
		}

		const oldModelIdx = this.activeModelIndex;
		this.activeModelIndex = modelIdx;
		this.voxels = this.voxelsPerModel[this.activeModelIndex];

		// Populate/Update voxelOriginalPositions with the true resting positions for the new model
		this.voxelOriginalPositions.clear(); // Clear for the new model
		for (let i = 0; i < this.voxels.length; i++) {
			if (this.voxels[i] && this.voxels[i].position) {
				this.voxelOriginalPositions.set(
					i,
					this.voxels[i].position.clone()
				);
			} else {
				console.warn(
					`Voxel at index ${i} is undefined or has no position during setActiveModel.`
				);
			}
		}

		// Check if instancedMesh needs to be recreated or if it's just a model switch
		const needsRecreation =
			!this.instancedMesh ||
			this.instancedMesh.count !== this.voxels.length;

		if (oldModelIdx === this.activeModelIndex && !needsRecreation) {
			// If same model and count matches, likely just a refresh, ensure positions are reset
			// This might happen if setActiveModel is called again for the current model
			this.forceResetAllVoxelPositions(); // Use the newly populated true originals
		} else if (needsRecreation) {
			this.recreateInstancedMesh(this.voxels.length);
		} else if (oldModelIdx !== this.activeModelIndex) {
			// Corrected: newModelIdx to this.activeModelIndex
			this.animateToModel(oldModelIdx, this.activeModelIndex);
		} else {
			// Fallback: if not animating and not recreating, still ensure positions are set from new model data
			for (let i = 0; i < this.voxels.length; i++) {
				if (this.voxels[i] && this.voxels[i].position) {
					// Added null check for this.voxels[i].position
					this.dummy.position.copy(this.voxels[i].position);
					this.dummy.updateMatrix();
					if (this.instancedMesh) {
						this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
					}
				}
			}
			if (this.instancedMesh) {
				this.instancedMesh.instanceMatrix.needsUpdate = true;
			}
		}

		this.isInteractionEnabled = true; // Ensure interactions are enabled
	}

	public animateToModel(_oldModelIdx: number, newModelIdx: number): void {
		// Prevent interaction during transition
		this.isInteractionEnabled = false;

		// Store transition start time for performance tracking
		const startTime = performance.now();

		// Cancel any existing animations to prevent conflicts
		if (this.matrixUpdateTween) {
			this.matrixUpdateTween.kill();
			this.matrixUpdateTween = null;
		}

		// Kill any existing hover tweens
		this.voxelHoverTweens.forEach((tween) => {
			tween.kill();
		});
		this.voxelHoverTweens.clear();

		// Reset hovered voxel
		if (this.hoveredVoxelIndex !== -1) {
			this.handleVoxelUnhover(this.hoveredVoxelIndex);
			this.hoveredVoxelIndex = -1;
		}

		// Calculate actual transition count for optimal performance
		const sourceCount = this.voxels.length;
		const targetCount = this.voxelsPerModel[newModelIdx]?.length || 0;

		// Intelligently calculate max animations to maintain performance
		// This keeps animations under 1000 regardless of model size
		const maxAnimations = Math.min(500, Math.max(sourceCount, targetCount));
		const animationRatio =
			maxAnimations / Math.max(sourceCount, targetCount);

		// Pre-process target model for more intelligent voxel mapping
		const targetVoxels = this.voxelsPerModel[newModelIdx] || [];

		// Create spatial mapping of target voxels for better transitions
		const targetVoxelsByRegion = new Map<string, Voxel[]>();
		targetVoxels.forEach((voxel) => {
			// Create a region key based on approximate position (divide space into sectors)
			const regionX = Math.floor(voxel.position.x);
			const regionY = Math.floor(voxel.position.y);
			const regionZ = Math.floor(voxel.position.z);
			const regionKey = `${regionX},${regionY},${regionZ}`;

			if (!targetVoxelsByRegion.has(regionKey)) {
				targetVoxelsByRegion.set(regionKey, []);
			}
			targetVoxelsByRegion.get(regionKey)!.push(voxel);
		});

		// Create a color mapping for better color transitions
		const targetColorGroups = new Map<string, Voxel[]>();
		targetVoxels.forEach((voxel) => {
			// Group by approximate color (reduced precision)
			const colorKey = `${Math.floor(voxel.color.r * 5)},${Math.floor(
				voxel.color.g * 5
			)},${Math.floor(voxel.color.b * 5)}`;
			if (!targetColorGroups.has(colorKey)) {
				targetColorGroups.set(colorKey, []);
			}
			targetColorGroups.get(colorKey)!.push(voxel);
		});

		// Find closest target voxel for each source voxel
		const targetMappings = new Map<
			number,
			{ position: THREE.Vector3; color: THREE.Color }
		>();

		// Batch animation setup to improve performance
		const positionAnimations: gsap.core.Tween[] = [];
		const colorAnimations: gsap.core.Tween[] = [];

		// Process each voxel
		for (let i = 0; i < this.voxels.length; i++) {
			// Skip animations based on ratio to limit total count
			if (Math.random() > animationRatio && i >= targetCount) {
				continue;
			}

			// Set up position and color targets
			let targetPos: THREE.Vector3;
			let targetColor: THREE.Color | null = null;

			// If there's a direct mapping voxel in the target model
			if (i < targetCount) {
				targetPos = targetVoxels[i].position;
				targetColor = targetVoxels[i].color;
			} else {
				// Find a suitable target voxel using spatial mapping
				const sourceVoxel = this.voxels[i];
				const regionX = Math.floor(sourceVoxel.position.x);
				const regionY = Math.floor(sourceVoxel.position.y);
				const regionZ = Math.floor(sourceVoxel.position.z);
				const regionKey = `${regionX},${regionY},${regionZ}`;

				// Try to find voxels in the same region first
				let candidateVoxels = targetVoxelsByRegion.get(regionKey) || [];

				// If no voxels in this region, find the closest region that has voxels
				if (candidateVoxels.length === 0) {
					// Try adjacent regions
					for (let dx = -1; dx <= 1; dx++) {
						for (let dy = -1; dy <= 1; dy++) {
							for (let dz = -1; dz <= 1; dz++) {
								const nearbyKey = `${regionX + dx},${
									regionY + dy
								},${regionZ + dz}`;
								const nearbyVoxels =
									targetVoxelsByRegion.get(nearbyKey) || [];
								if (nearbyVoxels.length > 0) {
									candidateVoxels = nearbyVoxels;
									break;
								}
							}
							if (candidateVoxels.length > 0) break;
						}
						if (candidateVoxels.length > 0) break;
					}
				}

				// If still no candidates, try color-based mapping
				if (candidateVoxels.length === 0) {
					const sourceColor = sourceVoxel.color;
					const colorKey = `${Math.floor(
						sourceColor.r * 5
					)},${Math.floor(sourceColor.g * 5)},${Math.floor(
						sourceColor.b * 5
					)}`;
					candidateVoxels = targetColorGroups.get(colorKey) || [];
				}

				// Last resort - use random voxel from target model
				if (candidateVoxels.length === 0 && targetVoxels.length > 0) {
					const randomIndex = Math.floor(
						targetVoxels.length * Math.random()
					);
					candidateVoxels = [targetVoxels[randomIndex]];
				}

				// Use the candidate or default to origin
				if (candidateVoxels.length > 0) {
					const selectedVoxel =
						candidateVoxels[
							Math.floor(Math.random() * candidateVoxels.length)
						];
					targetPos = selectedVoxel.position;
					targetColor = selectedVoxel.color;
				} else {
					// Fallback if no candidates found
					targetPos = new THREE.Vector3(0, 0, 0);
				}
			}

			// Store the mapping for later use
			targetMappings.set(i, {
				position: targetPos,
				color: targetColor || this.voxels[i].color,
			});

			// Create position animation with variable duration for natural feel
			const duration = 0.8 + 0.4 * Math.random();
			const delay = 0.2 * Math.random();

			// Position animation
			const posAnim = gsap.to(this.voxels[i].position, {
				delay,
				duration,
				x: targetPos.x,
				y: targetPos.y,
				z: targetPos.z,
				ease: "back.out(2)",
				onUpdate: () => {
					this.updateMatrix(i);
				},
				paused: true,
			});
			positionAnimations.push(posAnim);

			// Color animation if target color exists
			if (targetColor) {
				const colorAnim = gsap.to(this.voxels[i].color, {
					delay: delay + duration * 0.5, // Start color change halfway through position animation
					duration: duration * 0.5,
					r: targetColor.r,
					g: targetColor.g,
					b: targetColor.b,
					ease: "power1.in",
					onUpdate: () => {
						if (this.instancedMesh) {
							this.instancedMesh.setColorAt(
								i,
								this.voxels[i].color
							);
							// Use flag instead of direct update
							this.instanceColorNeedsUpdate = true;
						}
					},
					paused: true,
				});
				colorAnimations.push(colorAnim);
			}
		}

		// Batch matrix updates using a single tween for better performance
		this.matrixUpdateTween = gsap.to(
			{},
			{
				duration: 1.4,
				onUpdate: () => {
					if (this.instancedMesh) {
						this.instancedMesh.instanceMatrix.needsUpdate = true;
						if (this.instancedMesh.instanceColor) {
							this.instancedMesh.instanceColor.needsUpdate = true;
						}
					}
				},
				onComplete: () => {
					// Re-enable interaction
					this.isInteractionEnabled = true;

					// Log performance
					const endTime = performance.now();
					console.log(
						`Model transition completed in ${(
							endTime - startTime
						).toFixed(2)}ms`
					);

					// Update original positions map for new model
					this.voxelOriginalPositions.clear();
					for (let i = 0; i < this.voxels.length; i++) {
						if (this.voxels[i] && this.voxels[i].position) {
							this.voxelOriginalPositions.set(
								i,
								this.voxels[i].position.clone()
							);
						}
					}

					// Set active model index
					this.activeModelIndex = newModelIdx;
				},
			}
		);

		// Add rotation animation for visual interest
		if (this.instancedMesh) {
			gsap.to(this.instancedMesh.rotation, {
				duration: 1.4,
				y: "+=" + Math.PI,
				ease: "power2.out",
			});
		}

		// Handle count difference between models
		if (this.instancedMesh && this.voxelsPerModel[newModelIdx]) {
			gsap.to(this.instancedMesh, {
				duration: 0.6,
				count: this.voxelsPerModel[newModelIdx].length,
				ease: "power1.inOut",
			});
		}

		// Play all animations in parallel for better performance
		positionAnimations.forEach((anim) => anim.play());
		colorAnimations.forEach((anim) => anim.play());
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
			console.log(
				"[VoxelModelViewer] Received themechange event on window:",
				event.detail
			);
			const isDark = event.detail?.theme === "dark";
			console.log(
				`[VoxelModelViewer] Theme changed to: ${
					isDark ? "dark" : "light"
				}`
			);
			this.updateBackgroundForTheme(isDark);
		}) as EventListener;

		window.addEventListener("themechange", themeChangeHandler);
		console.log(
			"[VoxelModelViewer] Added themechange event listener to window."
		);
	}

	private updateBackgroundForTheme(isDark?: boolean): void {
		console.log("[VoxelModelViewer] updateBackgroundForTheme called.");
		if (!this.scene) {
			console.error(
				"[VoxelModelViewer] Scene not initialized in updateBackgroundForTheme."
			);
			return;
		}

		// If isDark is not provided, detect from the DOM
		if (isDark === undefined) {
			isDark = document.documentElement.classList.contains("dark");
			console.log(
				"[VoxelModelViewer] Theme detection from DOM:",
				isDark ? "dark" : "light"
			);
		}

		// Set scene background color based on theme
		if (isDark) {
			// Dark mode - darker background
			this.scene.background = new THREE.Color(0x111111);
			console.log(
				"[VoxelModelViewer] Setting dark background (0x111111)."
			);

			// Update lighting for dark mode
			this.updateLightingForTheme(true);
		} else {
			// Light mode - pure white background (shadcn style)
			this.scene.background = new THREE.Color(0xffffff); // Pure white (shadcn)
			console.log(
				"[VoxelModelViewer] Setting light mode background (0xffffff) - shadcn style."
			);

			// Update lighting for light mode
			this.updateLightingForTheme(false);
		}

		// Force a render to show the changes immediately
		if (this.renderer && this.camera) {
			this.renderer.render(this.scene, this.camera);
			console.log(
				"[VoxelModelViewer] Scene rendered after theme update."
			);
		} else {
			console.warn(
				"[VoxelModelViewer] Renderer or camera not available for immediate render after theme update."
			);
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
		ambientLight.name = "ambientLight";
		this.scene.add(ambientLight);

		// Create a group to hold the lights
		this.lightHolder = new THREE.Group();
		this.lightHolder.name = "lightHolder";

		// Main directional light
		const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
		mainLight.name = "mainLight";
		mainLight.position.set(10, 15, 10);
		mainLight.castShadow = true;
		mainLight.shadow.mapSize = new THREE.Vector2(1024, 1024);
		mainLight.shadow.bias = -0.0001;
		this.lightHolder.add(mainLight);

		// Fill light
		const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
		fillLight.name = "fillLight";
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
		shadowPlaneMesh.name = "shadowPlane";
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
		const mainLight = this.lightHolder.children.find(
			(child) => child.name === "mainLight"
		) as THREE.DirectionalLight;
		const fillLight = this.lightHolder.children.find(
			(child) => child.name === "fillLight"
		) as THREE.DirectionalLight;
		const ambientLight = this.scene.children.find(
			(child) => child.name === "ambientLight"
		) as THREE.AmbientLight;
		const shadowPlane = this.scene.children.find(
			(child) => child.name === "shadowPlane"
		) as THREE.Mesh;

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
			if (
				shadowPlane &&
				shadowPlane.material instanceof THREE.ShadowMaterial
			) {
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
			if (
				shadowPlane &&
				shadowPlane.material instanceof THREE.ShadowMaterial
			) {
				shadowPlane.material.opacity = 0.1; // More subtle shadow
				shadowPlane.material.needsUpdate = true;
			}
		}

		console.log(`Updated lighting for ${isDark ? "dark" : "light"} theme`);
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

		// Pre-allocate dummy object for matrix updates
		this.dummy = new THREE.Object3D();

		// Add optimization flag for batched updates
		this.instanceMatrixNeedsUpdate = false;
		this.instanceColorNeedsUpdate = false;
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
		if (this.instancedMesh && index >= 0 && index < this.voxels.length) {
			this.dummy.position.copy(this.voxels[index].position);
			this.dummy.updateMatrix();
			this.instancedMesh.setMatrixAt(index, this.dummy.matrix);

			// Flag for batch update instead of immediate update
			this.instanceMatrixNeedsUpdate = true;
		}
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

		// Check for voxel interactions if enabled
		if (this.isInteractionEnabled && this.instancedMesh) {
			this.checkVoxelInteraction();
		}

		// Render scene
		this.renderer.render(this.scene, this.camera);

		// Continue animation loop
		requestAnimationFrame(this.render);

		// Batch update instance matrices if needed
		if (this.instancedMesh) {
			if (this.instanceMatrixNeedsUpdate) {
				this.instancedMesh.instanceMatrix.needsUpdate = true;
				this.instanceMatrixNeedsUpdate = false;
			}

			if (
				this.instanceColorNeedsUpdate &&
				this.instancedMesh.instanceColor
			) {
				this.instancedMesh.instanceColor.needsUpdate = true;
				this.instanceColorNeedsUpdate = false;
			}
		}
	};

	/**
	 * Set up mouse interaction for voxels
	 */
	private setupInteraction(): void {
		if (!this.canvasElement) return;

		// Mouse move event for hover effects
		this.canvasElement.addEventListener("mousemove", (event) => {
			if (!this.canvasElement) return;

			// Calculate mouse position in normalized device coordinates (-1 to +1)
			const rect = this.canvasElement.getBoundingClientRect();
			this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
			this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
		});

		// Mouse click event for selecting voxels
		this.canvasElement.addEventListener("click", () => {
			if (this.hoveredVoxelIndex !== -1) {
				this.handleVoxelClick(this.hoveredVoxelIndex);
			}
		});
	}

	/**
	 * Check for voxel interactions using raycasting
	 */
	private checkVoxelInteraction(): void {
		if (!this.camera || !this.instancedMesh) return;

		// Update the raycaster with the current mouse position
		this.raycaster.setFromCamera(this.mouse, this.camera);

		// Check for intersections with the instanced mesh
		const intersects = this.raycaster.intersectObject(this.instancedMesh);

		// If we found an intersection
		if (intersects.length > 0) {
			// The instanceId property contains the index of the intersected instance
			const voxelIndex = intersects[0].instanceId;

			if (
				voxelIndex !== undefined &&
				voxelIndex !== this.hoveredVoxelIndex
			) {
				// Unhover previous voxel if there was one
				if (this.hoveredVoxelIndex !== -1) {
					this.handleVoxelUnhover(this.hoveredVoxelIndex);
				}

				// Hover new voxel
				this.hoveredVoxelIndex = voxelIndex;
				this.handleVoxelHover(voxelIndex);
			}
		} else if (this.hoveredVoxelIndex !== -1) {
			// No intersection, unhover current voxel
			this.handleVoxelUnhover(this.hoveredVoxelIndex);
			this.hoveredVoxelIndex = -1;
		}
	}

	/**
	 * Handle hover effect for a voxel - disperses nearby voxels
	 * @param index The index of the voxel to hover
	 */
	private handleVoxelHover(index: number): void {
		if (!this.instancedMesh || index < 0 || index >= this.voxels.length)
			return;

		// Get the position of the hovered voxel
		const hoveredPosition = this.voxels[index].position.clone();

		// Kill any existing hover tweens for all voxels
		this.voxelHoverTweens.forEach((tween) => tween.kill());
		this.voxelHoverTweens.clear();

		// Store original positions for all voxels if not already stored
		if (this.voxelOriginalPositions.size === 0) {
			for (let i = 0; i < this.voxels.length; i++) {
				this.voxelOriginalPositions.set(
					i,
					this.voxels[i].position.clone()
				);
			}
		}

		// Highlight the hovered voxel
		const originalScale = 1.0;
		const hoverScale = 1.2;
		const scaleObj = { scale: originalScale };

		// Create a tween for the hover effect on the main voxel
		const mainTween = gsap.to(scaleObj, {
			scale: hoverScale,
			duration: 0.3,
			ease: "power2.out",
			onUpdate: () => {
				// Update the matrix for this voxel with the new scale
				if (this.instancedMesh) {
					this.dummy.position.copy(this.voxels[index].position);
					this.dummy.scale.set(
						scaleObj.scale,
						scaleObj.scale,
						scaleObj.scale
					);
					this.dummy.updateMatrix();
					this.instancedMesh.setMatrixAt(index, this.dummy.matrix);
					this.instancedMesh.instanceMatrix.needsUpdate = true;
				}
			},
		});

		// Store the tween for later reference
		this.voxelHoverTweens.set(index, mainTween);

		// Find nearby voxels to disperse (within a certain radius)
		const disperseRadius = 1.5; // Adjust based on your model scale
		const maxDispersion = 0.5; // Maximum distance to push voxels away

		// Process each voxel to see if it's nearby
		for (let i = 0; i < this.voxels.length; i++) {
			// Skip the hovered voxel itself
			if (i === index) continue;

			const voxelPos = this.voxels[i].position;
			const distance = voxelPos.distanceTo(hoveredPosition);

			// If this voxel is within our disperse radius
			if (distance < disperseRadius) {
				// Calculate the direction to push the voxel (away from hovered voxel)
				const direction = new THREE.Vector3()
					.subVectors(voxelPos, hoveredPosition)
					.normalize();

				// Calculate dispersion amount based on distance (closer = more dispersion)
				const dispersionFactor = 1 - distance / disperseRadius;
				const dispersionAmount = maxDispersion * dispersionFactor;

				// Get original position from our stored map
				const originalPosition =
					this.voxelOriginalPositions.get(i) || voxelPos.clone();

				// Calculate target position
				const targetPosition = originalPosition
					.clone()
					.add(direction.multiplyScalar(dispersionAmount));

				// Create animation for this nearby voxel
				const nearbyTween = gsap.timeline();

				// Disperse outward
				nearbyTween.to(voxelPos, {
					x: targetPosition.x,
					y: targetPosition.y,
					z: targetPosition.z,
					duration: 0.3,
					ease: "power2.out",
					onUpdate: () => this.updateMatrix(i),
				});

				// Store the tween for later reference
				this.voxelHoverTweens.set(i, nearbyTween);
			}
		}

		// Update colors for hover effect
		if (this.instancedMesh) {
			this.instancedMesh.setColorAt(index, this.voxels[index].color);
			// Use flag instead of direct update
			this.instanceColorNeedsUpdate = true;
		}
	}

	/**
	 * Handle unhover effect for a voxel - smoothly returns all dispersed voxels
	 * @param index The index of the voxel to unhover
	 */
	private handleVoxelUnhover(index: number): void {
		if (!this.instancedMesh || index < 0 || index >= this.voxels.length)
			return;

		// Kill any existing hover tweens for all voxels
		this.voxelHoverTweens.forEach((tween) => tween.kill());
		this.voxelHoverTweens.clear();

		// Create a master timeline to ensure all animations complete
		const masterTimeline = gsap.timeline({
			onComplete: () => {
				// Final check to ensure all voxels are in their original positions
				this.forceResetAllVoxelPositions();
			},
		});

		// Return all voxels to their original positions
		for (let i = 0; i < this.voxels.length; i++) {
			// Get the original position from our map, or use current position if not found
			const originalPosition = this.voxelOriginalPositions.get(i);

			// Skip if we don't have an original position stored
			if (!originalPosition) continue;

			const currentPosition = this.voxels[i].position;

			// Only animate if the positions are different (using a small threshold for floating point comparison)
			const positionDifference =
				originalPosition.distanceTo(currentPosition);
			if (positionDifference > 0.001) {
				// Create a return animation with slight randomization for a more natural feel
				const returnDelay = Math.random() * 0.05; // Small random delay
				const returnDuration = 0.3 + Math.random() * 0.1; // Slightly varied duration

				// Create individual timeline for this voxel
				const voxelTimeline = gsap.timeline();

				// Return to original position with elastic effect
				voxelTimeline.to(currentPosition, {
					x: originalPosition.x,
					y: originalPosition.y,
					z: originalPosition.z,
					duration: returnDuration,
					delay: returnDelay,
					ease: "elastic.out(1, 0.7)", // Elastic effect for a bouncy return
					onUpdate: () => this.updateMatrix(i),
				});

				// Add this voxel's timeline to the master timeline
				masterTimeline.add(voxelTimeline, 0);
			}
		}

		// Reset scale for the hovered voxel
		if (index !== -1) {
			const scaleObj = { scale: 1.2 }; // Assuming this was the hover scale

			const scaleTween = gsap.timeline();
			scaleTween.to(scaleObj, {
				scale: 1.0,
				duration: 0.2,
				ease: "power2.out",
				onUpdate: () => {
					// Update the matrix for this voxel with the new scale
					if (this.instancedMesh) {
						this.dummy.position.copy(this.voxels[index].position);
						this.dummy.scale.set(
							scaleObj.scale,
							scaleObj.scale,
							scaleObj.scale
						);
						this.dummy.updateMatrix();
						this.instancedMesh.setMatrixAt(
							index,
							this.dummy.matrix
						);
						this.instancedMesh.instanceMatrix.needsUpdate = true;
					}
				},
			});

			// Add to master timeline
			masterTimeline.add(scaleTween, 0);
		}

		// Reset color
		if (this.instancedMesh) {
			this.instancedMesh.setColorAt(index, this.voxels[index].color);
			// Use flag instead of direct update
			this.instanceColorNeedsUpdate = true;
		}
	}

	/**
	 * Force reset all voxels to their original positions
	 * This is a failsafe to ensure voxels always return to their original state
	 */
	private forceResetAllVoxelPositions(): void {
		if (!this.instancedMesh) return;

		// console.log("Executing forceResetAllVoxelPositions");

		for (let i = 0; i < this.voxels.length; i++) {
			const trueOriginalPosition = this.voxelOriginalPositions.get(i);
			const voxelData = this.voxelsPerModel[this.activeModelIndex]?.[i];

			if (trueOriginalPosition && this.voxels[i]) {
				this.voxels[i].position.copy(trueOriginalPosition);
				// No animation, direct set for force reset
				// Scale is reset below, color is reset here if needed
				if (voxelData && this.voxels[i].color) {
					this.voxels[i].color.copy(voxelData.color);
				}
				this.updateMatrix(i); // Updates position and color based on this.voxels[i]
			} else {
				// console.warn(`No original position found for voxel ${i} during forceReset.`);
			}
		}

		// Reset scale for all voxels (assuming scale is always reset to 1)
		// and ensure color is from original model data via updateMatrix
		for (let i = 0; i < this.voxels.length; i++) {
			const trueOriginalPosition = this.voxelOriginalPositions.get(i);
			const voxelData = this.voxelsPerModel[this.activeModelIndex]?.[i];

			if (this.voxels[i]) {
				// Check if voxel exists
				if (trueOriginalPosition) {
					this.dummy.position.copy(trueOriginalPosition); // Use original position for dummy
				} else {
					// Fallback if no original position, use current (less ideal but prevents error)
					this.dummy.position.copy(this.voxels[i].position);
				}
				this.dummy.scale.set(1, 1, 1); // Reset to default scale
				// Color is set via instancedMesh.setColorAt if instanceColor is used and resetColors is true.
				this.dummy.updateMatrix();
				this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
				// Also ensure the instanced mesh color is updated if it's per-instance
				if (this.instancedMesh.instanceColor && voxelData) {
					this.instancedMesh.setColorAt(i, voxelData.color);
				}
			}
		}

		if (this.instancedMesh) {
			this.instancedMesh.instanceMatrix.needsUpdate = true;
			if (this.instancedMesh.instanceColor) {
				this.instancedMesh.instanceColor.needsUpdate = true;
			}
		}
		// DO NOT CLEAR: this.voxelOriginalPositions.clear();
		// console.log("Force reset all voxel positions and colors completed.");
	}

	/**
	 * Handle click effect for a voxel - affects a group of nearby voxels
	 * @param index The index of the voxel that was clicked
	 */
	private handleVoxelClick(index: number): void {
		if (
			!this.instancedMesh ||
			index < 0 ||
			index >= this.voxels.length ||
			!this.isInteractionEnabled
		) {
			// console.log("Click handling skipped: Pre-conditions not met or interaction disabled.");
			return;
		}

		// console.log(`Handling click for voxel: ${index}`);
		this.isInteractionEnabled = false; // Disable further interactions during this animation

		const clickedVoxelTrueOriginalPos =
			this.voxelOriginalPositions.get(index);
		if (!clickedVoxelTrueOriginalPos) {
			console.error(
				"Clicked voxel has no true original position stored. Aborting click effect."
			);
			this.isInteractionEnabled = true; // Re-enable before exiting
			return;
		}

		const groupRadius = 2.0; // Radius for affecting nearby voxels
		const affectedVoxelsIndices: number[] = [];

		// Store positions AT THE MOMENT OF CLICK for calculating explosion vectors
		// These are temporary and not the 'true' original positions.
		const positionsAtClickTime: Map<number, THREE.Vector3> = new Map();

		for (let i = 0; i < this.voxels.length; i++) {
			if (this.voxels[i] && this.voxels[i].position) {
				positionsAtClickTime.set(i, this.voxels[i].position.clone()); // Current position of voxel i

				const trueOriginalPosOfCurrentVoxel =
					this.voxelOriginalPositions.get(i);
				if (trueOriginalPosOfCurrentVoxel) {
					const distance = trueOriginalPosOfCurrentVoxel.distanceTo(
						clickedVoxelTrueOriginalPos
					);
					if (distance <= groupRadius) {
						affectedVoxelsIndices.push(i);
					}
				}
			}
		}

		// Kill any existing tweens that might conflict
		// This is a broad approach; more targeted killing could be used if performance becomes an issue.
		gsap.killTweensOf(this.voxels.map((v) => v.position));
		gsap.killTweensOf(this.voxels.map((v) => v.color));
		this.voxelHoverTweens.forEach((tween) => tween.kill());
		this.voxelHoverTweens.clear();

		const masterTimeline = gsap.timeline({
			onComplete: () => {
				// console.log("Click master timeline onComplete: Forcing reset and re-enabling interactions.");
				this.forceResetAllVoxelPositions(); // Ultimate failsafe to restore true original state
				this.isInteractionEnabled = true; // Re-enable interactions
			},
		});

		// STAGE 1: Explode outward and brighten
		for (const voxelIdx of affectedVoxelsIndices) {
			const voxel = this.voxels[voxelIdx];
			const posAtClick = positionsAtClickTime.get(voxelIdx);
			const trueOriginalModelColor =
				this.voxelsPerModel[this.activeModelIndex]?.[
					voxelIdx
				]?.color.clone() || new THREE.Color(0xffffff);

			if (!voxel || !posAtClick) continue; // Skip if voxel or its position at click time is missing

			let direction = new THREE.Vector3()
				.subVectors(posAtClick, clickedVoxelTrueOriginalPos)
				.normalize();
			if (voxelIdx === index || direction.lengthSq() < 0.001) {
				// Central voxel or coincident
				direction
					.set(
						Math.random() * 2 - 1,
						0.7 + Math.random() * 0.6,
						Math.random() * 2 - 1
					)
					.normalize(); // Bias upward, more pronounced
			}
			const explosionStrength = 1.2 + Math.random() * 0.8; // Slightly stronger, more varied explosion
			const targetExplodePos = new THREE.Vector3().addVectors(
				posAtClick,
				direction.multiplyScalar(explosionStrength)
			);

			masterTimeline.to(
				voxel.position,
				{
					x: targetExplodePos.x,
					y: targetExplodePos.y,
					z: targetExplodePos.z,
					duration: 0.45, // Slightly longer explosion phase
					ease: "circ.out", // Different ease for variety
					onUpdate: () => this.updateMatrix(voxelIdx),
				},
				"explode"
			);

			masterTimeline.to(
				voxel.color,
				{
					r: Math.min(1, trueOriginalModelColor.r * 1.3 + 0.2),
					g: Math.min(1, trueOriginalModelColor.g * 1.3 + 0.2),
					b: Math.min(1, trueOriginalModelColor.b * 1.3 + 0.2),
					duration: 0.25,
					ease: "power1.out",
					onUpdate: () => this.updateMatrix(voxelIdx), // Ensure color updates are reflected
				},
				"explode"
			);
		}

		// STAGE 2: Pause (achieved by label offset for return tweens)
		masterTimeline.addLabel("returnStart", ">+0.35"); // Slightly longer pause after explosion

		// STAGE 3: Return to TRUE original positions and colors
		for (const voxelIdx of affectedVoxelsIndices) {
			const voxel = this.voxels[voxelIdx];
			const trueOriginalPosition =
				this.voxelOriginalPositions.get(voxelIdx);
			const trueOriginalModelColor =
				this.voxelsPerModel[this.activeModelIndex]?.[
					voxelIdx
				]?.color.clone();

			if (!voxel || !trueOriginalPosition || !trueOriginalModelColor)
				continue; // Skip if essential data is missing

			masterTimeline.to(
				voxel.position,
				{
					x: trueOriginalPosition.x,
					y: trueOriginalPosition.y,
					z: trueOriginalPosition.z,
					duration: 0.7, // Longer, smoother return
					ease: "elastic.out(1, 0.55)", // Adjusted elastic effect
					onUpdate: () => this.updateMatrix(voxelIdx),
				},
				"returnStart"
			);

			masterTimeline.to(
				voxel.color,
				{
					r: trueOriginalModelColor.r,
					g: trueOriginalModelColor.g,
					b: trueOriginalModelColor.b,
					duration: 0.4, // Color return duration
					ease: "power2.inOut",
					onUpdate: () => this.updateMatrix(voxelIdx), // Ensure color updates are reflected
				},
				"returnStart"
			);
		}

		// If no voxels were affected (e.g., clicking far from model), ensure interaction is re-enabled promptly.
		if (affectedVoxelsIndices.length === 0) {
			// console.log("No voxels affected by click, re-enabling interactions immediately.");
			this.isInteractionEnabled = true;
		}
	}

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

		const shakeIntensity = 0.15; // Max displacement for a single shake component (e.g., 0.15 units)
		const numShakeCycles = 3; // Number of back-and-forth shake cycles
		const shakeCycleDuration = 0.06; // Duration of one full shake cycle (e.g., to target and back slightly)
		const returnToOriginDuration = 0.4; // Duration to return to original position
		const maxStartDelay = 0.1; // Max random start delay for each voxel, creates a wave effect

		for (let i = 0; i < this.instancedMesh.count; i++) {
			const voxelInfo = this.voxels[i];
			if (!voxelInfo) continue;

			const originalPosition = voxelInfo.position.clone();
			const startDelay = Math.random() * maxStartDelay;

			let currentVoxelAnimationDuration = startDelay;

			const tl = gsap.timeline({
				onUpdate: () => {
					this.updateMatrix(i);
				},
				delay: startDelay,
			});

			// Add shake cycles
			for (let j = 0; j < numShakeCycles; j++) {
				const shakeX = (Math.random() - 0.5) * 2 * shakeIntensity;
				const shakeY = (Math.random() - 0.5) * 2 * shakeIntensity;
				const shakeZ = (Math.random() - 0.5) * 2 * shakeIntensity;

				// Shake to a random offset
				tl.to(voxelInfo.position, {
					x: originalPosition.x + shakeX,
					y: originalPosition.y + shakeY,
					z: originalPosition.z + shakeZ,
					duration: shakeCycleDuration / 2,
					ease: "power1.inOut",
				});
				// Return partially towards original or another random offset to create a jitter
				tl.to(voxelInfo.position, {
					x:
						originalPosition.x +
						shakeX * 0.25 * (Math.random() - 0.5),
					y:
						originalPosition.y +
						shakeY * 0.25 * (Math.random() - 0.5),
					z:
						originalPosition.z +
						shakeZ * 0.25 * (Math.random() - 0.5),
					duration: shakeCycleDuration / 2,
					ease: "power1.inOut",
				});
				currentVoxelAnimationDuration += shakeCycleDuration;
			}

			// Final return to original position
			tl.to(voxelInfo.position, {
				x: originalPosition.x,
				y: originalPosition.y,
				z: originalPosition.z,
				duration: returnToOriginDuration,
				ease: "elastic.out(1, 0.65)", // Slightly less aggressive elastic return
			});
			currentVoxelAnimationDuration += returnToOriginDuration;

			if (
				currentVoxelAnimationDuration > maxIndividualAnimationDuration
			) {
				maxIndividualAnimationDuration = currentVoxelAnimationDuration;
			}
		}

		// Ensure instanceMatrix.needsUpdate is set throughout the animations
		if (maxIndividualAnimationDuration > 0 && this.instancedMesh) {
			this.matrixUpdateTween = gsap.to(
				{},
				{
					duration: maxIndividualAnimationDuration,
					onUpdate: () => {
						if (this.instancedMesh) {
							this.instancedMesh.instanceMatrix.needsUpdate =
								true;
						}
					},
					onComplete: () => {
						if (this.instancedMesh) {
							for (let k = 0; k < this.instancedMesh.count; k++) {
								if (this.voxels[k]) {
									this.updateMatrix(k); // Ensure final positions are set
								}
							}
							this.instancedMesh.instanceMatrix.needsUpdate =
								true;
						}
						this.matrixUpdateTween = null; // Clear the reference
					},
				}
			);
		}

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
			if (direction.lengthSq() === 0) {
				// If original position is at origin
				direction.set(
					Math.random() - 0.5,
					Math.random() - 0.5,
					Math.random() - 0.5
				);
			}
			direction.normalize();

			const explosionDistance = 3 + Math.random() * 4; // Explode out by 3 to 7 units
			const explodedPosition = originalPosition
				.clone()
				.add(direction.multiplyScalar(explosionDistance));

			const explodeDuration = 0.3 + Math.random() * 0.2;
			const returnDelay = 0.1;
			const returnDuration = 0.5 + Math.random() * 0.3;
			const startDelay = Math.random() * 0.15;

			const individualDuration =
				startDelay + explodeDuration + returnDelay + returnDuration;
			if (individualDuration > maxIndividualAnimationDuration) {
				maxIndividualAnimationDuration = individualDuration;
			}

			const tl = gsap.timeline({
				onUpdate: () => {
					this.updateMatrix(i);
				},
			});

			tl.to(voxelInfo.position, {
				x: explodedPosition.x,
				y: explodedPosition.y,
				z: explodedPosition.z,
				duration: explodeDuration,
				ease: "power2.out",
				delay: startDelay,
			}).to(voxelInfo.position, {
				// Return to original
				x: originalPosition.x,
				y: originalPosition.y,
				z: originalPosition.z,
				duration: returnDuration,
				ease: "elastic.out(1, 0.7)",
				delay: returnDelay,
			});
		}

		// Ensure instanceMatrix.needsUpdate is set throughout the animations
		if (maxIndividualAnimationDuration > 0 && this.instancedMesh) {
			this.matrixUpdateTween = gsap.to(
				{},
				{
					duration: maxIndividualAnimationDuration,
					onUpdate: () => {
						if (this.instancedMesh) {
							this.instancedMesh.instanceMatrix.needsUpdate =
								true;
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
							this.instancedMesh.instanceMatrix.needsUpdate =
								true;
						}
						this.matrixUpdateTween = null; // Clear the reference
					},
				}
			);
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
		if (notification) {
			// Check notification, not icon, for appending
			notification.appendChild(icon);
		}

		// Message
		const text = document.createElement("span");
		text.className = "text-sm font-medium text-indigo-100";
		text.textContent = message;
		if (notification) {
			// Check notification for appending
			notification.appendChild(text);
		}

		if (document.body) {
			// Check document.body for appending
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

	/**
	 * Update the model visualization based on audio data
	 * @param audioData Array of audio frequency data (0-255 values)
	 */
	public updateWithAudioData(audioData: number[]): void {
		// Store the audio data
		this.audioData = audioData;

		// Set flag to indicate audio visualization is active
		const wasActive = this.isAudioVisualizationActive;
		this.isAudioVisualizationActive = audioData.some((value) => value > 0);

		// If audio visualization just started, cancel any ongoing hover effects
		if (!wasActive && this.isAudioVisualizationActive) {
			// Cancel any existing hover animations
			this.voxelHoverTweens.forEach((tween) => {
				tween.kill();
			});
			this.voxelHoverTweens.clear();

			// Reset hovered voxel
			if (this.hoveredVoxelIndex !== -1) {
				this.handleVoxelUnhover(this.hoveredVoxelIndex);
				this.hoveredVoxelIndex = -1;
			}

			// Temporarily disable interaction while audio is active
			this.isInteractionEnabled = false;
		}
		// If audio visualization just ended, restore interaction
		else if (wasActive && !this.isAudioVisualizationActive) {
			// Reset all voxels to their original positions
			this.forceResetAllVoxelPositions();

			// Re-enable interaction
			this.isInteractionEnabled = true;
		}

		// Apply audio data to voxels if audio is active
		if (this.isAudioVisualizationActive) {
			this.applyAudioDataToVoxels();
		}
	}

	/**
	 * Apply audio data to voxels for visualization
	 */
	private applyAudioDataToVoxels(): void {
		if (
			!this.isAudioVisualizationActive ||
			!this.voxels.length ||
			!this.audioData.length
		)
			return;

		// Cancel existing animation frame if any
		if (this.audioAnimationId !== null) {
			cancelAnimationFrame(this.audioAnimationId);
			this.audioAnimationId = null;
		}

		// Group voxels by their y-position to create a frequency-like visualization
		const voxelsByHeight = new Map<number, number[]>();

		// Round y positions to group similar heights
		this.voxels.forEach((voxel, index) => {
			const roundedY = Math.round(voxel.position.y * 10) / 10;
			if (!voxelsByHeight.has(roundedY)) {
				voxelsByHeight.set(roundedY, []);
			}
			voxelsByHeight.get(roundedY)?.push(index);
		});

		// Sort heights from bottom to top
		const sortedHeights = Array.from(voxelsByHeight.keys()).sort(
			(a, b) => a - b
		);

		// Calculate audio frequency bands based on number of height groups
		const numBands = sortedHeights.length;
		const bandSize = Math.ceil(this.audioData.length / numBands);

		// Apply audio data to each height group
		sortedHeights.forEach((height, heightIndex) => {
			const voxelIndices = voxelsByHeight.get(height) || [];

			// Calculate average audio value for this band
			const bandStart = heightIndex * bandSize;
			const bandEnd = Math.min(
				bandStart + bandSize,
				this.audioData.length
			);
			let bandSum = 0;

			for (let i = bandStart; i < bandEnd; i++) {
				bandSum += this.audioData[i] || 0;
			}

			const avgValue = bandSum / (bandEnd - bandStart);
			const scaleFactor = avgValue / 255; // Normalize to 0-1

			// Apply visualization effect to voxels in this height group
			voxelIndices.forEach((voxelIndex) => {
				if (voxelIndex >= 0 && voxelIndex < this.voxels.length) {
					const voxel = this.voxels[voxelIndex];
					const originalPos =
						this.voxelOriginalPositions.get(voxelIndex);

					if (originalPos) {
						// Apply a pulse effect based on audio intensity
						const pulseAmount = scaleFactor * 0.3; // Scale factor to control pulse intensity

						// Create a slight outward movement from the center
						const direction = new THREE.Vector3()
							.copy(originalPos)
							.normalize();

						// New position = original + direction * pulse
						const newPosition = new THREE.Vector3()
							.copy(originalPos)
							.add(direction.multiplyScalar(pulseAmount));

						// Apply position
						voxel.position.copy(newPosition);
						this.updateMatrix(voxelIndex);

						// Optionally change color based on audio intensity
						const currentColor = voxel.color;
						const intensityFactor = Math.min(1, scaleFactor * 1.5);

						// Brighten the color based on audio intensity
						currentColor.r = Math.min(
							1,
							currentColor.r + intensityFactor * 0.3
						);
						currentColor.g = Math.min(
							1,
							currentColor.g + intensityFactor * 0.3
						);
						currentColor.b = Math.min(
							1,
							currentColor.b + intensityFactor * 0.3
						);

						if (this.instancedMesh) {
							this.instancedMesh.setColorAt(
								voxelIndex,
								currentColor
							);
							if (this.instancedMesh.instanceColor) {
								this.instancedMesh.instanceColor.needsUpdate =
									true;
							}
						}
					}
				}
			});
		});

		// Update instance matrices
		if (this.instancedMesh) {
			this.instancedMesh.instanceMatrix.needsUpdate = true;
		}
	}
}
