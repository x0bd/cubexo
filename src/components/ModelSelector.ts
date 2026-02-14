
import type { ModelData } from "../types/types";

// Helper function (can be outside the class or a static method if preferred)
// This is similar to the one in VoxelModelViewer but operates on THREE.Group
// THIS FUNCTION IS NO LONGER USED FOR PREVIEWS if static images are used.
// It might still be useful if you have other places where you need to center/scale models in a scene.


export class ModelSelector {
	private selectorElement: HTMLElement | null;
	// private previewScenes: THREE.Scene[] = []; // Will be replaced or re-purposed if needed
	private previewElements: HTMLElement[] = []; // To store references to the preview DOM elements
	private previewWidth = 130;
	private previewHeight = 130;
	private activeModelIdx = 0;
	// private renderer: THREE.WebGLRenderer; // This renderer was for previews, will be removed
	private modelSelectedCallback:
		| ((oldIndex: number, newIndex: number) => void)
		| null = null;

	private models: ModelData[] = [];

	constructor() {
		this.selectorElement = document.getElementById("selector");

		// The dedicated preview renderer is no longer needed for static images.
		// If this renderer was shared with the main scene, this removal needs reconsideration.
		// Assuming it was only for previews based on previous context.
		// const rendererElement = document.getElementById("preview-renderer-container");
		// if (rendererElement) {
		// 	rendererElement.remove();
		// }
	}

	public init(callback: (oldIndex: number, newIndex: number) => void): void {
		this.modelSelectedCallback = callback;
		// this.updateSceneSize(); // No longer needed for static image previews
		// this.startRenderingPreviews(); // No longer needed for static image previews

		// Theme change listener for scene backgrounds is no longer directly applicable
		// to img previews unless we style image borders/backgrounds based on theme.
		// window.addEventListener("themechange", (e: Event) => {
		// 	const customEvent = e as CustomEvent;
		// 	const isDark = customEvent.detail?.theme === "dark";
		// 	// this.updateImagePreviewStyles(isDark); // Placeholder for potential style updates
		// });
	}

	/**
	 * Update scene backgrounds when theme changes - NO LONGER USED FOR PREVIEWS
	 */
	// private updateSceneBackgrounds(isDark: boolean): void {
	// 	const bgColor = new THREE.Color(isDark ? 0x18181b : 0x27272a);
	// this.previewScenes.forEach((scene) => { // Not applicable to image previews
	// 	scene.background = bgColor;
	// });
	// }

	// This method is being repurposed/renamed. Originally `addModelPreview`.
	// It now more directly handles adding the model data and updating the static preview element.
	public addModelDataAndUpdatePreview(
		modelData: ModelData,
		modelIdx: number
	): void {
		this.models[modelIdx] = modelData; // Store original model data for the main viewer

		const previewElement = this.previewElements[modelIdx];

		if (previewElement) {
			previewElement.dataset.modelName = modelData.name;
			const labelEl = previewElement.querySelector(
				".model-label"
			) as HTMLElement;
			if (labelEl) {
				let displayName = modelData.name;
				if (displayName.startsWith("user-model-")) {
					displayName = displayName.substring("user-model-".length);
				}
				labelEl.textContent = displayName;
			}

			const imgEl = previewElement.querySelector(
				"img"
			) as HTMLImageElement;
			if (imgEl) {
				// Placeholder image source. Replace with actual image paths.
				// Example: imgEl.src = `/path/to/images/${modelData.name}.png`;
				// Using placehold.co for demonstration
				const imageName = encodeURIComponent(
					modelData.name.replace(/[^a-zA-Z0-9_]/g, "_") ||
						`model_${modelIdx}`
				);
				imgEl.src = `https://placehold.co/${this.previewWidth}x${this.previewHeight}/27272a/e5e5e5?text=${imageName}`;
				imgEl.alt = modelData.name;
			}
		} else {
			console.warn(
				`Preview element for model index ${modelIdx} not found.`
			);
		}
	}

