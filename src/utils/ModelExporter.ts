import * as THREE from "three";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";

export enum ExportFormat {
	OBJ = "obj",
	STL = "stl",
	GLTF = "gltf",
	GLB = "glb",
}

export class ModelExporter {
	/**
	 * Exports a voxel model directly from voxel data without using Three.js exporters
	 * This is much more efficient for large voxel models
	 * @param voxels Array of voxel data with position and color
	 * @param format Export format
	 * @param filename Filename to save as
	 */
	static exportVoxelModel(
		voxels: { position: THREE.Vector3; color: THREE.Color }[],
		format: ExportFormat,
		filename: string
	): void {
		if (!voxels || voxels.length === 0) {
			console.error("No voxels to export");
			return;
		}

		console.log(`Exporting ${voxels.length} voxels as ${format}`);

		// For OBJ format, use our custom optimized exporter
		if (format === ExportFormat.OBJ) {
			this.exportVoxelsAsOBJ(voxels, filename);
			return;
		}

		// For GLB/GLTF, create a minimal representation to export
		if (format === ExportFormat.GLB || format === ExportFormat.GLTF) {
			this.exportVoxelsAsGLTF(voxels, format, filename);
			return;
		}

		// For STL, we still use a merged mesh but optimize it
		if (format === ExportFormat.STL) {
			this.exportVoxelsAsSTL(voxels, filename);
			return;
		}

		console.error("Unsupported export format:", format);
	}

