import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Voxel } from "../types/types"; // Assuming your Voxel type is here

// Parameters needed for voxelization (mirroring main.js params)
// These would ideally be passed in the message or configured
const params = {
	modelPreviewSize: 2, // Not directly used in voxelization, but part of the set
	modelSize: 9, // Target size for the longest dimension of the model
	gridSize: 0.24, // The size of each voxel and the step for the grid
	boxSize: 0.24, // Not directly used here, but for RoundedBoxGeometry
	boxRoundness: 0.03, // Not directly used here
};

let rayCaster = new THREE.Raycaster(); // Initialize once
let rayCasterIntersects: THREE.Intersection[] = []; // Re-use for performance

/**
 * Checks if a point is inside a mesh using raycasting.
 * (Directly adapted from main.js)
 */
function isInsideMesh(
	pos: THREE.Vector3,
	rayDirection: THREE.Vector3,
	mesh: THREE.Mesh
): boolean {
	rayCaster.set(pos, rayDirection);
	rayCasterIntersects = rayCaster.intersectObject(mesh, false); // Reuse array
	return rayCasterIntersects.length % 2 === 1;
}

/**
 * Voxelizes a GLTF scene.
 * (Adapted from main.js voxelizeModel function)
 */
function voxelizeGLTFScene(
	gltfScene: THREE.Group,
	modelName: string,
	originalIndex: number
): Voxel[] {
	console.log(`[Worker] Voxelizing: ${modelName}`);
	const importedMeshes: THREE.Mesh[] = [];
	gltfScene.traverse((child) => {
		if (child instanceof THREE.Mesh) {
			child.material.side = THREE.DoubleSide; // Ensure raycasting works from inside
			importedMeshes.push(child);
		}
	});

	if (importedMeshes.length === 0) {
		console.warn(
			"[Worker] No meshes found in the imported scene for voxelization."
		);
		return [];
	}

	// --- Scaling and Centering (from main.js) ---
	let boundingBox = new THREE.Box3().setFromObject(gltfScene);
	const size = boundingBox.getSize(new THREE.Vector3());
	if (size.length() === 0) {
		console.warn(
			"[Worker] Model has zero size, cannot calculate scale factor."
		);
		return [];
	}
	const scaleFactor = params.modelSize / size.length();
	const center = boundingBox
		.getCenter(new THREE.Vector3())
		.multiplyScalar(-scaleFactor);

	gltfScene.scale.multiplyScalar(scaleFactor);
	gltfScene.position.copy(center);
	gltfScene.updateMatrixWorld(true); // Ensure transformations are applied

	// --- Recalculate Bounding Box AFTER transformations (crucial) ---
	boundingBox = new THREE.Box3().setFromObject(gltfScene);

	// !!! Apply the Y-offset quirk from main.js !!!
	boundingBox.min.y += 0.5 * params.gridSize;
	console.log(
		`[Worker] Voxelizing ${modelName} with BBox: min(x:${boundingBox.min.x.toFixed(
			2
		)}, y:${boundingBox.min.y.toFixed(2)}, z:${boundingBox.min.z.toFixed(
			2
		)}), max(x:${boundingBox.max.x.toFixed(
			2
		)}, y:${boundingBox.max.y.toFixed(2)}, z:${boundingBox.max.z.toFixed(
			2
		)})`
	);

	const modelVoxels: Voxel[] = [];
	const step = params.gridSize;
	const rayDirection = new THREE.Vector3(0, 0, 1); // Constant ray direction

	// Iterate through the bounding box
	for (let x = boundingBox.min.x; x < boundingBox.max.x; x += step) {
		for (let y = boundingBox.min.y; y < boundingBox.max.y; y += step) {
			for (let z = boundingBox.min.z; z < boundingBox.max.z; z += step) {
				const currentPoint = new THREE.Vector3(
					x + step / 2,
					y + step / 2,
					z + step / 2
				);
				for (const mesh of importedMeshes) {
					// Make sure mesh world matrix is up to date if it was transformed independently
					// mesh.updateMatrixWorld(); // Usually handled by gltfScene.updateMatrixWorld(true)
					if (isInsideMesh(currentPoint, rayDirection, mesh)) {
						const color = new THREE.Color(0xffffff); // Default white
						if (
							mesh.material &&
							(mesh.material as THREE.MeshStandardMaterial).color
						) {
							const materialColor = (
								mesh.material as THREE.MeshStandardMaterial
							).color;
							const { h, s, l } = materialColor.getHSL({
								h: 0,
								s: 0,
								l: 0,
							});
							color.setHSL(h, s * 0.8, l * 0.8 + 0.2); //main.js color modification
						}
						modelVoxels.push({
							position: currentPoint.clone(),
							color: color,
						});
						break; // Found voxel in this mesh, move to next point
					}
				}
			}
		}
	}
	console.log(
		`[Worker] Voxelization complete for ${modelName}. Found ${modelVoxels.length} voxels.`
	);
	return modelVoxels;
}

self.onmessage = (event) => {
	const { fileUrl, fileArrayBuffer, fileName, modelIndex } = event.data;
	console.log("[Worker] Received message:", event.data);

	const loader = new GLTFLoader();

	const onLoad = (gltf: any) => {
		console.log("[Worker] GLTF loaded successfully for:", fileName);
		try {
			const voxels = voxelizeGLTFScene(gltf.scene, fileName, modelIndex);
			self.postMessage({
				status: "success",
				voxels: voxels,
				modelName: fileName,
				modelIndex: modelIndex,
			});
		} catch (error: any) {
			console.error("[Worker] Error during voxelization:", error);
			self.postMessage({
				status: "error",
				message: error.message || "Voxelization failed",
				modelName: fileName,
				modelIndex: modelIndex,
			});
		}
	};

	const onError = (error: any) => {
		console.error("[Worker] Error loading GLTF:", error);
		self.postMessage({
			status: "error",
			message: "Failed to load GLTF model in worker",
			modelName: fileName,
			modelIndex: modelIndex,
		});
	};

	if (fileUrl) {
		loader.load(fileUrl, onLoad, undefined, onError);
	} else if (fileArrayBuffer) {
		loader.parse(fileArrayBuffer, "", onLoad, onError);
	} else {
		console.error("[Worker] No fileUrl or fileArrayBuffer provided.");
		self.postMessage({
			status: "error",
			message: "No file data provided to worker",
			modelName: fileName,
			modelIndex: modelIndex,
		});
	}
};
