import * as THREE from "three";

export interface Voxel {
	position: THREE.Vector3;
	color: THREE.Color;
}

export interface ModelData {
	name: string;
	model: THREE.Group | null;
	voxels: Voxel[];
	url: string;
	originalIndex: number;
}

export interface AppParameters {
	modelPreviewSize: number;
	modelSize: number;
	gridSize: number;
	boxSize: number;
	boxRoundness: number;
}
