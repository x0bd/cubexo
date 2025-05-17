import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { createNoise2D } from "simplex-noise";
import { gsap } from "gsap";
import { VoxelEarth } from "../components/VoxelEarth";
import { AudioManager } from "./AudioManager";

export interface SceneParams {
	noiseProgRate: number;
	noiseZoom: number;
	threshold: number;
	cloudClumpage: number;
	steepness: number;
}

export class Scene {
	private scene: THREE.Scene;
	private camera: THREE.PerspectiveCamera;
	private renderer: THREE.WebGLRenderer;
	private controls: OrbitControls;
	private canvas: HTMLCanvasElement;
	private voxelEarth: VoxelEarth | null = null;
	private audioManager: AudioManager | null = null;
	private params: SceneParams;
	private resizeCallback: () => void;
	private noise2D: ReturnType<typeof createNoise2D>;
	private time: number = 0;
	private controlsContainer: HTMLDivElement | null = null;

	constructor() {
		// Get canvas
		this.canvas = document.getElementById("webgl") as HTMLCanvasElement;
		if (!this.canvas) {
			throw new Error("Cannot find canvas element with ID 'webgl'");
		}

		// Create scene
		this.scene = new THREE.Scene();

		// Create camera
		this.camera = new THREE.PerspectiveCamera(
			75,
			window.innerWidth / window.innerHeight,
			0.1,
			1000
		);
		this.camera.position.set(25, 25, 25);
		this.camera.lookAt(new THREE.Vector3(0, 0, 0));

		// Create renderer
		this.renderer = new THREE.WebGLRenderer({
			canvas: this.canvas,
			antialias: true,
			alpha: true,
		});
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.setClearColor(0x000000);
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

		// Create controls
		this.controls = new OrbitControls(
			this.camera,
			this.renderer.domElement
		);
		this.controls.enableDamping = true;
		this.controls.dampingFactor = 0.1;
		this.controls.rotateSpeed = 0.5;

		// Initialize noise
		this.noise2D = createNoise2D();

		// Initialize GUI parameters
		this.params = {
			noiseProgRate: 0.01,
			noiseZoom: 6,
			threshold: 0.66,
			cloudClumpage: 1.2,
			steepness: 2,
		};

		// Setup UI controls
		this.setupControls();

		// Setup resize handler
		this.resizeCallback = this.onResize.bind(this);
		window.addEventListener("resize", this.resizeCallback);

		// Setup lights
		this.setupLights();
	}

	private setupControls(): void {
		// Create controls container
		this.controlsContainer = document.createElement("div");
		this.controlsContainer.className = "control-panel";

		// Add title
		const title = document.createElement("h2");
		title.textContent = "Voxel Controls";
		this.controlsContainer.appendChild(title);

		// Create slider controls
		this.createSlider(
			"Animation Speed",
			"noiseProgRate",
			0.001,
			0.05,
			0.001,
			this.params.noiseProgRate
		);
		this.createSlider(
			"Noise Zoom",
			"noiseZoom",
			0.1,
			20,
			0.1,
			this.params.noiseZoom
		);
		this.createSlider(
			"Visibility Threshold",
			"threshold",
			0,
			1,
			0.01,
			this.params.threshold
		);
		this.createSlider(
			"Cloud Density",
			"cloudClumpage",
			0,
			2,
			0.01,
			this.params.cloudClumpage
		);
		this.createSlider(
			"Transition Steepness",
			"steepness",
			0.5,
			10,
			0.1,
			this.params.steepness
		);

		// Add to UI container
		const uiContainer = document.querySelector("#ui-container");
		if (uiContainer) {
			uiContainer.appendChild(this.controlsContainer);
		}
	}

	private createSlider(
		name: string,
		property: keyof SceneParams,
		min: number,
		max: number,
		step: number,
		value: number
	): void {
		if (!this.controlsContainer) return;

		// Create control container
		const controlGroup = document.createElement("div");
		controlGroup.className = "control-group";

		// Create label
		const label = document.createElement("label");
		label.textContent = name;

		// Create value display
		const valueDisplay = document.createElement("span");
		valueDisplay.className = "value-display";
		valueDisplay.textContent = value.toString();

		// Create slider
		const slider = document.createElement("input");
		slider.type = "range";
		slider.min = min.toString();
		slider.max = max.toString();
		slider.step = step.toString();
		slider.value = value.toString();

		// Add event listener
		slider.addEventListener("input", () => {
			const newValue = parseFloat(slider.value);
			this.params[property] = newValue;
			valueDisplay.textContent = newValue.toString();
		});

		// Append to control group
		label.appendChild(valueDisplay);
		controlGroup.appendChild(label);
		controlGroup.appendChild(slider);

		// Append to controls container
		this.controlsContainer.appendChild(controlGroup);

		// Add styles
		const style = document.createElement("style");
		style.textContent = `
			.control-group {
				margin-bottom: 1rem;
			}
			.control-group label {
				display: flex;
				justify-content: space-between;
				margin-bottom: 0.5rem;
				font-size: 0.875rem;
			}
			.value-display {
				color: var(--color-text-secondary);
			}
			.control-group input[type="range"] {
				width: 100%;
				background: var(--color-accent);
				-webkit-appearance: none;
				height: 2px;
				border-radius: 1px;
				margin: 0.5rem 0;
			}
			.control-group input[type="range"]::-webkit-slider-thumb {
				-webkit-appearance: none;
				width: 12px;
				height: 12px;
				background: var(--color-foreground);
				border-radius: 50%;
				cursor: pointer;
			}
		`;
		document.head.appendChild(style);
	}

	private setupLights(): void {
		// Add ambient light
		const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
		this.scene.add(ambientLight);

		// Add directional light
		const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
		directionalLight.position.set(10, 10, 10);
		this.scene.add(directionalLight);

		// Add point light
		const pointLight = new THREE.PointLight(0xffffff, 1);
		pointLight.position.set(-10, -10, -10);
		this.scene.add(pointLight);
	}

	public async init(): Promise<void> {
		try {
			// Initialize voxel earth
			this.voxelEarth = new VoxelEarth(50, 125);
			await this.voxelEarth.init();
			this.scene.add(this.voxelEarth.getMesh());

			// Initialize audio manager
			this.audioManager = new AudioManager(this.camera);
			await this.audioManager.init();

			// Start animation
			this.animate();
		} catch (error) {
			console.error("Failed to initialize scene:", error);
		}
	}

	private onResize(): void {
		// Update camera
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();

		// Update renderer
		this.renderer.setSize(window.innerWidth, window.innerHeight);
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	}

	private animate = (): void => {
		requestAnimationFrame(this.animate);

		// Update time
		this.time += this.params.noiseProgRate;

		// Update voxel earth
		if (this.voxelEarth) {
			this.voxelEarth.update(
				this.time,
				this.params.noiseZoom,
				this.params.threshold,
				this.params.cloudClumpage,
				this.params.steepness
			);
		}

		// Update controls
		this.controls.update();

		// Render scene
		this.renderer.render(this.scene, this.camera);
	};

	public dispose(): void {
		// Remove event listeners
		window.removeEventListener("resize", this.resizeCallback);

		// Remove control panel
		if (this.controlsContainer && this.controlsContainer.parentNode) {
			this.controlsContainer.parentNode.removeChild(
				this.controlsContainer
			);
		}

		// Dispose audio manager
		if (this.audioManager) this.audioManager.dispose();

		// Dispose voxel earth
		if (this.voxelEarth) this.voxelEarth.dispose();

		// Dispose controls
		this.controls.dispose();

		// Dispose renderer
		this.renderer.dispose();
	}
}
