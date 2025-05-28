import * as THREE from "three";

export interface Voxel {
	position: THREE.Vector3;
	color: THREE.Color;
}

export interface ModelData {
	name: string;
	url: string;
	model: THREE.Group;
	voxels?: Voxel[];
	previewScene?: THREE.Scene;
}

export interface AppParameters {
	modelPreviewSize: number;
	modelSize: number;
	gridSize: number;
	boxSize: number;
	boxRoundness: number;
}
