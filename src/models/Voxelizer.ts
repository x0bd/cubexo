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

						const color = new THREE.Color();
						const material =
							mesh.material as THREE.MeshStandardMaterial;
						const hsl = { h: 0, s: 0, l: 0 };
						material.color.getHSL(hsl);
						color.setHSL(hsl.h, hsl.s * 0.8, hsl.l * 0.8 + 0.2);
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
}
