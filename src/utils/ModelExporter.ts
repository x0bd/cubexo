import * as THREE from "three";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

export enum ExportFormat {
	OBJ = "obj",
	STL = "stl",
	GLTF = "gltf",
	GLB = "glb",
}

export class ModelExporter {
	/**
	 * Converts an instanced mesh to a regular mesh by creating individual cubes
	 * @param instancedMesh The source instanced mesh
	 * @param voxels The voxel data (positions and colors)
	 * @returns A Group containing all individual meshes
	 */
	static convertInstancedMeshToRegular(
		instancedMesh: THREE.InstancedMesh,
		voxels: { position: THREE.Vector3; color: THREE.Color }[]
	): THREE.Group {
		const group = new THREE.Group();
		const geometry = instancedMesh.geometry.clone();
		const material = instancedMesh.material as THREE.Material;

		// Create a mesh for each instance up to the count
		for (let i = 0; i < instancedMesh.count; i++) {
			// Only process voxels that exist in the array
			if (i >= voxels.length) break;

			// Create a new material for this voxel with the proper color
			let voxelMaterial: THREE.Material;

			if (material instanceof THREE.MeshPhysicalMaterial) {
				voxelMaterial = new THREE.MeshPhysicalMaterial({
					color: voxels[i].color,
					roughness: material.roughness,
					metalness: material.metalness,
					reflectivity: material.reflectivity,
					clearcoat: material.clearcoat,
					clearcoatRoughness: material.clearcoatRoughness,
					flatShading: material.flatShading,
				});
			} else if (material instanceof THREE.MeshStandardMaterial) {
				voxelMaterial = new THREE.MeshStandardMaterial({
					color: voxels[i].color,
					roughness: material.roughness,
					metalness: material.metalness,
					flatShading: material.flatShading,
				});
			} else if (material instanceof THREE.MeshLambertMaterial) {
				voxelMaterial = new THREE.MeshLambertMaterial({
					color: voxels[i].color,
					emissive: material.emissive,
					emissiveIntensity: material.emissiveIntensity,
					flatShading: material.flatShading,
				});
			} else if (material instanceof THREE.MeshPhongMaterial) {
				voxelMaterial = new THREE.MeshPhongMaterial({
					color: voxels[i].color,
					shininess: material.shininess,
					specular: material.specular,
					flatShading: material.flatShading,
				});
			} else {
				// Fallback to a basic material
				voxelMaterial = new THREE.MeshStandardMaterial({
					color: voxels[i].color,
				});
			}

			// Create a mesh with the geometry and material
			const voxelMesh = new THREE.Mesh(geometry, voxelMaterial);

			// Set the position from the voxel data
			voxelMesh.position.copy(voxels[i].position);

			// Add to the group
			group.add(voxelMesh);
		}

		return group;
	}

	/**
	 * Exports the model in the specified format
	 * @param model The THREE.Object3D to export
	 * @param format The format to export as
	 * @param filename The filename without extension
	 */
	static exportModel(
		model: THREE.Object3D,
		format: ExportFormat,
		filename: string
	): void {
		let result: string | Blob | undefined;

		switch (format) {
			case ExportFormat.OBJ:
				const objExporter = new OBJExporter();
				result = objExporter.parse(model);
				break;

			case ExportFormat.STL:
				const stlExporter = new STLExporter();
				result = stlExporter.parse(model) as string;
				break;

			case ExportFormat.GLTF:
			case ExportFormat.GLB:
				const gltfExporter = new GLTFExporter();
				const options = {
					binary: format === ExportFormat.GLB, // Export as binary GLB when requested
					includeCustomExtensions: true,
					embedImages: true,
					animations: [],
				};

				gltfExporter.parse(
					model,
					(result) => {
						let blob;
						const extension =
							format === ExportFormat.GLB ? "glb" : "gltf";

						if (format === ExportFormat.GLB) {
							// For GLB (binary), result is an ArrayBuffer
							blob = new Blob([result as ArrayBuffer], {
								type: "application/octet-stream",
							});
						} else {
							// For GLTF (JSON), convert to string
							blob = new Blob([JSON.stringify(result)], {
								type: "application/json",
							});
						}

						this.saveFile(blob, `${filename}.${extension}`);
					},
					(error) => {
						console.error(
							"An error occurred during export:",
							error
						);
					},
					options
				);
				return; // Return early as GLTF/GLB export is async

			default:
				console.error("Unsupported export format:", format);
				return;
		}

		if (result) {
			const blob = new Blob([result], { type: "text/plain" });
			this.saveFile(blob, `${filename}.${format}`);
		}
	}

	/**
	 * Saves a blob as a file download
	 * @param blob The blob to save
	 * @param filename The filename to save as
	 */
	private static saveFile(blob: Blob, filename: string): void {
		const link = document.createElement("a");
		link.href = URL.createObjectURL(blob);
		link.download = filename;
		link.click();

		// Clean up
		setTimeout(() => {
			URL.revokeObjectURL(link.href);
			link.remove();
		}, 100);
	}
}