	// This method replaces the old `createPreviewScene`
	public createPreviewElement(modelIdx: number): HTMLElement {
		// Create preview element with updated Tailwind classes for our aesthetic
		const element = document.createElement("div");
		// Base classes for the preview item container
		element.className =
			"model-preview-item w-[130px] h-[130px] bg-zinc-800/50 border border-zinc-700/50 rounded-lg overflow-hidden cursor-pointer relative transition-all duration-200 hover:scale-105 hover:shadow-lg hover:border-zinc-600/70 group flex flex-col items-center justify-center";
		element.dataset.modelIdx = modelIdx.toString();
		element.dataset.modelName = `model-${modelIdx}-placeholder`; // Initial placeholder name

		// Image element
		const imgEl = document.createElement("img");
		imgEl.className = "w-full h-full object-cover"; // Ensure image covers the area
		// Placeholder until actual model data is added
		imgEl.src = `https://placehold.co/${this.previewWidth}x${this.previewHeight}/18181b/444?text=Loading...`;
		imgEl.alt = `Preview for Model ${modelIdx + 1}`;
		element.appendChild(imgEl);

		// Add label element with improved Japanese-inspired styling
		const labelEl = document.createElement("div");
		labelEl.className =
			"model-label absolute bottom-0 left-0 right-0 py-1 px-1.5 text-[10px] jp tracking-wide uppercase text-center bg-zinc-900/80 backdrop-blur-sm border-t border-zinc-700/40 text-zinc-300 transform translate-y-full group-hover:translate-y-0 transition-transform duration-200";
		labelEl.textContent = `Model ${modelIdx + 1}`; // Default label
		element.appendChild(labelEl);

		// Make sure the element is clickable
		element.style.pointerEvents = "auto";

		// Add click handler
		element.addEventListener("click", (e) => {
			const oldIndex = this.activeModelIdx;
			this.activeModelIdx = modelIdx;
			this.updateActivePreview();

			if (this.modelSelectedCallback) {
				console.log(`Model preview clicked: ${oldIndex} → ${modelIdx}`);
				this.modelSelectedCallback(oldIndex, this.activeModelIdx);
			}
			e.stopPropagation();
		});

		// Store element
		this.previewElements[modelIdx] = element;

		// Add to selector
		if (this.selectorElement) {
			this.selectorElement.appendChild(element);
		}
		return element;
	}

	// The old addModelToPreview is replaced by addModelDataAndUpdatePreview
	// public addModelToPreview(modelData: ModelData, modelIdx: number): void { ... }

	// The old addModelToScene was for the 3D previews and is no longer needed in this context.
	// private addModelToScene( ... ): void { ... }

	private updateActivePreview(): void {
		this.previewElements.forEach((element, index) => {
			if (!element) return;

			const isActive = index === this.activeModelIdx;
			// Ensure class names match what's set in createPreviewElement
			const baseClasses =
				"model-preview-item w-[130px] h-[130px] bg-zinc-800/50 border rounded-lg overflow-hidden cursor-pointer relative transition-all duration-200 hover:scale-105 hover:shadow-lg group flex flex-col items-center justify-center";
			const borderBase = "border-zinc-700/50 hover:border-zinc-600/70";
			const activeBorder =
				"border-indigo-500 dark:border-indigo-500 ring-2 ring-indigo-500/30 dark:ring-indigo-500/30 shadow-md";

			if (isActive) {
				element.className = `${baseClasses} ${activeBorder}`;
			} else {
				element.className = `${baseClasses} ${borderBase}`;
			}
		});
	}

	// This was for 3D previews, no longer needed for static images.
	// private updateSceneSize(): void { ... }

	// This was for 3D previews, no longer needed for static images.
	// private startRenderingPreviews(): void { ... }

	public getActiveModelIndex(): number {
		return this.activeModelIdx;
	}

	public setActiveModelIndex(index: number): void {
		this.activeModelIdx = index;
		this.updateActivePreview();
	}

	/**
	 * Store model data in the models array
	 * This allows us to keep track of models without needing the preview UI
	 */
	public storeModelData(modelData: ModelData, modelIdx: number): void {
		this.models[modelIdx] = modelData;
		console.log(
			`Model data stored at index ${modelIdx}: ${modelData.name}`
		);
	}

	public setupModelCycling(): void {
		const prevButton = document.getElementById("prev-model");
		const nextButton = document.getElementById("next-model");

		if (prevButton) {
			// Hide prev button since we only have one model
			prevButton.style.display = "none";
		}

		if (nextButton) {
			// Hide next button since we only have one model
			nextButton.style.display = "none";
		}
	}

	public setupModelPreviews(): void {
		const panelToggle = document.getElementById("toggle-model-panel");
		const selectorContainer = document.getElementById("selector-container");

		if (panelToggle && selectorContainer) {
			// Hide model panel toggle since we only have one model
			panelToggle.style.display = "none";

			// Hide the selector container as well
			selectorContainer.style.display = "none";
		}
	}
}
