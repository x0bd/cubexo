import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import gsap from "gsap";
import type { Voxel, AppParameters } from "../types/types";
import { ModelExporter, ExportFormat } from "../utils/ModelExporter";
import GIF from "gif.js.optimized"; // Import gif.js

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
	private liveVoxels: Voxel[] = []; // NEW: Represents the current state of all voxels in instancedMesh
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
		this.recreateInstancedMesh(100); // Default to 100, will resize if larger model is loaded
	}

	private getCenteredVoxelData(voxels: Voxel[]): {
		centeredVoxels: Voxel[];
		centerOffset: THREE.Vector3;
	} {
		if (!voxels || voxels.length === 0) {
			return { centeredVoxels: [], centerOffset: new THREE.Vector3() };
		}

		const boundingBox = new THREE.Box3();
		voxels.forEach((voxel) => {
			boundingBox.expandByPoint(voxel.position);
		});

		const centerOffset = new THREE.Vector3();
		boundingBox.getCenter(centerOffset);

		const centeredVoxels = voxels.map((voxel) => ({
			...voxel,
			position: voxel.position.clone().sub(centerOffset),
			// Keep the color as a THREE.Color instance
			color:
				voxel.color instanceof THREE.Color
					? voxel.color.clone()
					: new THREE.Color(voxel.color),
		}));

		return { centeredVoxels, centerOffset };
	}

	// Update addVoxelsForModel to store both original and centered data
	public addVoxelsForModel(
		modelIdx: number,
		originalModelVoxels: Voxel[]
	): void {
		const { centeredVoxels, centerOffset } =
			this.getCenteredVoxelData(originalModelVoxels);

		// Store both original and processed data if needed, or just the centered one for display
		// For now, let's primarily use centered data for display consistency.
		this.voxelsPerModel[modelIdx] = centeredVoxels;
		// Optionally, store the offset if you need to transform back to original coordinates for export, etc.
		// this.voxelModelOffsets[modelIdx] = centerOffset;

		console.log(
			`Added model ${modelIdx}. Original voxel count: ${
				originalModelVoxels.length
			}, Centered voxel count: ${
				centeredVoxels.length
			}. Center offset: ${centerOffset.x.toFixed(
				2
			)}, ${centerOffset.y.toFixed(2)}, ${centerOffset.z.toFixed(2)}`
		);

		const maxVoxelCountAcrossAllModels = Math.max(
			this.instancedMesh?.count || 0,
			...this.voxelsPerModel.filter((m) => m).map((m) => m.length)
		);

		if (
			!this.instancedMesh ||
			maxVoxelCountAcrossAllModels > this.instancedMesh.count
		) {
			this.recreateInstancedMesh(maxVoxelCountAcrossAllModels);
		}
	}

	public setActiveModel(newModelIdx: number): void {
		if (
			newModelIdx < 0 ||
			newModelIdx >= this.voxelsPerModel.length ||
			!this.voxelsPerModel[newModelIdx]
		) {
			console.warn(
				"Invalid model index or model data not loaded yet for index:",
				newModelIdx
			);
			// Optionally, re-enable interaction if we bail early
			// this.isInteractionEnabled = true;
			return;
		}

		// Prevent interaction during model switch setup AND animation
		// this.isInteractionEnabled = false; // Moved to animateToModel start

		const oldModelIdx = this.activeModelIndex;

		// Call animateToModel. activeModelIndex and liveVoxels truncation (if target is smaller)
		// will be handled in the onComplete callback of the animation.
		this.animateToModel(oldModelIdx, newModelIdx);
	}

	public animateToModel(_oldModelIdx: number, newModelIdx: number): void {
		this.isInteractionEnabled = false;
		const startTime = performance.now();

		// Fetch the (already centered) model definition
		const targetModelDefinition = this.voxelsPerModel[newModelIdx];
		const modelNameForLogging = targetModelDefinition
			? `model (index ${newModelIdx})`
			: `UNKNOWN MODEL (index ${newModelIdx})`;
		console.log(
			`===== ANIMATE TO MODEL [${_oldModelIdx} → ${newModelIdx}] Name: ${modelNameForLogging} =====`
		);

		if (!targetModelDefinition) {
			console.error(
				`CRITICAL: Target model definition for index ${newModelIdx} is UNDEFINED (already centered). Cannot animate.`
			);
			this.isInteractionEnabled = true;
			if (this.instancedMesh) this.instancedMesh.count = 0;
			return;
		}

		const targetModelVoxelCount = targetModelDefinition.length; // This is the count of centered voxels

		if (targetModelVoxelCount === 0) {
			console.warn(
				`WARNING: Target model definition for index ${newModelIdx} (${modelNameForLogging}) is EMPTY (0 voxels). Model will appear empty.`
			);
		} else {
			if (
				newModelIdx === 1 ||
				(targetModelVoxelCount < 10 && targetModelVoxelCount > 0)
			) {
				console.log(
					`Sample CENTERED Voxel Data for ${modelNameForLogging} (first 5 of ${targetModelVoxelCount}):`
				);
				for (let k = 0; k < Math.min(5, targetModelVoxelCount); k++) {
					console.log(
						`  Voxel ${k}: P(x:${targetModelDefinition[
							k
						].position.x.toFixed(2)}, y:${targetModelDefinition[
							k
						].position.y.toFixed(2)}, z:${targetModelDefinition[
							k
						].position.z.toFixed(2)}), C(r:${targetModelDefinition[
							k
						].color.r.toFixed(2)}, g:${targetModelDefinition[
							k
						].color.g.toFixed(2)}, b:${targetModelDefinition[
							k
						].color.b.toFixed(2)})`
					);
				}
			}
		}

		const sourceLiveVoxelCount = this.liveVoxels.length;
		console.log(
			`Live voxels (instancedMesh capacity): ${sourceLiveVoxelCount}`
		);
		console.log(
			`Target model '${newModelIdx}' (${modelNameForLogging}) actual voxel count: ${targetModelVoxelCount}`
		);

		if (this.matrixUpdateTween) this.matrixUpdateTween.kill();
		this.voxelHoverTweens.forEach((tween) => tween.kill());
		this.voxelHoverTweens.clear();
		if (this.hoveredVoxelIndex !== -1) {
			this.handleVoxelUnhover(this.hoveredVoxelIndex);
			this.hoveredVoxelIndex = -1;
		}

		const sizeDifferenceRatio =
			Math.max(sourceLiveVoxelCount, targetModelVoxelCount) /
			Math.max(1, Math.min(sourceLiveVoxelCount, targetModelVoxelCount));
		const isPotentiallyProblematic =
			targetModelVoxelCount > 700 ||
			sourceLiveVoxelCount > 700 ||
			sizeDifferenceRatio > 1.5 ||
			targetModelVoxelCount === 0;

		console.log(
			"NOTICE: Using SIMPLIFIED transition logic for ALL models to debug chicken."
		);

		for (let i = 0; i < sourceLiveVoxelCount; i++) {
			if (!this.liveVoxels[i]) {
				console.warn(
					`animateToModel: liveVoxels[${i}] is undefined. Skipping.`
				);
				continue;
			}
			gsap.killTweensOf(this.liveVoxels[i].position);
			gsap.killTweensOf(this.liveVoxels[i].color);

			let targetPos: THREE.Vector3;
			let targetCol: THREE.Color;

			if (i < targetModelVoxelCount) {
				targetPos = targetModelDefinition[i].position; // Already centered
				targetCol = targetModelDefinition[i].color;
			} else {
				if (targetModelVoxelCount > 0) {
					const randomTargetIdx = Math.floor(
						Math.random() * targetModelVoxelCount
					);
					targetPos = targetModelDefinition[randomTargetIdx].position
						.clone()
						.add(
							new THREE.Vector3(
								Math.random() - 0.5,
								Math.random() - 0.5,
								Math.random() - 0.5
							).multiplyScalar(0.1)
						); // Already centered + jitter
					targetCol = targetModelDefinition[randomTargetIdx].color;
				} else {
					targetPos = new THREE.Vector3(
						(Math.random() - 0.5) * 50,
						(Math.random() - 0.5) * 50,
						(Math.random() - 0.5) * 50
					);
					targetCol = this.liveVoxels[i].color
						.clone()
						.lerp(new THREE.Color(0x333333), 0.5);
				}
			}

			if (!targetPos || !targetCol) {
				console.error(
					`Error in animateToModel: targetPos or targetCol is undefined for liveVoxel index ${i}. Skipping animation for this voxel.`
				);
				console.log(
					`Details: i=${i}, targetModelVoxelCount=${targetModelVoxelCount}`
				);
				if (i >= targetModelVoxelCount && targetModelVoxelCount === 0) {
					console.log(
						"Reason: Target model is empty, and this is an extra live voxel."
					);
				}
				continue;
			}

			gsap.to(this.liveVoxels[i].position, {
				delay: Math.random() * 0.15,
				duration: 0.45 + Math.random() * 0.25,
				x: targetPos.x,
				y: targetPos.y,
				z: targetPos.z,
				ease: "back.out(1.5)",
				onUpdate: () => this.updateMatrix(i),
			});

			gsap.to(this.liveVoxels[i].color, {
				delay: Math.random() * 0.15 + 0.1,
				duration: 0.25,
				r: targetCol.r,
				g: targetCol.g,
				b: targetCol.b,
				ease: "power1.in",
				onUpdate: () => {
					if (this.instancedMesh && this.liveVoxels[i]) {
						this.instancedMesh.setColorAt(
							i,
							this.liveVoxels[i].color
						);
						this.instanceColorNeedsUpdate = true;
					}
				},
			});
		}

		if (this.instancedMesh) {
			gsap.to(this.instancedMesh.rotation, {
				duration: 1.2,
				y:
					"=" +
					(isPotentiallyProblematic ? Math.PI * 0.75 : Math.PI * 1.1),
				ease: "power2.out",
			});

			gsap.to(this.instancedMesh, {
				duration: 0.6,
				count: targetModelVoxelCount,
				ease: "power1.inOut",
			});
		}

		this.matrixUpdateTween = gsap.to(
			{},
			{
				duration: 1.4,
				onUpdate: () => {
					if (this.instancedMesh) {
						this.instancedMesh.instanceMatrix.needsUpdate = true;
						if (this.instancedMesh.instanceColor)
							this.instancedMesh.instanceColor.needsUpdate = true;
					}
				},
				onComplete: () => {
					console.log("Master tween onComplete: Finalizing state.");
					this.activeModelIndex = newModelIdx;
					this.isInteractionEnabled = true;

					this.voxelOriginalPositions.clear();
					if (targetModelVoxelCount > 0) {
						for (let i = 0; i < targetModelVoxelCount; i++) {
							if (
								targetModelDefinition[i] &&
								targetModelDefinition[i].position
							) {
								// Storing the centered positions as the "original" for hover effects
								this.voxelOriginalPositions.set(
									i,
									targetModelDefinition[i].position.clone()
								);
							}
						}
					}

					if (this.instancedMesh)
						this.instancedMesh.count = targetModelVoxelCount;
					this.instanceMatrixNeedsUpdate = true;
					this.instanceColorNeedsUpdate = true;

					// Reset the main instancedMesh rotation to 0,0,0 after each model transition
					// The model itself is centered, so the mesh should not retain compound rotations.
					if (this.instancedMesh) {
						gsap.to(this.instancedMesh.rotation, {
							duration: 0.3, // Quick reset
							x: 0,
							y: 0,
							z: 0,
							ease: "power1.out",
						});
					}
					// Set OrbitControls target to origin, where the model is centered
					if (this.controls) {
						this.controls.target.set(0, 0, 0);
						this.controls.update();
					}

					const endTime = performance.now();
					console.log(
						`Transition to model ${newModelIdx} (${modelNameForLogging}) completed in ${(
							endTime - startTime
						).toFixed(2)}ms`
					);
					console.log(
						`===== TRANSITION COMPLETE [${_oldModelIdx} → ${newModelIdx}] =====`
					);
				},
			}
		);
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
		this.controls.dampingFactor = 0.07;
		this.controls.screenSpacePanning = false;
		this.controls.minDistance = 5;
		this.controls.maxDistance = 30;
		this.controls.maxPolarAngle = Math.PI / 1.8; // Prevent looking from below too much
		this.controls.minPolarAngle = Math.PI / 4; // Prevent looking from top down too much
		this.controls.autoRotate = true;
		this.controls.autoRotateSpeed = 0.4;
		this.controls.target.set(0, 0, 0); // Explicitly set target to origin

		// Stop auto-rotation on user interaction
		this.controls.addEventListener("start", () => {
			if (this.controls) this.controls.autoRotate = false;
		});
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
		console.log(`recreateInstancedMesh called with count: ${count}`);
		// Dispose of old mesh if it exists
		if (this.instancedMesh) {
			this.scene?.remove(this.instancedMesh);
			this.instancedMesh.dispose();
			this.instancedMesh = null;
		}
		if (this.voxelGeometry && this.voxelMaterial) {
			// Initialize this.liveVoxels array to the new count
			this.liveVoxels = [];
			const defaultColor = new THREE.Color(0x808080); // Grey for unassigned voxels

			for (let i = 0; i < count; i++) {
				// Initialize with a default state, e.g., random or centered
				// This state is temporary until a model is actively displayed or animated to.
				const randomOffset = () =>
					(Math.random() - 0.5) * this.params.modelSize * 0.1;
				const initialPosition = new THREE.Vector3(
					randomOffset(),
					this.params.modelSize * 0.5 + randomOffset(),
					randomOffset()
				);

				this.liveVoxels.push({
					position: initialPosition,
					// Ensure color is a new instance
					color: defaultColor
						.clone()
						.offsetHSL(
							Math.random() * 0.1 - 0.05,
							Math.random() * 0.1 - 0.05,
							Math.random() * 0.1 - 0.05
						),
				});
			}
			console.log(
				`Initialized liveVoxels with ${this.liveVoxels.length} instances.`
			);

			this.instancedMesh = new THREE.InstancedMesh(
				this.voxelGeometry,
				this.voxelMaterial,
				count
			);
			this.instancedMesh.castShadow = true;
			this.instancedMesh.receiveShadow = true;

			// Populate instancedMesh from the newly created liveVoxels
			for (let i = 0; i < count; i++) {
				if (this.liveVoxels[i]) {
					this.dummy.position.copy(this.liveVoxels[i].position);
					this.dummy.updateMatrix();
					this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
					this.instancedMesh.setColorAt(i, this.liveVoxels[i].color);
				} else {
					// Should not happen if liveVoxels is initialized correctly
					console.warn(
						`liveVoxels[${i}] is undefined during recreateInstancedMesh`
					);
				}
			}

			if (this.instancedMesh.instanceMatrix)
				this.instancedMesh.instanceMatrix.needsUpdate = true;
			if (this.instancedMesh.instanceColor)
				this.instancedMesh.instanceColor.needsUpdate = true;

			this.scene?.add(this.instancedMesh);
			console.log(
				`Added new instancedMesh to scene with count: ${this.instancedMesh.count}`
			);

			// After recreating, if there's an active model, immediately snap to its state
			// This ensures that if recreate was called due to a new larger model being added
			// (but not yet displayed), the currently displayed model still looks correct.
			// However, the very first model display is handled by animateToModel after load.
			if (
				this.voxelsPerModel[this.activeModelIndex] &&
				this.voxelsPerModel[this.activeModelIndex].length > 0
			) {
				const activeModelData =
					this.voxelsPerModel[this.activeModelIndex];
				const activeModelCount = activeModelData.length;

				for (let i = 0; i < this.liveVoxels.length; i++) {
					if (i < activeModelCount) {
						this.liveVoxels[i].position.copy(
							activeModelData[i].position
						);
						this.liveVoxels[i].color.copy(activeModelData[i].color);
					} else {
						// For "extra" liveVoxels beyond the current active model's count,
						// move them off-screen or to a neutral state if not already random.
						// For now, their random init state is fine.
					}
					this.updateMatrix(i);
					this.instancedMesh.setColorAt(i, this.liveVoxels[i].color);
				}
				this.instancedMesh.count = activeModelCount;
				this.instanceMatrixNeedsUpdate = true;
				this.instanceColorNeedsUpdate = true;
				console.log(
					`Snapped instancedMesh to active model #${this.activeModelIndex} state after recreation.`
				);
			}
		} else {
			console.error(
				"Voxel geometry or material not initialized before creating instanced mesh."
			);
		}
	}

	private updateMatrix(index: number): void {
		if (
			this.instancedMesh &&
			index >= 0 &&
			index < this.liveVoxels.length &&
			this.liveVoxels[index]
		) {
			// Check liveVoxels[index]
			this.dummy.position.copy(this.liveVoxels[index].position);
			this.dummy.updateMatrix();
			this.instancedMesh.setMatrixAt(index, this.dummy.matrix);
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

		// Track mouse state for drag detection
		let isDragging = false;
		let mouseDownX = 0;
		let mouseDownY = 0;
		const dragThreshold = 3; // Pixels of movement before considered dragging

		// Mouse down event to detect start of potential drag
		this.canvasElement.addEventListener("mousedown", (event) => {
			if (!this.isInteractionEnabled) return;

			// Store initial position
			mouseDownX = event.clientX;
			mouseDownY = event.clientY;
			isDragging = false;
		});

		// Mouse move for hover effects and drag detection
		this.canvasElement.addEventListener("mousemove", (event) => {
			if (!this.canvasElement) return;

			// Calculate mouse position in normalized device coordinates (-1 to +1)
			const rect = this.canvasElement.getBoundingClientRect();
			this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
			this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

			// Detect if dragging based on movement distance
			if (
				!isDragging &&
				(Math.abs(event.clientX - mouseDownX) > dragThreshold ||
					Math.abs(event.clientY - mouseDownY) > dragThreshold)
			) {
				isDragging = true;
			}
		});

		// Mouse up event to detect clicks vs. drags
		this.canvasElement.addEventListener("mouseup", (event) => {
			if (!this.isInteractionEnabled) return;

			// Only trigger click if not dragging and a voxel is hovered
			if (!isDragging && this.hoveredVoxelIndex !== -1) {
				this.handleVoxelClick(this.hoveredVoxelIndex);
			}

			// Reset drag state
			isDragging = false;
		});

		// Add pointer classes to canvas
		this.canvasElement.classList.add("cursor-grab");
		this.canvasElement.addEventListener("mousedown", () => {
			if (this.canvasElement)
				this.canvasElement.classList.replace(
					"cursor-grab",
					"cursor-grabbing"
				);
		});
		this.canvasElement.addEventListener("mouseup", () => {
			if (this.canvasElement)
				this.canvasElement.classList.replace(
					"cursor-grabbing",
					"cursor-grab"
				);
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
		if (!this.instancedMesh || index < 0 || index >= this.liveVoxels.length)
			return;

		// Get the position of the hovered voxel
		const hoveredPosition = this.liveVoxels[index].position.clone();

		// Kill any existing hover tweens for all voxels
		this.voxelHoverTweens.forEach((tween) => tween.kill());
		this.voxelHoverTweens.clear();

		// Store original positions for all voxels if not already stored
		if (this.voxelOriginalPositions.size === 0) {
			for (let i = 0; i < this.liveVoxels.length; i++) {
				this.voxelOriginalPositions.set(
					i,
					this.liveVoxels[i].position.clone()
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
					this.dummy.position.copy(this.liveVoxels[index].position);
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
		for (let i = 0; i < this.liveVoxels.length; i++) {
			// Skip the hovered voxel itself
			if (i === index) continue;

			const voxelPos = this.liveVoxels[i].position;
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
				nearbyTween.to(this.liveVoxels[i].position, {
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
			this.instancedMesh.setColorAt(index, this.liveVoxels[index].color);
			// Use flag instead of direct update
			this.instanceColorNeedsUpdate = true;
		}
	}

	/**
	 * Handle unhover effect for a voxel - smoothly returns all dispersed voxels
	 * @param index The index of the voxel to unhover
	 */
	private handleVoxelUnhover(index: number): void {
		if (!this.instancedMesh || index < 0 || index >= this.liveVoxels.length)
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
		for (let i = 0; i < this.liveVoxels.length; i++) {
			// Get the original position from our map, or use current position if not found
			const originalPosition = this.voxelOriginalPositions.get(i);

			// Skip if we don't have an original position stored
			if (!originalPosition) continue;

			const currentPosition = this.liveVoxels[i].position;

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
						this.dummy.position.copy(
							this.liveVoxels[index].position
						);
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
			this.instancedMesh.setColorAt(index, this.liveVoxels[index].color);
			// Use flag instead of direct update
			this.instanceColorNeedsUpdate = true;
		}
	}

	/**
	 * Force reset all voxels to their original positions
	 * This is a failsafe to ensure voxels always return to their original state
	 */
	private forceResetAllVoxelPositions(): void {
		if (!this.instancedMesh || !this.voxelsPerModel[this.activeModelIndex])
			return;

		const targetModelData = this.voxelsPerModel[this.activeModelIndex];
		const targetCount = targetModelData.length;

		for (let i = 0; i < this.liveVoxels.length; i++) {
			if (i < targetCount) {
				this.liveVoxels[i].position.copy(targetModelData[i].position);
				this.liveVoxels[i].color.copy(targetModelData[i].color); // Also reset color
			} else {
				// For voxels beyond the target model's count, perhaps move them far away
				this.liveVoxels[i].position.set(1000, 1000, 1000); // Effectively hide
			}
			this.updateMatrix(i);
			if (this.instancedMesh) {
				// Guard instancedMesh
				this.instancedMesh.setColorAt(i, this.liveVoxels[i].color);
			}
		}
		if (this.instancedMesh) {
			// Guard instancedMesh
			this.instancedMesh.count = targetCount;
			this.instanceMatrixNeedsUpdate = true;
			this.instanceColorNeedsUpdate = true;
		}
		// Update original positions map for hover effects
		this.voxelOriginalPositions.clear();
		for (let i = 0; i < targetCount; i++) {
			this.voxelOriginalPositions.set(
				i,
				targetModelData[i].position.clone()
			);
		}
	}

	/**
	 * Handle click effect for a voxel - affects a group of nearby voxels
	 * @param index The index of the voxel that was clicked
	 */
	private handleVoxelClick(index: number): void {
		if (
			!this.instancedMesh ||
			index < 0 ||
			index >= this.liveVoxels.length ||
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

		for (let i = 0; i < this.liveVoxels.length; i++) {
			if (this.liveVoxels[i] && this.liveVoxels[i].position) {
				positionsAtClickTime.set(
					i,
					this.liveVoxels[i].position.clone()
				); // Current position of voxel i

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
		gsap.killTweensOf(this.liveVoxels.map((v) => v.position));
		gsap.killTweensOf(this.liveVoxels.map((v) => v.color));
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
			const voxel = this.liveVoxels[voxelIdx];
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
			const voxel = this.liveVoxels[voxelIdx];
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
		if (
			!this.instancedMesh ||
			this.instancedMesh.count === 0 ||
			!this.scene
		) {
			console.warn("No model to export or scene not ready.");
			this.showExportNotification(
				"Error: No model available to export.",
				"error"
			);
			return;
		}

		// Use liveVoxels which represent the current state of the model in the scene
		const currentVoxels = this.liveVoxels.slice(
			0,
			this.instancedMesh.count
		);

		if (currentVoxels.length === 0) {
			console.warn("No voxels in the current model to export.");
			this.showExportNotification(
				"Error: Current model is empty.",
				"error"
			);
			return;
		}

		let modelName = "exported_model";
		const activeModelContainer = this.voxelsPerModel[this.activeModelIndex];
		if (activeModelContainer && (activeModelContainer as any).name) {
			modelName = (activeModelContainer as any).name;
		} else if (
			this.instancedMesh &&
			this.instancedMesh.name &&
			this.instancedMesh.name !== "InstancedVoxelMesh"
		) {
			modelName = this.instancedMesh.name;
		}
		const sanitizedFilename = `${modelName
			.replace(/[^a-z0-9]/gi, "_")
			.toLowerCase()}`;

		// Convert the currently visible part of the instanced mesh to a regular group for export
		const exportGroup = ModelExporter.convertInstancedMeshToRegular(
			this.instancedMesh,
			currentVoxels // Pass only the active voxels
		);

		if (!exportGroup || exportGroup.children.length === 0) {
			console.error(
				"Failed to convert instanced mesh to a group for export or group is empty."
			);
			this.showExportNotification(
				"Error: Could not prepare model for export.",
				"error"
			);
			return;
		}

		ModelExporter.exportModel(exportGroup, format, sanitizedFilename);

		this.showExportNotification(
			`Model exported as ${format.toUpperCase()}`,
			"success"
		);
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
			if (this.liveVoxels[i]) {
				gsap.killTweensOf(this.liveVoxels[i].position);
			}
		}

		let maxIndividualAnimationDuration = 0;

		const shakeIntensity = 0.15; // Max displacement for a single shake component (e.g., 0.15 units)
		const numShakeCycles = 3; // Number of back-and-forth shake cycles
		const shakeCycleDuration = 0.06; // Duration of one full shake cycle (e.g., to target and back slightly)
		const returnToOriginDuration = 0.4; // Duration to return to original position
		const maxStartDelay = 0.1; // Max random start delay for each voxel, creates a wave effect

		for (let i = 0; i < this.instancedMesh.count; i++) {
			const voxelInfo = this.liveVoxels[i];
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
								if (this.liveVoxels[k]) {
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
			if (this.liveVoxels[i]) {
				gsap.killTweensOf(this.liveVoxels[i].position);
			}
		}

		let maxIndividualAnimationDuration = 0;

		for (let i = 0; i < this.instancedMesh.count; i++) {
			const voxelInfo = this.liveVoxels[i];
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
								if (this.liveVoxels[k]) {
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
		// Dispatch a custom event that App.ts can listen to
		const event = new CustomEvent("show-notification", {
			detail: { message, type: "success" },
		});
		window.dispatchEvent(event);
	}

	// Helper to dispatch export-related notifications (can be success or error)
	private showExportNotification(
		message: string,
		type: "success" | "error" = "success"
	): void {
		const event = new CustomEvent("show-notification", {
			detail: { message, type },
		});
		window.dispatchEvent(event);
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
			!this.liveVoxels.length ||
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
		this.liveVoxels.forEach((voxel, index) => {
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
				if (voxelIndex >= 0 && voxelIndex < this.liveVoxels.length) {
					const voxel = this.liveVoxels[voxelIndex];
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

	public async exportTurntableGifFrames(
		numFrames: number = 60,
		delayPerFrame: number = 100 // ms, delay for each GIF frame
	): Promise<void> {
		// Changed to Promise<void> as it will trigger download directly
		if (
			!this.renderer ||
			!this.scene ||
			!this.camera ||
			!this.instancedMesh ||
			this.instancedMesh.count === 0
		) {
			console.error(
				"Cannot export GIF: Renderer, scene, camera, or active model not available."
			);
			this.showExportNotification(
				"Error: No model to export for GIF",
				"error"
			);
			return;
		}

		this.showExportNotification("Preparing GIF frames...", "success");

		const originalWidth =
			this.canvasElement?.clientWidth || window.innerWidth;
		const originalHeight =
			this.canvasElement?.clientHeight || window.innerHeight;
		const originalAspect = this.camera.aspect;
		const exportWidth = 1600;
		const exportHeight = 1600;

		const originalSceneRotationY = this.scene.rotation.y;

		this.renderer.setSize(exportWidth, exportHeight, false);
		this.camera.aspect = exportWidth / exportHeight;
		this.camera.updateProjectionMatrix();

		const capturedFramesDataUrls: string[] = [];
		const rotationStep = (Math.PI * 2) / numFrames;

		if (this.controls) {
			this.controls.update();
		}

		for (let i = 0; i < numFrames; i++) {
			this.scene.rotation.y = originalSceneRotationY + i * rotationStep;
			this.renderer.render(this.scene, this.camera);
			capturedFramesDataUrls.push(
				this.renderer.domElement.toDataURL("image/png")
			);
			console.log(`Captured frame ${i + 1}/${numFrames} for GIF`);
			if (i % 10 === 0) {
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		}

		// Restore original settings BEFORE starting GIF encoding
		this.scene.rotation.y = originalSceneRotationY;
		this.renderer.setSize(originalWidth, originalHeight, true);
		this.camera.aspect = originalAspect;
		this.camera.updateProjectionMatrix();
		if (this.controls) {
			this.controls.update();
		}

		console.log("GIF frames captured, starting encoding...");
		this.showExportNotification("Encoding GIF... please wait.", "success");

		const gif = new GIF({
			workers: 2, // Number of web workers to use
			quality: 10, // Lower numbers = better quality
			width: exportWidth,
			height: exportHeight,
			// IMPORTANT: Ensure 'gif.worker.js' is available at this path in your built/served application.
			// You might need to copy it from 'node_modules/gif.js.optimized/dist/' to your public assets folder.
			workerScript: "gif.worker.js",
		});

		// Sequentially load images and add frames to ensure order and complete loading
		for (const frameDataUrl of capturedFramesDataUrls) {
			await new Promise<void>((resolve) => {
				const img = new Image();
				img.onload = () => {
					gif.addFrame(img, { delay: delayPerFrame });
					console.log("Frame added to GIF encoder");
					resolve();
				};
				img.onerror = () => {
					console.error("Error loading frame image for GIF encoding");
					resolve(); // Resolve anyway to not block the process, though GIF might be incomplete
				};
				img.src = frameDataUrl;
			});
		}

		gif.on("finished", (blob: Blob) => {
			// Added Blob type
			console.log("GIF encoding finished. Blob size:", blob.size);
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			// Generate a filename with the active model name if possible
			let filename = "turntable_export.gif";
			const activeModelData = this.voxelsPerModel[this.activeModelIndex];
			// This assumes that your Voxel data structure or related metadata might have a name.
			// If voxelsPerModel[activeModelIndex] is just an array of Voxel objects,
			// you might need to fetch the name from where models are defined (e.g., ModelLoader or App state)
			// For now, we'll use a generic name or try to find a name if it's part of the data.
			if (activeModelData && (activeModelData as any).name) {
				// Check if name property exists
				filename = `${(activeModelData as any).name
					.replace(/[^a-z0-9]/gi, "_")
					.toLowerCase()}_turntable.gif`;
			}
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			this.showExportNotification("GIF downloaded!", "success");
		});

		gif.on("progress", (p: number) => {
			console.log(`GIF encoding progress: ${Math.round(p * 100)}%`);
			// Assuming showExportNotification takes (message, type, persistentNotification)
			// If it only takes (message, type), the third argument should be removed.
			// For now, let's assume it's (message, type) as per previous definition if the third arg was an addition.
			// Re-checking the definition. The method showExportNotification was used before with 2 args.
			// Let's adjust this call to use the two-argument version if that was the original intent.
			// this.showExportNotification(`Encoding GIF: ${Math.round(p * 100)}%`, "success", false); // Potential issue here
			// Correcting based on typical notification pattern (message, type)
			this.showExportNotification(
				`Encoding GIF: ${Math.round(p * 100)}%`,
				"success"
			);
		});

		console.log("Rendering GIF...");
		gif.render();

		// The method is now Promise<void> and doesn't return frames
	}
}