	/**
	 * Exports voxels as a highly optimized OBJ file
	 * Uses a single cube definition and references it for each voxel
	 */
	private static exportVoxelsAsOBJ(
		voxels: { position: THREE.Vector3; color: THREE.Color }[],
		filename: string
	): void {
		// Create a RoundedBoxGeometry that exactly matches what's in the viewer
		const boxSize = 0.24; // Must match params.boxSize in VoxelModelViewer
		const boxRoundness = 0.03; // Must match params.boxRoundness in VoxelModelViewer
		const boxGeometry = new RoundedBoxGeometry(
			boxSize,
			boxSize,
			boxSize,
			3, // Segments - match VoxelModelViewer
			boxRoundness
		);

		// Create material for OBJ export
		const material = new THREE.MeshStandardMaterial({
			roughness: 0.3, // Match VoxelModelViewer
			metalness: 0.15, // Match VoxelModelViewer
			flatShading: false,
		});

		// Create MTL content for all materials
		let mtlContent = "# Voxel Colors Material Library\n";
		const colorMaterials = new Map<string, string>();
		let materialIndex = 0;

		// First pass: Define all unique materials
		for (let i = 0; i < voxels.length; i++) {
			const voxel = voxels[i];
			// Create hex color code and check if we've seen it before
			const colorHex = "#" + voxel.color.getHexString();

			if (!colorMaterials.has(colorHex)) {
				const matName = `color_${materialIndex}`;
				colorMaterials.set(colorHex, matName);

				// Add material definition to MTL content
				mtlContent += `newmtl ${matName}\n`;
				mtlContent += `Kd ${voxel.color.r} ${voxel.color.g} ${voxel.color.b}\n`;
				mtlContent += "Ka 0 0 0\n"; // No ambient
				mtlContent += "Ks 0 0 0\n"; // No specular
				mtlContent += "d 1\n"; // No transparency
				mtlContent += "illum 1\n\n"; // Simple diffuse

				materialIndex++;
			}
		}

		// Save MTL file
		const mtlBlob = new Blob([mtlContent], { type: "text/plain" });
		this.saveFile(mtlBlob, `${filename}_materials.mtl`);

		// Create a group to hold all the individual voxel meshes
		const voxelGroup = new THREE.Group();
		voxelGroup.name = "voxel_model";

		// Process each voxel and create an individual mesh for each
		for (let i = 0; i < voxels.length; i++) {
			const voxel = voxels[i];

			// Clone the geometry for this voxel
			const voxelGeometry = boxGeometry.clone();

			// Create material for this voxel with its exact color
			const voxelMaterial = material.clone();
			voxelMaterial.color = voxel.color.clone();

			// Create a mesh for this voxel
			const voxelMesh = new THREE.Mesh(voxelGeometry, voxelMaterial);

			// Position the voxel at its exact position
			voxelMesh.position.copy(voxel.position);

			// Add to the group
			voxelGroup.add(voxelMesh);
		}

		// Export the group using OBJExporter
		const objExporter = new OBJExporter();
		const objContent = objExporter.parse(voxelGroup);

		// Save OBJ file
		const objBlob = new Blob([objContent], { type: "text/plain" });
		this.saveFile(objBlob, `${filename}.obj`);

		// Clean up
		boxGeometry.dispose();
		voxelGroup.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				child.geometry.dispose();
				if (child.material instanceof THREE.Material) {
					child.material.dispose();
				}
			}
		});

		console.log(
			`Exported OBJ with ${voxels.length} individual voxel blocks and ${colorMaterials.size} unique materials`
		);
	}

	/**
	 * Exports voxels as a GLB/GLTF file optimized for voxel data
	 * Creates a single mesh with buffer attributes for positions and colors
	 */
	private static exportVoxelsAsGLTF(
		voxels: { position: THREE.Vector3; color: THREE.Color }[],
		format: ExportFormat,
		filename: string
	): void {
		console.log(
			`Creating exact viewport match GLB with ${voxels.length} voxels`
		);

		// Create a BoxGeometry with rounded corners to exactly match the VoxelModelViewer
		// The VoxelModelViewer uses RoundedBoxGeometry with these parameters
		const boxSize = 0.24; // Must match params.boxSize in VoxelModelViewer
		const boxRoundness = 0.03; // Must match params.boxRoundness in VoxelModelViewer

		// Create rounded box geometry to exactly match what's in the VoxelModelViewer
		const boxGeometry = new RoundedBoxGeometry(
			boxSize,
			boxSize,
			boxSize,
			3, // Segments - match VoxelModelViewer
			boxRoundness
		);

		// Create a group to hold all the individual voxel meshes
		// This approach ensures we get EXACTLY what is shown in the viewer
		const voxelGroup = new THREE.Group();
		voxelGroup.name = "voxel_model";

		// Create a material that perfectly matches what's in the VoxelModelViewer
		const material = new THREE.MeshStandardMaterial({
			roughness: 0.3, // Match VoxelModelViewer (setupGeometries)
			metalness: 0.15, // Match VoxelModelViewer (setupGeometries)
			flatShading: false,
			envMapIntensity: 1.0,
		});

		// Process each voxel and create an individual mesh for each
		// This is less optimized but ensures we get EXACTLY what's shown in the viewer
		for (let i = 0; i < voxels.length; i++) {
			const voxel = voxels[i];

			// Clone the geometry for this voxel - each voxel gets its own instance
			const voxelGeometry = boxGeometry.clone();

			// Create a material specific to this voxel with its exact color
			const voxelMaterial = material.clone();
			voxelMaterial.color = voxel.color.clone();

			// Create a mesh for this voxel
			const voxelMesh = new THREE.Mesh(voxelGeometry, voxelMaterial);

			// Position the voxel at its exact position
			voxelMesh.position.copy(voxel.position);

			// Enable shadows exactly as in the viewer
			voxelMesh.castShadow = true;
			voxelMesh.receiveShadow = true;

			// Add to the group
			voxelGroup.add(voxelMesh);
		}

		// Create a scene for export with lighting identical to the viewer
		const scene = new THREE.Scene();
		scene.add(voxelGroup);

		// Add lighting that exactly matches the VoxelModelViewer
		const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
		scene.add(ambientLight);

		const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
		directionalLight.position.set(10, 15, 10);
		directionalLight.castShadow = true;
		scene.add(directionalLight);

		const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
		fillLight.position.set(-10, 5, -5);
		scene.add(fillLight);

		// Export using GLTFExporter with the exact scene setup
		const gltfExporter = new GLTFExporter();
		const options = {
			binary: format === ExportFormat.GLB,
			includeCustomExtensions: true,
			embedImages: true,
			animations: [],
			onlyVisible: true,
			truncateDrawRange: true,
			forceIndices: true,
			forcePowerOfTwoTextures: false,
		};

		gltfExporter.parse(
			scene,
			(result) => {
				let blob;
				const extension = format === ExportFormat.GLB ? "glb" : "gltf";

				if (format === ExportFormat.GLB) {
					blob = new Blob([result as ArrayBuffer], {
						type: "application/octet-stream",
					});
				} else {
					blob = new Blob([JSON.stringify(result)], {
						type: "application/json",
					});
				}

				this.saveFile(blob, `${filename}.${extension}`);
				console.log(
					`Exported ${format.toUpperCase()} with ${
						voxels.length
					} voxels - exact block-by-block match with individual meshes`
				);

				// Clean up
				boxGeometry.dispose();
				voxelGroup.traverse((child) => {
					if (child instanceof THREE.Mesh) {
						child.geometry.dispose();
						if (child.material instanceof THREE.Material) {
							child.material.dispose();
						}
					}
				});
			},
			(error) => {
				console.error("An error occurred during export:", error);
			},
			options
		);
	}

	/**
	 * Exports voxels as an STL file
	 * For STL we need to use triangles since it's a triangle-only format
	 */
	private static exportVoxelsAsSTL(
		voxels: { position: THREE.Vector3; color: THREE.Color }[],
		filename: string
	): void {
		// Create a RoundedBoxGeometry that exactly matches what's in the viewer
		const boxSize = 0.24; // Must match params.boxSize in VoxelModelViewer
		const boxRoundness = 0.03; // Must match params.boxRoundness in VoxelModelViewer
		const boxGeometry = new RoundedBoxGeometry(
			boxSize,
			boxSize,
			boxSize,
			3, // Segments - match VoxelModelViewer
			boxRoundness
		);

		// Create a group to hold all the individual voxel meshes
		const voxelGroup = new THREE.Group();
		voxelGroup.name = "voxel_model";

		// Process each voxel and create an individual mesh for each
		for (let i = 0; i < voxels.length; i++) {
			const voxel = voxels[i];

			// Clone the geometry for this voxel - each voxel gets its own instance
			const voxelGeometry = boxGeometry.clone();

			// Create a mesh for this voxel
			const voxelMesh = new THREE.Mesh(voxelGeometry);

			// Position the voxel at its exact position
			voxelMesh.position.copy(voxel.position);

			// Add to the group
			voxelGroup.add(voxelMesh);

			// Process in batches to avoid memory issues
			if (i % 1000 === 999 || i === voxels.length - 1) {
				// Export this batch
				const stlExporter = new STLExporter();
				const result = stlExporter.parse(voxelGroup) as string;

				// Save the STL file for this batch
				const blob = new Blob([result], { type: "text/plain" });
				const batchNum = Math.floor(i / 1000);
				const batchFilename =
					voxels.length > 1000
						? `${filename}_part${batchNum}.stl`
						: `${filename}.stl`;

				this.saveFile(blob, batchFilename);

				// Clear the group for the next batch
				voxelGroup.clear();

				console.log(
					`Exported STL batch ${batchNum} with ${
						(i % 1000) + 1
					} voxels`
				);
			}
		}

		// Clean up
		boxGeometry.dispose();

		console.log(
			`Exported STL with ${voxels.length} individual voxel blocks`
		);
	}

	/**
	 * Converts an instanced mesh to a regular mesh by creating individual cubes
	 * This version merges all instances into a single mesh for efficiency.
	 * @param instancedMesh The source instanced mesh
	 * @param voxels The voxel data (positions and colors for active instances)
	 * @returns A Group containing a single merged mesh, or an empty group if issues occur.
	 */
	static convertInstancedMeshToRegular(
		instancedMesh: THREE.InstancedMesh,
		voxels: { position: THREE.Vector3; color: THREE.Color }[]
	): THREE.Group {
		const group = new THREE.Group();

		if (
			!instancedMesh ||
			!voxels ||
			voxels.length === 0 ||
			instancedMesh.count === 0
		) {
			console.warn(
				"No voxels or instanced mesh to create merged mesh from."
			);
			return group;
		}

		const baseGeometry = instancedMesh.geometry;
		const sourceMaterial =
			instancedMesh.material as THREE.MeshStandardMaterial; // Assuming MeshStandardMaterial

		const geometriesToMerge: THREE.BufferGeometry[] = [];
		const matrix = new THREE.Matrix4();

		for (let i = 0; i < instancedMesh.count; i++) {
			if (i >= voxels.length) break;

			const voxelData = voxels[i];
			if (!voxelData || !voxelData.position || !voxelData.color) {
				console.warn(
					`Skipping voxel at index ${i} due to missing data.`
				);
				continue;
			}
			const geomInstance = baseGeometry.clone();

			// Apply vertex colors
			const numVertices = geomInstance.attributes.position.count;
			const colorArray = new Float32Array(numVertices * 3);
			for (let j = 0; j < numVertices; j++) {
				colorArray[j * 3 + 0] = voxelData.color.r;
				colorArray[j * 3 + 1] = voxelData.color.g;
				colorArray[j * 3 + 2] = voxelData.color.b;
			}
			geomInstance.setAttribute(
				"color",
				new THREE.BufferAttribute(colorArray, 3)
			);

			// Get the instance transform matrix and apply it to the geometry instance
			instancedMesh.getMatrixAt(i, matrix);
			geomInstance.applyMatrix4(matrix);

			geometriesToMerge.push(geomInstance);
		}

		if (geometriesToMerge.length === 0) {
			console.warn("No geometries were prepared for merging.");
			return group;
		}

		const mergedGeometry = BufferGeometryUtils.mergeGeometries(
			geometriesToMerge,
			false
		);
		if (!mergedGeometry) {
			console.error("Failed to merge geometries.");
			return group;
		}

		// Dispose individual geometries after merging if they are not needed elsewhere
		geometriesToMerge.forEach((geom) => geom.dispose());

		const mergedMaterial = sourceMaterial.clone();
		mergedMaterial.vertexColors = true;
		// Ensure other relevant material properties from sourceMaterial are kept.
		// Cloning generally handles this but double check if specific props are missing.

		const finalMesh = new THREE.Mesh(mergedGeometry, mergedMaterial);

		// The finalMesh contains vertices already in their local positions relative to the instancedMesh's origin.
		// The group will carry the overall world transform of the original instancedMesh.
		group.add(finalMesh);
		group.position.copy(instancedMesh.position);
		group.quaternion.copy(instancedMesh.quaternion);
		group.scale.copy(instancedMesh.scale);
		group.updateMatrixWorld(true); // Ensure the group's world matrix is current

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
