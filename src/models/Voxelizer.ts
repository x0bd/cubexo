import * as THREE from "three";
import type { Voxel, AppParameters } from "../types/types";

export class Voxelizer {
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

	public voxelizeModel(
		modelIdx: number,
		importedScene: THREE.Group
	): Voxel[] {
		console.log(`Voxelizing model ${modelIdx} with Triangle-Box Intersection`);

		// Prepare the scene: verify transforms and update matrices
		// This logic matches the previous scale/center logic
		let boundingBox = new THREE.Box3().setFromObject(importedScene);
		const size = boundingBox.getSize(new THREE.Vector3());
		const scaleFactor = this.params.modelSize / size.length();
		const center = boundingBox
			.getCenter(new THREE.Vector3())
			.multiplyScalar(-scaleFactor);

		importedScene.scale.multiplyScalar(scaleFactor);
		importedScene.position.copy(center);
		importedScene.updateMatrixWorld(true);

		// Re-calculate bounding box after transform to determine grid bounds
		boundingBox = new THREE.Box3().setFromObject(importedScene);
		// Expand slightly to ensure boundary triangles are caught
		const gridPad = this.params.gridSize * 0.5;
		boundingBox.expandByScalar(gridPad);

		// Grid parameters
		const gridSize = this.params.gridSize;
		const invGridSize = 1 / gridSize;
		
		// Map to store unique voxels: key "x,y,z" -> Voxel
		const voxelMap = new Map<string, Voxel>();
		
		// Temporary variables for memory efficiency
		const triangle = new THREE.Triangle();
		const a = new THREE.Vector3();
		const b = new THREE.Vector3();
		const c = new THREE.Vector3();
		const bboxMin = new THREE.Vector3();
		const bboxMax = new THREE.Vector3();
		
		const voxelBox = new THREE.Box3();
		const halfGrid = new THREE.Vector3(gridSize/2, gridSize/2, gridSize/2);

		// Traverse all meshes in the scene
		importedScene.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				const mesh = child;
				const geometry = mesh.geometry;
				const material = mesh.material;
				
				// Ensure we have world matrix
				// Since we called importedScene.updateMatrixWorld(true), child matrices are up to date
				const matrixWorld = mesh.matrixWorld;

				// Handle geometry (BufferGeometry)
				if (geometry.isBufferGeometry) {
					const posAttr = geometry.attributes.position;
					const indexAttr = geometry.index;
					
					// Determine color for this mesh
					const meshColor = this.extractColorFromMaterial(material);

					// Helper to process a triangle
					const processTriangle = (ia: number, ib: number, ic: number) => {
						// Get vertices in world space
						a.fromBufferAttribute(posAttr, ia).applyMatrix4(matrixWorld);
						b.fromBufferAttribute(posAttr, ib).applyMatrix4(matrixWorld);
						c.fromBufferAttribute(posAttr, ic).applyMatrix4(matrixWorld);

						triangle.set(a, b, c);

						// Calc triangle bounding box
						bboxMin.copy(a).min(b).min(c);
						bboxMax.copy(a).max(b).max(c);

						// Determine grid range for this triangle
						const iMin = Math.floor(bboxMin.x * invGridSize);
						const iMax = Math.floor(bboxMax.x * invGridSize);
						const jMin = Math.floor(bboxMin.y * invGridSize);
						const jMax = Math.floor(bboxMax.y * invGridSize);
						const kMin = Math.floor(bboxMin.z * invGridSize);
						const kMax = Math.floor(bboxMax.z * invGridSize);

						// Iterate over potential grid cells
						for (let i = iMin; i <= iMax; i++) {
							for (let j = jMin; j <= jMax; j++) {
								for (let k = kMin; k <= kMax; k++) {
									// Define the voxel box
									const vx = i * gridSize;
									const vy = j * gridSize;
									const vz = k * gridSize;
									
									voxelBox.min.set(vx, vy, vz);
									voxelBox.max.set(vx + gridSize, vy + gridSize, vz + gridSize);

									if (triangle.intersectsBox(voxelBox)) {
										const key = `${i},${j},${k}`;
										
										// If not already present, add it
										// (We could mix colors here if we wanted to be fancy, but first win is fine)
										if (!voxelMap.has(key)) {
											// Center of the voxel
											const centerV = new THREE.Vector3(vx + gridSize/2, vy + gridSize/2, vz + gridSize/2);
											
											voxelMap.set(key, {
												position: centerV,
												color: meshColor.clone()
											});
										}
									}
								}
							}
						}
					};

					// Iterate over triangles
					if (indexAttr) {
						for (let i = 0; i < indexAttr.count; i += 3) {
							processTriangle(indexAttr.getX(i), indexAttr.getX(i+1), indexAttr.getX(i+2));
						}
					} else {
						for (let i = 0; i < posAttr.count; i += 3) {
							processTriangle(i, i+1, i+2);
						}
					}
				}
			}
		});

		const modelVoxels = Array.from(voxelMap.values());
		console.log(
			`Model ${modelIdx} voxelized with ${modelVoxels.length} voxels (Triangle-Box Intersection)`
		);
		return modelVoxels;
	}

	/**
	 * Extract color from any type of material
	 * @param material The material to extract color from
	 * @returns The extracted color
	 */
	private extractColorFromMaterial(
		material: THREE.Material | THREE.Material[]
	): THREE.Color {
		// Handle array of materials by using the first one
		if (Array.isArray(material)) {
			return this.extractColorFromMaterial(material[0]);
		}

		// Default color
		const defaultColor = new THREE.Color(0xffffff);

		// Try to extract color from various material types
		if ("color" in material && material.color instanceof THREE.Color) {
			const color = material.color.clone();
            // Removed artificial color enhancement to preserve natural tones (browns, creams)
            console.log(`Extracted color: ${color.getHexString()}`);
			return color;
		} else if (
			"emissive" in material &&
			material.emissive instanceof THREE.Color &&
			!material.emissive.equals(new THREE.Color(0x000000))
		) {
			return material.emissive.clone();
		} else if ("map" in material && material.map) {
             // Heuristic based on texture name
             const map = material.map as THREE.Texture;
             if (map && map.name) {
                 const n = map.name.toLowerCase();
                 if (n.includes('leaf') || n.includes('green')) return new THREE.Color(0x4caf50);
                 if (n.includes('bark') || n.includes('wood') || n.includes('brown')) return new THREE.Color(0x795548);
             }

             // Deterministic fallback based on UUID
			let textureId = 0;
			if (map && typeof map === "object" && "uuid" in map) {
				textureId = map.uuid
					.split("")
					.reduce((acc: number, char: string) => {
						return (acc << 5) - acc + char.charCodeAt(0);
					}, 0);
			}
			const hue = Math.abs(textureId % 100) / 100;
			return new THREE.Color().setHSL(hue, 0.6, 0.5);
		}

		return defaultColor;
	}
}
