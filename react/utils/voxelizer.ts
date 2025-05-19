import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const VOXEL_SIZE = 0.24;

export type Voxel = {
	position: THREE.Vector3;
	color: THREE.Color;
};

/**
 * Voxel utility for loading and processing 3D models
 */
export const voxelizer = {
	/**
	 * Load a 3D model from URL
	 */
	loadModel: async (url: string): Promise<THREE.Group> => {
		return new Promise((resolve, reject) => {
			const loader = new GLTFLoader();

			loader.load(
				url,
				(gltf) => {
					const model = gltf.scene;
					resolve(model);
				},
				(xhr) => {
					console.log(
						`${url} ${(xhr.loaded / xhr.total) * 100}% loaded`
					);
				},
				(error) => {
					console.error("Error loading model:", error);
					reject(error);
				}
			);
		});
	},

	/**
	 * Convert a 3D model to voxels
	 */
	voxelizeModel: (model: THREE.Object3D): Voxel[] => {
		// Deep clone the model to avoid modifying the original
		const clonedModel = model.clone();

		// Center the model and normalize its size
		const modelBBox = new THREE.Box3().setFromObject(clonedModel);
		const modelSize = new THREE.Vector3();
		modelBBox.getSize(modelSize);

		const modelCenter = new THREE.Vector3();
		modelBBox.getCenter(modelCenter);

		// Calculate scale to normalize model size
		const maxDimension = Math.max(modelSize.x, modelSize.y, modelSize.z);
		const scale = 8 / maxDimension; // Size to fit within 8 voxels

		// Apply centering and scaling
		clonedModel.position.sub(modelCenter);
		clonedModel.scale.multiplyScalar(scale);

		// Update bounding box after transformations
		modelBBox.setFromObject(clonedModel);

		// Prepare for raycasting
		const voxelMap = new Map<string, Voxel>();
		const raycaster = new THREE.Raycaster();
		const directions = [
			new THREE.Vector3(1, 0, 0),
			new THREE.Vector3(-1, 0, 0),
			new THREE.Vector3(0, 1, 0),
			new THREE.Vector3(0, -1, 0),
			new THREE.Vector3(0, 0, 1),
			new THREE.Vector3(0, 0, -1),
		];

		// Create a scene with the model for raycasting
		const scene = new THREE.Scene();
		scene.add(clonedModel);

		// Extract meshes for coloring
		const meshes: THREE.Mesh[] = [];
		clonedModel.traverse((child) => {
			if (child instanceof THREE.Mesh) {
				meshes.push(child);
			}
		});

		// Calculate voxel grid dimensions
		modelBBox.getSize(modelSize);
		const gridSizeX = Math.ceil(modelSize.x / VOXEL_SIZE) + 2;
		const gridSizeY = Math.ceil(modelSize.y / VOXEL_SIZE) + 2;
		const gridSizeZ = Math.ceil(modelSize.z / VOXEL_SIZE) + 2;

		// Calculate starting position (bottom corner of the grid)
		const startPos = new THREE.Vector3()
			.copy(modelBBox.min)
			.addScalar(-VOXEL_SIZE); // Add padding

		// Function to generate voxel key
		const getVoxelKey = (x: number, y: number, z: number) =>
			`${x},${y},${z}`;

		// Perform voxelization by raycasting from each direction
		for (const direction of directions) {
			// Determine starting position and iteration parameters based on direction
			let startX, startY, startZ;
			let iterX, iterY, iterZ;

			if (direction.x !== 0) {
				startX = direction.x > 0 ? -gridSizeX / 2 : gridSizeX / 2;
				startY = -gridSizeY / 2;
				startZ = -gridSizeZ / 2;
				iterX = 0;
				iterY = gridSizeY;
				iterZ = gridSizeZ;
			} else if (direction.y !== 0) {
				startX = -gridSizeX / 2;
				startY = direction.y > 0 ? -gridSizeY / 2 : gridSizeY / 2;
				startZ = -gridSizeZ / 2;
				iterX = gridSizeX;
				iterY = 0;
				iterZ = gridSizeZ;
			} else {
				startX = -gridSizeX / 2;
				startY = -gridSizeY / 2;
				startZ = direction.z > 0 ? -gridSizeZ / 2 : gridSizeZ / 2;
				iterX = gridSizeX;
				iterY = gridSizeY;
				iterZ = 0;
			}

			// Cast rays
			for (let y = 0; y < iterY; y++) {
				for (let z = 0; z < iterZ; z++) {
					for (let x = 0; x < iterX; x++) {
						// Calculate ray origin
						const rayOrigin = new THREE.Vector3(
							startX +
								x * VOXEL_SIZE * (direction.x !== 0 ? 0 : 1),
							startY +
								y * VOXEL_SIZE * (direction.y !== 0 ? 0 : 1),
							startZ +
								z * VOXEL_SIZE * (direction.z !== 0 ? 0 : 1)
						);

						// Set up raycaster
						raycaster.set(rayOrigin, direction);

						// Cast ray and check for intersection
						const intersects = raycaster.intersectObjects(
							meshes,
							true
						);

						if (intersects.length > 0) {
							// Calculate voxel position from intersection
							const intersection = intersects[0];
							const voxelPos = new THREE.Vector3()
								.copy(intersection.point)
								.addScaledVector(direction, -VOXEL_SIZE / 2);

							// Snap to grid
							voxelPos.x =
								Math.round(voxelPos.x / VOXEL_SIZE) *
								VOXEL_SIZE;
							voxelPos.y =
								Math.round(voxelPos.y / VOXEL_SIZE) *
								VOXEL_SIZE;
							voxelPos.z =
								Math.round(voxelPos.z / VOXEL_SIZE) *
								VOXEL_SIZE;

							// Generate key
							const key = getVoxelKey(
								voxelPos.x,
								voxelPos.y,
								voxelPos.z
							);

							// Only add if not already present
							if (!voxelMap.has(key)) {
								// Get intersection color
								let color = new THREE.Color(0xffffff);

								// Try to extract material color
								if (intersection.object instanceof THREE.Mesh) {
									const material = intersection.object
										.material as any;

									if (material) {
										// Handle different material types
										if (material.color) {
											// Standard materials
											color.copy(material.color);
										} else if (material.map) {
											// Textured materials - approximate color from intersection
											const uv = intersection.uv;
											if (uv && material.map.image) {
												// Create a canvas to sample texture color
												const canvas =
													document.createElement(
														"canvas"
													);
												const ctx =
													canvas.getContext("2d");
												if (ctx) {
													canvas.width =
														material.map.image
															.width || 1;
													canvas.height =
														material.map.image
															.height || 1;
													ctx.drawImage(
														material.map.image,
														0,
														0
													);

													const x = Math.floor(
														uv.x * canvas.width
													);
													const y = Math.floor(
														uv.y * canvas.height
													);
													const pixel =
														ctx.getImageData(
															x,
															y,
															1,
															1
														).data;

													color.setRGB(
														pixel[0] / 255,
														pixel[1] / 255,
														pixel[2] / 255
													);
												}
											}
										}
									}
								}

								// Add voxel to map
								voxelMap.set(key, {
									position: voxelPos,
									color,
								});
							}
						}
					}
				}
			}
		}

		// Convert map to array
		return Array.from(voxelMap.values());
	},
};
