declare module "three" {
	export * from "three/src/Three";
	export class Scene {
		add(object: any): void;
	}
	export class PerspectiveCamera {
		constructor(fov: number, aspect: number, near: number, far: number);
		position: { set: (x: number, y: number, z: number) => void };
		lookAt(vector: Vector3): void;
		aspect: number;
		updateProjectionMatrix(): void;
		add(object: any): void;
	}
	export class WebGLRenderer {
		constructor(options?: {
			canvas?: HTMLCanvasElement;
			antialias?: boolean;
			alpha?: boolean;
		});
		setSize(width: number, height: number): void;
		setClearColor(color: number | string, alpha?: number): void;
		setPixelRatio(ratio: number): void;
		render(scene: Scene, camera: PerspectiveCamera): void;
		dispose(): void;
		readonly domElement: HTMLCanvasElement;
	}
	export class Vector3 {
		constructor(x?: number, y?: number, z?: number);
		set(x: number, y: number, z: number): this;
		clone(): Vector3;
	}
	export class AmbientLight {
		constructor(color?: number | string, intensity?: number);
	}
	export class DirectionalLight {
		constructor(color?: number | string, intensity?: number);
		position: { set: (x: number, y: number, z: number) => void };
	}
	export class PointLight {
		constructor(color?: number | string, intensity?: number);
		position: { set: (x: number, y: number, z: number) => void };
	}
	export class Audio {
		constructor(listener: AudioListener);
		setBuffer(buffer: AudioBuffer): void;
		setLoop(value: boolean): void;
		setVolume(volume: number): void;
		play(): void;
		stop(): void;
		getVolume(): number;
	}
	export class AudioListener {}
	export class AudioLoader {
		load(
			url: string,
			onLoad: (buffer: AudioBuffer) => void,
			onProgress?: (xhr: any) => void,
			onError?: (error: any) => void
		): void;
	}
	export interface AudioBuffer {}
	export class Color {
		constructor(color: number | string);
		copy(color: Color): this;
		lerp(color: Color, alpha: number): this;
	}
	export class Object3D {
		position: { set: (x: number, y: number, z: number) => void };
		scale: { set: (x: number, y: number, z: number) => void };
		rotation: { x: number; y: number; z: number };
		updateMatrix(): void;
		matrix: any;
	}
	export class BoxGeometry {
		constructor(width: number, height: number, depth: number);
		dispose(): void;
	}
	export class MeshStandardMaterial {
		constructor(parameters?: any);
		dispose(): void;
	}
	export class InstancedMesh {
		constructor(
			geometry: BoxGeometry,
			material: MeshStandardMaterial | MeshStandardMaterial[],
			count: number
		);
		setMatrixAt(index: number, matrix: any): void;
		setColorAt(index: number, color: Color): void;
		instanceMatrix: { needsUpdate: boolean };
		instanceColor: { needsUpdate: boolean } | null;
		rotation: { x: number; y: number; z: number };
		geometry: BoxGeometry;
		material: MeshStandardMaterial | MeshStandardMaterial[];
	}
}

declare module "three/examples/jsm/controls/OrbitControls" {
	import { Camera } from "three";
	export class OrbitControls {
		constructor(camera: Camera, domElement?: HTMLElement);
		enableDamping: boolean;
		dampingFactor: number;
		rotateSpeed: number;
		update(): void;
		dispose(): void;
	}
}

declare module "simplex-noise" {
	export function createNoise2D(): (x: number, y: number) => number;
	export function createNoise3D(): (
		x: number,
		y: number,
		z: number
	) => number;
}

declare module "../components/VoxelEarth" {
	import { InstancedMesh } from "three";
	export class VoxelEarth {
		constructor(span: number, resolution: number);
		init(): Promise<void>;
		update(
			time: number,
			noiseZoom: number,
			threshold: number,
			cloudClumpage: number,
			steepness: number
		): void;
		getMesh(): InstancedMesh;
		dispose(): void;
	}
}

declare module "./AudioManager" {
	import { Camera } from "three";
	export class AudioManager {
		constructor(camera: Camera);
		init(): Promise<void>;
		setVolume(volume: number): void;
		toggleMute(): void;
		dispose(): void;
	}
}
