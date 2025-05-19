"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useVoxelStore } from "@/store/voxelStore";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import gsap from "gsap";
import { animations } from "@/utils/animations";

export default function ExportButton() {
	const [exporting, setExporting] = useState(false);
	const models = useVoxelStore((state) => state.models);
	const activeModelIndex = useVoxelStore((state) => state.activeModelIndex);
	const buttonRef = useRef<HTMLButtonElement>(null);

	// Add hover animations using GSAP
	useEffect(() => {
		const button = buttonRef.current;
		if (!button) return;

		// Create hover animation - EXACTLY like vanilla
		gsap.set(button, { scale: 1 });

		const enterAnimation = () => {
			gsap.to(button, { scale: 1.05, duration: 0.3, ease: "power2.out" });
		};

		const leaveAnimation = () => {
			gsap.to(button, { scale: 1, duration: 0.3, ease: "power2.out" });
		};

		const downAnimation = () => {
			gsap.to(button, { scale: 0.95, duration: 0.2, ease: "power2.out" });
		};

		const upAnimation = () => {
			gsap.to(button, { scale: 1.05, duration: 0.2, ease: "power2.out" });
		};

		// Add event listeners
		button.addEventListener("mouseenter", enterAnimation);
		button.addEventListener("mouseleave", leaveAnimation);
		button.addEventListener("mousedown", downAnimation);
		button.addEventListener("mouseup", upAnimation);

		// Cleanup
		return () => {
			button.removeEventListener("mouseenter", enterAnimation);
			button.removeEventListener("mouseleave", leaveAnimation);
			button.removeEventListener("mousedown", downAnimation);
			button.removeEventListener("mouseup", upAnimation);
		};
	}, []);

	// Initial entrance animation
	useEffect(() => {
		const button = buttonRef.current;
		if (!button) return;

		gsap.fromTo(
			button,
			{ opacity: 0, y: 20 },
			{
				opacity: 1,
				y: 0,
				duration: 0.6,
				delay: 0.5,
				ease: "elastic.out(1, 0.7)",
			}
		);
	}, []);

	const handleExport = async () => {
		if (models.length === 0 || exporting) return;

		const activeModel = models[activeModelIndex];
		if (!activeModel) return;

		// Button animation on click
		const button = buttonRef.current;
		if (button) {
			gsap.timeline()
				.to(button, { scale: 0.9, duration: 0.1 })
				.to(button, {
					scale: 1,
					duration: 0.3,
					ease: "elastic.out(1.2, 0.5)",
				});
		}

		setExporting(true);
		try {
			await downloadGLB(activeModel, activeModel.name || "voxel-model");
			// Show export notification - EXACTLY like vanilla
			showExportNotification();
		} catch (error) {
			console.error("Export failed:", error);
			showExportNotification("Export failed");
		} finally {
			setExporting(false);
		}
	};

	/**
	 * Display a clean, minimal notification when exporting - EXACTLY like vanilla
	 */
	const showExportNotification = (message: string = "Model exported") => {
		// Remove any existing notifications
		const existingNotification = document.querySelector(
			".export-notification"
		);
		if (existingNotification) {
			existingNotification.remove();
		}

		// Create notification element
		const notification = document.createElement("div");
		notification.className = "export-notification";

		// Add checkmark icon for success
		const checkIcon = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"svg"
		);
		checkIcon.setAttribute("width", "16");
		checkIcon.setAttribute("height", "16");
		checkIcon.setAttribute("viewBox", "0 0 24 24");
		checkIcon.setAttribute("fill", "none");
		checkIcon.setAttribute("stroke", "currentColor");
		checkIcon.setAttribute("stroke-width", "2");
		checkIcon.setAttribute("stroke-linecap", "round");
		checkIcon.setAttribute("stroke-linejoin", "round");

		const path = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"path"
		);
		path.setAttribute("d", "M20 6L9 17l-5-5");
		checkIcon.appendChild(path);

		// Text content
		const textSpan = document.createElement("span");
		textSpan.textContent = message;

		// Append elements
		notification.appendChild(checkIcon);
		notification.appendChild(textSpan);

		// Style the container for horizontal layout
		notification.style.display = "flex";
		notification.style.alignItems = "center";
		notification.style.gap = "6px";

		// Add to DOM
		document.body.appendChild(notification);

		// Remove after delay with fade-out animation
		setTimeout(() => {
			notification.classList.add("fade-out");
			notification.addEventListener("animationend", () => {
				notification.remove();
			});
		}, 2000);
	};

	return (
		<Button
			ref={buttonRef}
			variant="outline"
			size="sm"
			className="fixed bottom-4 left-4 rounded-full bg-background/80 backdrop-blur-sm shadow-md transform-gpu"
			onClick={handleExport}
			disabled={exporting || models.length === 0}
		>
			{exporting ? (
				<>
					<span className="animate-spin mr-2">
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<circle cx="12" cy="12" r="10" />
							<path d="M12 6v6l4 2" />
						</svg>
					</span>
					Exporting...
				</>
			) : (
				<>
					<span className="mr-2 inline-block">💾</span>
					Export GLB
				</>
			)}
		</Button>
	);
}

/**
 * Download a model as a GLB file
 */
async function downloadGLB(
	model: { name: string; voxels: any[] },
	filename: string
): Promise<void> {
	return new Promise((resolve, reject) => {
		try {
			// Create a scene with the voxel model
			const scene = new THREE.Scene();

			// Add voxels to the scene
			if (model.voxels && model.voxels.length > 0) {
				const geometry = new THREE.BoxGeometry(0.24, 0.24, 0.24);
				const material = new THREE.MeshStandardMaterial({
					roughness: 0.3,
					metalness: 0.01,
				});

				model.voxels.forEach((voxel) => {
					const mesh = new THREE.Mesh(geometry, material.clone());
					mesh.position.copy(voxel.position);
					if (voxel.color) {
						(mesh.material as THREE.MeshStandardMaterial).color =
							voxel.color;
					}
					scene.add(mesh);
				});
			}

			// Export the scene
			const exporter = new GLTFExporter();

			exporter.parse(
				scene,
				(buffer: any) => {
					saveArrayBuffer(buffer as ArrayBuffer, `${filename}.glb`);
					resolve();
				},
				(error: any) => {
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
