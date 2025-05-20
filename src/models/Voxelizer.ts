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
	private rayCaster = new THREE.Raycaster();
	private rayCasterIntersects: THREE.Intersection[] = [];

	constructor(params?: Partial<AppParameters>) {
		if (params) {
			this.params = { ...this.params, ...params };
		}
	}

	public voxelizeModel(
		modelIdx: number,
		importedScene: THREE.Group
	): Voxel[] {
		const importedMeshes: THREE.Mesh[] = [];
		importedScene.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				child.material.side = THREE.DoubleSide;
				importedMeshes.push(child);
			}
		});

		let boundingBox = new THREE.Box3().setFromObject(importedScene);
		const size = boundingBox.getSize(new THREE.Vector3());
		const scaleFactor = this.params.modelSize / size.length();
		const center = boundingBox
			.getCenter(new THREE.Vector3())
			.multiplyScalar(-scaleFactor);

		importedScene.scale.multiplyScalar(scaleFactor);
		importedScene.position.copy(center);

		boundingBox = new THREE.Box3().setFromObject(importedScene);
		boundingBox.min.y += 0.5 * this.params.gridSize; // for egg grid to look better

		const modelVoxels: Voxel[] = [];

		for (
			let i = boundingBox.min.x;
			i < boundingBox.max.x;
			i += this.params.gridSize
		) {
			for (
				let j = boundingBox.min.y;
				j < boundingBox.max.y;
				j += this.params.gridSize
			) {
				for (
					let k = boundingBox.min.z;
					k < boundingBox.max.z;
					k += this.params.gridSize
				) {
					for (
						let meshCnt = 0;
						meshCnt < importedMeshes.length;
						meshCnt++
					) {
						const mesh = importedMeshes[meshCnt];
						const color = this.extractColorFromMaterial(
							mesh.material
						);
						const pos = new THREE.Vector3(i, j, k);

						if (
							this.isInsideMesh(
								pos,
								new THREE.Vector3(0, 0, 1),
								mesh
							)
						) {
							modelVoxels.push({ color: color, position: pos });
							break;
						}
					}
				}
			}
		}

		return modelVoxels;
	}

	private isInsideMesh(
		pos: THREE.Vector3,
		ray: THREE.Vector3,
		mesh: THREE.Mesh
	): boolean {
		this.rayCaster.set(pos, ray);
		this.rayCasterIntersects = this.rayCaster.intersectObject(mesh, false);
		return this.rayCasterIntersects.length % 2 === 1;
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

		// Default color if we can't extract one
		const defaultColor = new THREE.Color(0xffffff);

		// Try to extract color from various material types
		if ("color" in material && material.color instanceof THREE.Color) {
			// Most materials have a color property
			return material.color.clone();
		} else if (
			"emissive" in material &&
			material.emissive instanceof THREE.Color
		) {
			// MeshPhongMaterial and MeshStandardMaterial have emissive
			return material.emissive.clone();
		} else if ("map" in material && material.map) {
			// If there's a texture map but no direct color, create a color based on model index
			// This is better than default white
			return new THREE.Color().setHSL(Math.random(), 0.8, 0.5);
		}

		// Fallback to default color
		return defaultColor;
	}
}
