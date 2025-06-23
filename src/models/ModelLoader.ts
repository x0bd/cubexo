import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ModelData } from "../types/types";

export class ModelLoader {
	private gltfLoader: GLTFLoader;
	private modelURLs: string[] = [
		"/models/Flower.glb", // Flower model
	];

	constructor() {
		this.gltfLoader = new GLTFLoader();
	}

	public loadModel(
		url: string,
		callback: (model: THREE.Group) => void,
		errorCallback?: (error: any) => void
	): void {
		this.gltfLoader.load(
			url,
			(gltf) => {
				callback(gltf.scene);
			},
			undefined,
			(error) => {
				console.error(`Error loading model ${url}:`, error);
				if (errorCallback) errorCallback(error);
			}
		);
	}

	public getURLs(): string[] {
		return this.modelURLs;
	}

	public getModelNameFromUrl(url: string): string {
		// Extract the filename without extension from the URL
		const parts = url.split("/");
		const filename = parts[parts.length - 1];
		// Remove the file extension and decode URI components
		return decodeURIComponent(filename.split(".")[0]);
	}
}
