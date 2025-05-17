import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import gsap from "gsap";
import type { Voxel, AppParameters } from "../types/types";

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

			const duration = 0.5 + 0.5 * Math.pow(Math.random(), 6);
			let targetPos: THREE.Vector3;

			// Move to new position if we have one;
			// otherwise, move to a randomly selected existing position
			//
			// Animate to new color if it's determined
			// otherwise, voxel will be just hidden by animation of instancedMesh.count

			if (this.voxelsPerModel[newModelIdx]?.[i]) {
				targetPos = this.voxelsPerModel[newModelIdx][i].position;
				gsap.to(this.voxels[i].color, {
					delay: 0.7 * Math.random() * duration,
					duration: 0.05,
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

			// Move to new position
			gsap.to(this.voxels[i].position, {
				delay: 0.2 * Math.random(),
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
				duration: 1.2,
				y: "+=" + 1.3 * Math.PI,
				ease: "power2.out",
			});
		}

		// Show the right number of voxels
		if (this.instancedMesh && this.voxelsPerModel[newModelIdx]) {
			gsap.to(this.instancedMesh, {
				duration: 0.4,
				count: this.voxelsPerModel[newModelIdx].length,
			});
		}

		// Update the instanced mesh accordingly to voxels data
		gsap.to(
			{},
			{
				duration: 1, // max transition duration
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

		// Disable tone mapping for accurate color reproduction
		this.renderer.toneMapping = THREE.NoToneMapping;
	}

	private setupScene(): void {
		this.scene = new THREE.Scene();
		// White background for better color accuracy perception
		this.scene.background = new THREE.Color(0xffffff);
	}

	private setupCamera(): void {
		this.camera = new THREE.PerspectiveCamera(
			45,
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
		this.controls.enablePan = false;
		this.controls.minDistance = 10;
		this.controls.maxDistance = 30;
		this.controls.minPolarAngle = 0.35 * Math.PI;
		this.controls.maxPolarAngle = 0.65 * Math.PI;
		this.controls.autoRotate = true;
		this.controls.autoRotateSpeed = 1;
	}

	private setupLights(): void {
		if (!this.scene) return;

		// Bright ambient light for even illumination - important for accurate colors
		const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
		this.scene.add(ambientLight);

		// Create a group to hold the lights
		this.lightHolder = new THREE.Group();

		// Main directional light - brighter than spot for better visibility
		const topLight = new THREE.DirectionalLight(0xffffff, 1.0);
		topLight.position.set(0, 15, 5);
		topLight.castShadow = true;
		topLight.shadow.camera.near = 10;
		topLight.shadow.camera.far = 30;
		topLight.shadow.mapSize = new THREE.Vector2(1024, 1024);
		topLight.shadow.bias = -0.0001;
		this.lightHolder.add(topLight);

		// Side and fill lights for balanced illumination
		const sideLight = new THREE.DirectionalLight(0xffffff, 0.8);
		sideLight.position.set(10, 5, 5);
		this.lightHolder.add(sideLight);

		const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
		backLight.position.set(-5, 3, -10);
		this.lightHolder.add(backLight);

		// Add light holder to scene
		this.scene.add(this.lightHolder);

		// Light ground shadow
		const planeGeometry = new THREE.PlaneGeometry(35, 35);
		const shadowPlaneMaterial = new THREE.ShadowMaterial({
			opacity: 0.08, // Very light shadow to not detract from colors
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
		// Create voxel geometry
		this.voxelGeometry = new RoundedBoxGeometry(
			this.params.boxSize,
			this.params.boxSize,
			this.params.boxSize,
			2,
			this.params.boxRoundness
		);

		// Use MeshStandardMaterial for physically accurate color representation
		this.voxelMaterial = new THREE.MeshStandardMaterial({
			roughness: 0.2, // Lower roughness for more vibrant color
			metalness: 0.0, // Non-metallic for accurate diffuse colors
			flatShading: false, // Smooth shading
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
}
