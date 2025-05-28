import type { Voxel, ModelData } from "../types/types";
import { App } from "../App"; // For notifications

export class ModelUploader {
	private modelViewer: any; // VoxelModelViewer instance
	private modelSelector: any; // ModelSelector instance
	private fileInput: HTMLInputElement;
	private dropZone: HTMLElement;
	private nextUserUploadedModelIndex: number = 1000; // Start user model indices high to avoid clashes
	private app: App;

	constructor(modelViewer: any, modelSelector: any, app: App) {
		this.modelViewer = modelViewer;
		this.modelSelector = modelSelector;
		this.app = app;

		this.fileInput = document.getElementById(
			"file-input"
		) as HTMLInputElement;
		this.dropZone = document.getElementById("upload-panel") as HTMLElement; // Or your specific drop zone

		if (!this.fileInput || !this.dropZone) {
			console.error(
				"ModelUploader: File input or drop zone element not found."
			);
			return;
		}
		this.setupEventListeners();
	}

	private setupEventListeners(): void {
		this.fileInput.addEventListener(
			"change",
			this.handleFileSelect.bind(this)
		);
		this.dropZone.addEventListener(
			"dragover",
			this.handleDragOver.bind(this)
		);
		this.dropZone.addEventListener(
			"dragleave",
			this.handleDragLeave.bind(this)
		);
		this.dropZone.addEventListener("drop", this.handleFileDrop.bind(this));

		// Prevent clicks on dropzone from propagating to canvas if it's part of a panel
		this.dropZone.addEventListener("click", (e) => e.stopPropagation());
	}

