import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export class ModelUploader {
	private gltfLoader: GLTFLoader;

	// Add callback for model upload
	public onModelUploaded:
		| ((model: THREE.Group, fileName: string) => void)
		| null = null;

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

					// Call the callback if defined
					if (this.onModelUploaded) {
						this.onModelUploaded(gltf.scene, file.name);
					}

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

		// Log original model dimensions for debugging
		console.log("ModelUploader - Original model dimensions:", {
			size: size,
			center: center,
		});

		// Calculate scale to normalize the model so its largest dimension is 1 (unit size)
		const maxDim = Math.max(size.x, size.y, size.z);
		let scale = 1.0; // Default scale if maxDim is 0 or invalid
		if (maxDim > 0) {
			scale = 1.0 / maxDim; // Normalize to unit size
		}

		console.log(
			"ModelUploader - Normalizing to unit size with scale factor:",
			scale
		);

		// Apply transformations to center and scale the model
		model.position.copy(center).multiplyScalar(-scale); // Center based on the new scale
		model.scale.set(scale, scale, scale); // Set scale to normalize

		// Log final model state
		console.log("ModelUploader - Final model position and scale:", {
			position: model.position,
			scale: model.scale,
		});

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

			// Log the RGB values for debugging
			console.log(
				"Material color found:",
				color.r.toFixed(2),
				color.g.toFixed(2),
				color.b.toFixed(2)
			);

			// Special handling for red colors - ensure they're preserved
			if (color.r > 0.7 && color.g < 0.3 && color.b < 0.3) {
				console.log("Red color detected and preserved");
				// Enhance red to make it more vibrant
				color.r = Math.max(color.r, 0.9);
				color.g = Math.min(color.g, 0.2);
				color.b = Math.min(color.b, 0.2);
			}

			// Special handling for white colors
			if (color.r > 0.9 && color.g > 0.9 && color.b > 0.9) {
				console.log("White color detected and preserved");
				color.setRGB(1, 1, 1); // Pure white
			}
		} else if (
			"emissive" in material &&
			material.emissive instanceof THREE.Color &&
			!material.emissive.equals(new THREE.Color(0x000000)) // Only use emissive if it's not black
		) {
			// MeshPhongMaterial and MeshStandardMaterial have emissive
			color = material.emissive.clone();
			console.log(
				"Using emissive color:",
				color.r.toFixed(2),
				color.g.toFixed(2),
				color.b.toFixed(2)
			);
		} else if ("map" in material && material.map) {
			// Check material name for color hints
			if (material.name) {
				const matName = material.name.toLowerCase();
				if (matName.includes("red")) {
					console.log("Red material name detected:", material.name);
					color.setRGB(0.95, 0.1, 0.1); // Vibrant red
					return new THREE.MeshStandardMaterial({
						color: color,
						roughness: 0.3,
						metalness: 0.2,
					});
				}
				if (matName.includes("white")) {
					console.log("White material name detected:", material.name);
					color.setRGB(1, 1, 1); // Pure white
					return new THREE.MeshStandardMaterial({
						color: color,
						roughness: 0.3,
						metalness: 0.2,
					});
				}
			}

			// If there's a texture, use a consistent color based on the texture
			// Generate a deterministic color from the texture
			let textureId = 0;
			const map = material.map as THREE.Texture;

			if (map && typeof map === "object" && "uuid" in map) {
				// Check texture name for color hints
				if (map.name) {
					const texName = map.name.toLowerCase();
					if (texName.includes("red")) {
						console.log("Red texture name detected:", map.name);
						color.setRGB(0.95, 0.1, 0.1); // Vibrant red
						return new THREE.MeshStandardMaterial({
							color: color,
							roughness: 0.3,
							metalness: 0.2,
						});
					}
					if (texName.includes("white")) {
						console.log("White texture name detected:", map.name);
						color.setRGB(1, 1, 1); // Pure white
						return new THREE.MeshStandardMaterial({
							color: color,
							roughness: 0.3,
							metalness: 0.2,
						});
					}
				}

				// Create a simple hash from the UUID string
				textureId = map.uuid
					.split("")
					.reduce((acc: number, char: string) => {
						return (acc << 5) - acc + char.charCodeAt(0);
					}, 0);

				// Bias towards red for certain hash values (40% chance)
				const hashMod = Math.abs(textureId % 100);
				if (hashMod < 40) {
					console.log("Selected red from hash bias");
					color.setRGB(0.95, 0.1, 0.1); // Vibrant red
				} else {
					// Generate a color based on the hash (consistent for same texture)
					const hue = Math.abs(textureId % 100) / 100;
					color = new THREE.Color().setHSL(hue, 0.85, 0.5);
				}
			} else {
				// Fallback to a random number if no UUID
				textureId = Math.floor(Math.random() * 100);
				// Generate a color based on the hash (consistent for same texture)
				const hue = Math.abs(textureId % 100) / 100;
				color = new THREE.Color().setHSL(hue, 0.85, 0.5);
			}
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
		let hasRedMesh = false;
		let hasWhiteMesh = false;

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
							// Check for red color
							if (c.r > 0.7 && c.g < 0.3 && c.b < 0.3) {
								hasRedMesh = true;
								coloredMeshCount++;
								console.log("Found red mesh in model");
								break;
							}
							// Check for white color
							else if (c.r > 0.9 && c.g > 0.9 && c.b > 0.9) {
								hasWhiteMesh = true;
								// Don't increment coloredMeshCount for white
								console.log("Found white mesh in model");
							}
							// Only count as colored if it's not close to white
							else if (!(c.r > 0.9 && c.g > 0.9 && c.b > 0.9)) {
								coloredMeshCount++;
								break;
							}
						}
					}
				}
			}
		});

		// Log statistics about the model's colors
		console.log(
			`Model color stats: ${coloredMeshCount}/${totalMeshCount} colored meshes (${(
				(coloredMeshCount / Math.max(1, totalMeshCount)) *
				100
			).toFixed(1)}%)`
		);
		console.log(
			`Has red meshes: ${hasRedMesh}, Has white meshes: ${hasWhiteMesh}`
		);

		// If model has almost no color (very white or no colors at all)
		// AND doesn't have red meshes (we don't want to override red)
		// ONLY then add colors (less aggressive than before)
		if (
			coloredMeshCount / Math.max(1, totalMeshCount) < 0.1 &&
			!hasRedMesh
		) {
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
		// If model has some colors but they're too subtle, enhance them
		// But ONLY if there are no red meshes (we don't want to override red)
		else if (
			coloredMeshCount / Math.max(1, totalMeshCount) < 0.3 &&
			!hasRedMesh
		) {
			console.log(
				"Model has some colors but they're subtle, enhancing saturation"
			);

			model.traverse((obj) => {
				if (obj instanceof THREE.Mesh) {
					const materials = Array.isArray(obj.material)
						? obj.material
						: [obj.material];

					materials.forEach((mat) => {
						if (
							"color" in mat &&
							mat.color instanceof THREE.Color
						) {
							const c = mat.color;

							// Skip white and red colors
							if (
								(c.r > 0.9 && c.g > 0.9 && c.b > 0.9) ||
								(c.r > 0.7 && c.g < 0.3 && c.b < 0.3)
							) {
								return;
							}

							// Convert to HSL to enhance saturation
							const hsl = { h: 0, s: 0, l: 0 };
							c.getHSL(hsl);

							// Boost saturation by 30% but cap at 0.9
							hsl.s = Math.min(0.9, hsl.s * 1.3);

							// Ensure lightness is not too dark or too light
							hsl.l = Math.max(0.3, Math.min(0.7, hsl.l));

							// Apply enhanced color
							c.setHSL(hsl.h, hsl.s, hsl.l);
						}
					});
				}
			});
		} else {
			console.log("Model has sufficient colors, not modifying colors");
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
