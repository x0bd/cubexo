import * as THREE from "three";

/**
 * Model data structure
 */
export interface ModelData {
	id: string;
	name: string;
	geometry?: THREE.BufferGeometry;
	voxels?: VoxelData;
	thumbnail?: string;
}

/**
 * Voxel data structure
 */
export interface VoxelData {
	dimensions: [number, number, number];
	voxels: number[]; // Flat array of voxel values (0 = empty, 1+ = material index)
	materials: VoxelMaterial[];
}

/**
 * Voxel material information
 */
export interface VoxelMaterial {
	color: string;
	emissive?: string;
	roughness?: number;
	metalness?: number;
}
