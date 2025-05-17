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

		// Try to get the color from the material
		if ("color" in material && material.color instanceof THREE.Color) {
			color = material.color;
		}

		// Check for map/texture based color
		if ("map" in material && material.map) {
			// If there's a texture, use a more vibrant base color
			color = new THREE.Color().setHSL(
				Math.random(), // Random hue
				0.8, // High saturation
				0.5 // Medium lightness
			);
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

				// Check if this mesh has a non-white, non-black color
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
							// If color is not grayscale (r=g=b) and not black/white
							if (
								!(c.r === c.g && c.g === c.b) &&
								c.r > 0.1 &&
								c.r < 0.9
							) {
								coloredMeshCount++;
								break;
							}
						}
					}
				}
			}
		});

		// If less than 30% of meshes have color, add vibrant colors
		if (coloredMeshCount / Math.max(1, totalMeshCount) < 0.3) {
			console.log("Model has few colors, adding vibrant colors");

			// Generate a color palette
			const palette = this.generateColorPalette(
				Math.min(6, Math.max(3, Math.ceil(totalMeshCount / 2)))
			);

			let colorIndex = 0;
			model.traverse((obj) => {
				if (obj instanceof THREE.Mesh) {
					// Assign a color from the palette
					const color = palette[colorIndex % palette.length];
					colorIndex++;

					if (Array.isArray(obj.material)) {
						obj.material.forEach((mat) => {
							if ("color" in mat) {
								mat.color.set(color);
							}
						});
					} else if ("color" in obj.material) {
						obj.material.color.set(color);
					}
				}
			});
		}
	}

	/**
	 * Generate a palette of vibrant, visually distinct colors
	 * @param count Number of colors to generate
	 * @returns Array of THREE.Color objects
	 */
	private generateColorPalette(count: number): THREE.Color[] {
		const palette: THREE.Color[] = [];

		// Start with some nice, vibrant colors
		const baseHues = [0, 0.1, 0.3, 0.5, 0.6, 0.8];

		for (let i = 0; i < count; i++) {
			// Use golden ratio to space out hues evenly
			const hue = baseHues[i % baseHues.length];
			const saturation = 0.7 + Math.random() * 0.3; // High saturation
			const lightness = 0.45 + Math.random() * 0.15; // Medium lightness

			palette.push(new THREE.Color().setHSL(hue, saturation, lightness));
		}

		return palette;
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