	private handleDragOver(event: DragEvent): void {
		event.preventDefault();
		event.stopPropagation();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = "copy";
		}
		this.dropZone.classList.add("dragging-over");
	}

	private handleDragLeave(event: DragEvent): void {
		event.preventDefault();
		event.stopPropagation();
		this.dropZone.classList.remove("dragging-over");
	}

	private handleFileDrop(event: DragEvent): void {
		event.preventDefault();
		event.stopPropagation();
		this.dropZone.classList.remove("dragging-over");

		if (
			event.dataTransfer &&
			event.dataTransfer.files &&
			event.dataTransfer.files.length > 0
		) {
			const file = event.dataTransfer.files[0];
			this.processFile(file);
		}
	}

	private handleFileSelect(event: Event): void {
		const target = event.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			const file = target.files[0];
			this.processFile(file);
			// Reset file input to allow uploading the same file again
			this.fileInput.value = "";
		}
	}

	private processFile(file: File): void {
		if (
			!file.name.toLowerCase().endsWith(".glb") &&
			!file.name.toLowerCase().endsWith(".gltf")
		) {
			console.warn("Attempted to upload non-GLB/GLTF file:", file.name);
			this.app.showNotification(
				"Please upload a .glb or .gltf file.",
				"error"
			);
			return;
		}

		this.app.showNotification(`Processing ${file.name}...`, "info", 0); // Show indefinite loading
		this.dropZone.classList.add("processing"); // Add some visual feedback

		// Create a new Voxelizer Worker
		// Ensure your bundler (e.g., Vite) handles worker loading correctly.
		// For Vite, `new Worker(new URL('./relative/path/to/worker.ts', import.meta.url))` is common.
		const voxelizerWorker = new Worker(
			new URL("../workers/voxelizer.worker.ts", import.meta.url),
			{
				type: "module",
			}
		);

		const modelIndexToAssign = this.nextUserUploadedModelIndex++;
		const modelName = `user-model-${file.name.replace(
			/\.[^/.]+$/,
			""
		)}-${modelIndexToAssign}`;

		voxelizerWorker.onmessage = (event) => {
			const {
				status,
				voxels,
				modelName: nameFromWorker,
				modelIndex,
				message,
			} = event.data;
			console.log(
				"[MainThread] Received message from worker:",
				event.data
			);

			this.dropZone.classList.remove("processing");
			this.app.clearNotification(); // Clear processing notification

			if (status === "success") {
				this.app.showNotification(
					`${nameFromWorker} processed successfully! ${voxels.length} voxels.`,
					"success"
				);

				if (voxels.length === 0) {
					console.warn(
						`Voxelization of ${nameFromWorker} resulted in 0 voxels. Model will not be added.`
					);
					this.app.showNotification(
						`${nameFromWorker} resulted in an empty model. Please try another file or check model complexity.`,
						"error"
					);
					voxelizerWorker.terminate();
					return;
				}

				const modelData: ModelData = {
					name: nameFromWorker,
					model: null, // The GLTF scene is not directly passed back or stored here anymore
					voxels: voxels as Voxel[],
					url: "user-uploaded", // Or store a blob URL if needed for other purposes
					originalIndex: modelIndex,
				};

				// Add to VoxelModelViewer
				this.modelViewer.addVoxelsForModel(
					modelIndex,
					modelData.voxels
				);

				// Add to ModelSelector
				if (modelData.model) {
					// Only add to preview if there's an actual THREE.Group
					if (this.modelSelector.addModelToPreview) {
						this.modelSelector.addModelToPreview(
							modelData,
							modelIndex,
							true /*isUploaded*/
						);
					} else if (this.modelSelector.addModelPreview) {
						// Fallback to addModelPreview if addModelToPreview doesn't exist
						this.modelSelector.addModelPreview(
							modelData,
							modelIndex
						);
					}
				} else {
					// If there's no model (e.g., worker only sent voxels), create a basic preview scene
					// but we can't add a 3D model to it without the THREE.Group.
					// ModelSelector would need a way to represent voxel-only models in previews.
					this.modelSelector.createPreviewScene(modelIndex);
					// We could update the label of this preview scene to show the model name.
					const previewScene = this.modelSelector.previewScenes.find(
						(s: any) => s.userData.modelIdx === modelIndex
					);
					if (previewScene && previewScene.userData.element) {
						const labelEl =
							previewScene.userData.element.querySelector(
								".model-label"
							);
						if (labelEl) {
							let displayName = modelData.name;
							if (displayName.startsWith("user-model-")) {
								displayName = displayName.substring(
									"user-model-".length
								);
							}
							labelEl.textContent = displayName + " (Voxels)";
						}
						previewScene.userData.element.dataset.modelName =
							modelData.name;
					}
					console.warn(
						`ModelUploader: ${nameFromWorker} (index ${modelIndex}) has no THREE.Group. Preview will be basic.`
					);
				}

				// Optionally, switch to the newly uploaded model
				// this.modelViewer.setActiveModel(modelIndex);
				// this.modelSelector.setActiveModelIndex(modelIndex);
				// this.modelSelector.updateActivePreview();
			} else {
				console.error(
					`Error from voxelizer worker for ${nameFromWorker}:`,
					message
				);
				this.app.showNotification(
					`Error processing ${nameFromWorker}: ${message}`,
					"error"
				);
			}
			voxelizerWorker.terminate(); // Clean up the worker
		};

		voxelizerWorker.onerror = (error) => {
			console.error("[MainThread] Error in voxelizer worker:", error);
			this.dropZone.classList.remove("processing");
			this.app.clearNotification();
			this.app.showNotification(
				`A critical error occurred while processing ${file.name}.`,
				"error"
			);
			voxelizerWorker.terminate();
		};

		// Send file to worker
		// If your GLTFLoader in worker can handle File object directly, you might pass it.
		// Otherwise, convert to ArrayBuffer or a URL.
		const reader = new FileReader();
		reader.onload = (e) => {
			const fileArrayBuffer = e.target?.result as ArrayBuffer;
			if (fileArrayBuffer) {
				voxelizerWorker.postMessage(
					{
						fileArrayBuffer: fileArrayBuffer,
						fileName: file.name,
						modelIndex: modelIndexToAssign,
					},
					[fileArrayBuffer]
				); // Transfer ownership of ArrayBuffer for performance
			} else {
				this.app.showNotification(
					"Could not read file for processing.",
					"error"
				);
				this.dropZone.classList.remove("processing");
				voxelizerWorker.terminate();
			}
		};
		reader.onerror = () => {
			this.app.showNotification("Error reading file.", "error");
			this.dropZone.classList.remove("processing");
			voxelizerWorker.terminate();
		};
		reader.readAsArrayBuffer(file);
	}
}
