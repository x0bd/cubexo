import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter";

/**
 * Download a Three.js scene as a GLB file
 */
export async function downloadGLB(
	scene: THREE.Scene,
	filename: string
): Promise<void> {
	return new Promise((resolve, reject) => {
		try {
			const exporter = new GLTFExporter();

			exporter.parse(
				scene,
				(buffer) => {
					saveArrayBuffer(buffer as ArrayBuffer, `${filename}.glb`);
					resolve();
				},
				(error) => {
					console.error("GLB Export Error:", error);
					reject(error);
				},
				{ binary: true }
			);
		} catch (error) {
			console.error("Export preparation error:", error);
			reject(error);
		}
	});
}

/**
 * Save an array buffer as a file download
 */
function saveArrayBuffer(buffer: ArrayBuffer, filename: string): void {
	const blob = new Blob([buffer], { type: "application/octet-stream" });
	const link = document.createElement("a");
	link.href = URL.createObjectURL(blob);
	link.download = filename;
	link.click();
	URL.revokeObjectURL(link.href);
}
