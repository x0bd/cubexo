import * as THREE from "three";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
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
		// Start building OBJ string with header
		let objContent = "# Exported Voxel Model\n";

		// Define a standard unit cube vertices (8 vertices)
		const cubeVertices = [
			[-0.5, -0.5, -0.5], // 0: left bottom back
			[0.5, -0.5, -0.5], // 1: right bottom back
			[0.5, 0.5, -0.5], // 2: right top back
			[-0.5, 0.5, -0.5], // 3: left top back
			[-0.5, -0.5, 0.5], // 4: left bottom front
			[0.5, -0.5, 0.5], // 5: right bottom front
			[0.5, 0.5, 0.5], // 6: right top front
			[-0.5, 0.5, 0.5], // 7: left top front
		];

		// Define material library
		objContent += "mtllib voxel_colors.mtl\n\n";

		// Create a map of colors to material names to avoid duplicates
		const colorMaterials = new Map<string, string>();
		let materialIndex = 0;

		// Create MTL content
		let mtlContent = "# Voxel Colors Material Library\n";

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

		// Write group header
		objContent += "g voxel_model\n\n";

		// Second pass: Create voxel instances with transforms
		for (let i = 0; i < voxels.length; i++) {
			const voxel = voxels[i];
			const position = voxel.position;
			const colorHex = "#" + voxel.color.getHexString();
			const materialName = colorMaterials.get(colorHex);

			// Starting vertex index for this voxel (1-based for OBJ format)
			const vIndex = i * 8 + 1;

			// Use material for this voxel
			objContent += `usemtl ${materialName}\n`;

			// Define transformed vertices for this voxel
			for (const [x, y, z] of cubeVertices) {
				objContent += `v ${x + position.x} ${y + position.y} ${
					z + position.z
				}\n`;
			}

			// Define the 6 faces of the cube (12 triangles)
			// Front face
			objContent += `f ${vIndex + 4} ${vIndex + 5} ${vIndex + 6}\n`;
			objContent += `f ${vIndex + 4} ${vIndex + 6} ${vIndex + 7}\n`;
			// Back face
			objContent += `f ${vIndex + 1} ${vIndex + 2} ${vIndex + 3}\n`;
			objContent += `f ${vIndex + 1} ${vIndex + 3} ${vIndex + 0}\n`;
			// Right face
			objContent += `f ${vIndex + 1} ${vIndex + 5} ${vIndex + 6}\n`;
			objContent += `f ${vIndex + 1} ${vIndex + 6} ${vIndex + 2}\n`;
			// Left face
			objContent += `f ${vIndex + 0} ${vIndex + 3} ${vIndex + 7}\n`;
			objContent += `f ${vIndex + 0} ${vIndex + 7} ${vIndex + 4}\n`;
			// Top face
			objContent += `f ${vIndex + 3} ${vIndex + 2} ${vIndex + 6}\n`;
			objContent += `f ${vIndex + 3} ${vIndex + 6} ${vIndex + 7}\n`;
			// Bottom face
			objContent += `f ${vIndex + 0} ${vIndex + 4} ${vIndex + 5}\n`;
			objContent += `f ${vIndex + 0} ${vIndex + 5} ${vIndex + 1}\n\n`;
		}

		// Save OBJ file
		const objBlob = new Blob([objContent], { type: "text/plain" });
		this.saveFile(objBlob, `${filename}.obj`);

		// Save MTL file
		const mtlBlob = new Blob([mtlContent], { type: "text/plain" });
		this.saveFile(mtlBlob, `${filename}_materials.mtl`);

		console.log(
			`Exported OBJ with ${voxels.length} voxels and ${colorMaterials.size} unique materials`
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
		// Create a minimal BoxGeometry to use as template
		const boxGeometry = new THREE.BoxGeometry(1, 1, 1);

		// Create a geometry with buffer attributes to store all voxel data
		const mergedGeometry = new THREE.BufferGeometry();

		// Get attributes from the template box
		const positionAttribute = boxGeometry.getAttribute("position");
		const normalAttribute = boxGeometry.getAttribute("normal");
		const indexAttribute = boxGeometry.getIndex();

		if (!positionAttribute || !normalAttribute || !indexAttribute) {
			console.error("Missing attributes on box geometry");
			return;
		}

		// Allocate buffers for the merged geometry
		const vertexCount = positionAttribute.count * voxels.length;
		const positions = new Float32Array(vertexCount * 3);
		const normals = new Float32Array(vertexCount * 3);
		const colors = new Float32Array(vertexCount * 3);

		// Number of vertices per box
		const verticesPerBox = positionAttribute.count;

		// Create combined index array - each box has its own set of indices
		const indices = [];
		const indexCount = indexAttribute.count;

		// Process each voxel
		for (let i = 0; i < voxels.length; i++) {
			const voxel = voxels[i];
			const posOffset = i * verticesPerBox * 3;

			// Copy and transform positions from template
			for (let v = 0; v < verticesPerBox; v++) {
				const srcOffset = v * 3;
				const destOffset = posOffset + srcOffset;

				// Get position from template
				positions[destOffset] =
					positionAttribute.getX(v) + voxel.position.x;
				positions[destOffset + 1] =
					positionAttribute.getY(v) + voxel.position.y;
				positions[destOffset + 2] =
					positionAttribute.getZ(v) + voxel.position.z;

				// Copy normals
				normals[destOffset] = normalAttribute.getX(v);
				normals[destOffset + 1] = normalAttribute.getY(v);
				normals[destOffset + 2] = normalAttribute.getZ(v);

				// Set colors
				colors[destOffset] = voxel.color.r;
				colors[destOffset + 1] = voxel.color.g;
				colors[destOffset + 2] = voxel.color.b;
			}

			// Create indices for this box with correct offset
			const vertexOffset = i * verticesPerBox;
			for (let j = 0; j < indexCount; j++) {
				indices.push(indexAttribute.getX(j) + vertexOffset);
			}
		}

		// Set attributes on the merged geometry
		mergedGeometry.setAttribute(
			"position",
			new THREE.BufferAttribute(positions, 3)
		);
		mergedGeometry.setAttribute(
			"normal",
			new THREE.BufferAttribute(normals, 3)
		);
		mergedGeometry.setAttribute(
			"color",
			new THREE.BufferAttribute(colors, 3)
		);
		mergedGeometry.setIndex(indices);

		// Create a material that uses vertex colors
		const material = new THREE.MeshStandardMaterial({
			vertexColors: true,
			flatShading: true,
			roughness: 0.8,
			metalness: 0.2,
		});

		// Create mesh with the merged geometry
		const mesh = new THREE.Mesh(mergedGeometry, material);
		mesh.name = "voxel_model";

		// Add to a scene for export
		const scene = new THREE.Scene();
		scene.add(mesh);

		// Export using GLTFExporter
		const gltfExporter = new GLTFExporter();
		const options = {
			binary: format === ExportFormat.GLB,
			includeCustomExtensions: true,
			embedImages: true,
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
				console.log(`Exported ${format} with ${voxels.length} voxels`);

				// Clean up
				mergedGeometry.dispose();
				boxGeometry.dispose();
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
		// For STL we create a merged geometry since STL doesn't support colors anyway
		const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
		const geometriesToMerge: THREE.BufferGeometry[] = [];

		// Process each voxel
		for (let i = 0; i < voxels.length; i++) {
			const voxel = voxels[i];

			// Clone the template geometry
			const boxClone = boxGeometry.clone();

			// Apply position transform
			boxClone.translate(
				voxel.position.x,
				voxel.position.y,
				voxel.position.z
			);

			// Add to merge list
			geometriesToMerge.push(boxClone);

			// Process in batches to avoid memory issues
			if (geometriesToMerge.length >= 1000 || i === voxels.length - 1) {
				// We have a batch to process
				const batchGeometry =
					BufferGeometryUtils.mergeGeometries(geometriesToMerge);

				// Create a mesh with the merged geometry
				const mesh = new THREE.Mesh(batchGeometry);

				// Export this batch
				const stlExporter = new STLExporter();
				const result = stlExporter.parse(mesh) as string;

				// Save the STL file for this batch
				const blob = new Blob([result], { type: "text/plain" });
				const batchNum = Math.floor(i / 1000);
				this.saveFile(blob, `${filename}_part${batchNum}.stl`);

				// Clean up
				batchGeometry.dispose();
				geometriesToMerge.length = 0;

				console.log(
					`Exported STL batch ${batchNum} with up to 1000 voxels`
				);
			}
		}

		// Clean up the template geometry
		boxGeometry.dispose();
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
