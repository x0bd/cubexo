import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export class ModelUploader {
	private gltfLoader: GLTFLoader;

	constructor() {
		this.gltfLoader = new GLTFLoader();
	}

	/**
	 * Process a file upload from the user
	 * @param file The uploaded file
	 * @returns Promise that resolves with the loaded model
	 */
	public loadUserModel(file: File): Promise<THREE.Group> {
		return new Promise((resolve, reject) => {
			// Create a URL for the file
			const url = URL.createObjectURL(file);

			// Clean up the object URL when done
			const cleanupUrl = () => URL.revokeObjectURL(url);

			// Load the GLB model
			this.gltfLoader.load(
				url,
				(gltf) => {
					cleanupUrl();

					// Apply some preprocessing to the model
					this.preprocessModel(gltf.scene);

					// Resolve with the model
					resolve(gltf.scene);
				},
				(progress) => {
					// Report loading progress (not used currently)
					console.log(
						"Loading progress:",
						(progress.loaded / progress.total) * 100,
						"%"
					);
				},
				(error) => {
					cleanupUrl();
					console.error("Error loading model:", error);
					reject(error);
				}
			);
		});
	}

	/**
	 * Normalize and preprocess the loaded model
	 * @param model The loaded 3D model
	 */
	private preprocessModel(model: THREE.Group): void {
		// Create a bounding box
		const box = new THREE.Box3().setFromObject(model);
		const size = new THREE.Vector3();
		box.getSize(size);
		const center = new THREE.Vector3();
		box.getCenter(center);

		// Calculate scale to normalize the model to a standard size
		const maxDim = Math.max(size.x, size.y, size.z);
		const scale = 6 / maxDim; // Scale to fit in a 6x6x6 box

		// Apply transformations to center and scale the model
		model.position.copy(center).multiplyScalar(-1);
		model.scale.multiplyScalar(scale);

		// Ensure all objects in the model cast shadows and preserve colors
		model.traverse((obj) => {
			if (obj instanceof THREE.Mesh) {
				obj.castShadow = true;
				obj.receiveShadow = true;

				// Handle different material types while preserving colors
				if (obj.material) {
					// Handle material arrays
					if (Array.isArray(obj.material)) {
						obj.material = obj.material.map((mat) =>
							this.processMaterial(mat)
						);
					} else {
						obj.material = this.processMaterial(obj.material);
					}
				}
			}
		});

		// Add vibrant colors if model has very few or no colors
		this.ensureVibrantColors(model);
	}

	/**
	 * Process a material to ensure it's suitable for voxelization while preserving color
	 * @param material The original material
	 * @returns A processed material with preserved color information
	 */
	private processMaterial(material: THREE.Material): THREE.Material {
		// If it's already a standard material, just ensure properties are set
		if (material instanceof THREE.MeshStandardMaterial) {
			const newMat = material.clone();
			newMat.roughness = 0.3;
			newMat.metalness = 0.2;
			return newMat;
		}

		// Extract color from various material types
		let color = new THREE.Color(0xffffff);

		// Try to get the color from the material - preserve original colors
		if ("color" in material && material.color instanceof THREE.Color) {
			color = material.color.clone();
		} else if (
			"emissive" in material &&
			material.emissive instanceof THREE.Color
		) {
			// MeshPhongMaterial and MeshStandardMaterial have emissive
			color = material.emissive.clone();
		} else if ("map" in material && material.map) {
			// If there's a texture, use a consistent color based on the texture
			// Generate a deterministic color from the texture
			let textureId = 0;
			const map = material.map as THREE.Texture;

			if (map && typeof map === "object" && "uuid" in map) {
				// Create a simple hash from the UUID string
				textureId = map.uuid
					.split("")
					.reduce((acc: number, char: string) => {
						return (acc << 5) - acc + char.charCodeAt(0);
					}, 0);
			} else {
				// Fallback to a random number if no UUID
				textureId = Math.floor(Math.random() * 100);
			}

			// Generate a color based on the hash (consistent for same texture)
			const hue = Math.abs(textureId % 100) / 100;
			color = new THREE.Color().setHSL(hue, 0.85, 0.5);
		}

		// Create a new standard material with the extracted color
		const stdMaterial = new THREE.MeshStandardMaterial({
			color: color,
			roughness: 0.3,
			metalness: 0.2,
		});

		return stdMaterial;
	}

	/**
	 * Ensure the model has vibrant colors for better voxelization results
	 * @param model The model to process
	 */
	private ensureVibrantColors(model: THREE.Group): void {
		// Count meshes with actual color information
		let coloredMeshCount = 0;
		let totalMeshCount = 0;

		model.traverse((obj) => {
			if (obj instanceof THREE.Mesh) {
				totalMeshCount++;

				// Check if this mesh has a non-white color
				if (obj.material) {
					const materials = Array.isArray(obj.material)
						? obj.material
						: [obj.material];

					for (const mat of materials) {
						if (
							"color" in mat &&
							mat.color instanceof THREE.Color
						) {
							const c = mat.color;
							// Only count as colored if it's not close to white
							if (!(c.r > 0.9 && c.g > 0.9 && c.b > 0.9)) {
								coloredMeshCount++;
								break;
							}
						}
					}
				}
			}
		});

		// If model has almost no color (very white or no colors at all)
		// ONLY then add colors (less aggressive than before)
		if (coloredMeshCount / Math.max(1, totalMeshCount) < 0.1) {
			console.log("Model has almost no colors, adding basic colors");

			// Use a more limited palette with fewer colors for consistency
			const palette = [
				new THREE.Color(0xf44336), // Red
				new THREE.Color(0x2196f3), // Blue
				new THREE.Color(0x4caf50), // Green
				new THREE.Color(0xff9800), // Orange
				new THREE.Color(0x9c27b0), // Purple
				new THREE.Color(0x00bcd4), // Cyan
			];

			let colorIndex = 0;
			model.traverse((obj) => {
				if (obj instanceof THREE.Mesh) {
					// Only change colors of white or very light materials
					const isWhiteMaterial = (mat: THREE.Material) => {
						return (
							"color" in mat &&
							mat.color instanceof THREE.Color &&
							mat.color.r > 0.9 &&
							mat.color.g > 0.9 &&
							mat.color.b > 0.9
						);
					};

					// Process materials
					if (Array.isArray(obj.material)) {
						obj.material.forEach((mat, idx) => {
							if (isWhiteMaterial(mat)) {
								mat.color.set(
									palette[(colorIndex + idx) % palette.length]
								);
							}
						});
						colorIndex++;
					} else if (isWhiteMaterial(obj.material)) {
						obj.material.color.set(
							palette[colorIndex % palette.length]
						);
						colorIndex++;
					}
				}
			});
		}
	}

	/**
	 * Get the model name from the file
	 * @param file The uploaded file
	 * @returns A sanitized model name
	 */
	public static getModelNameFromFile(file: File): string {
		// Remove extension and sanitize the filename
		return file.name
			.replace(/\.[^/.]+$/, "") // Remove extension
			.replace(/[^a-zA-Z0-9-_]/g, "-") // Replace non-alphanumeric chars with dash
			.substring(0, 32); // Limit length
	}
}
