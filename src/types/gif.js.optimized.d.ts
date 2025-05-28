declare module "gif.js.optimized" {
	interface GIFOptions {
		workers?: number;
		quality?: number;
		workerScript?: string;
		width?: number;
		height?: number;
		background?: string; // hex color
		dither?: boolean | string; // e.g., 'FloydSteinberg-serpentine'
		debug?: boolean;
		transparent?: string | null; // hex color, null for transparent if alpha channel exists
		repeat?: number; // 0 for loop, -1 for no loop
	}

	interface GIFFrameOptions {
		delay?: number;
		copy?: boolean; // If true, copies the pixels from the given ImageData/Canvas/Context
		palette?: number[] | Uint8Array; // Global Color Table for this frame, or null for global GCT
		disposal?: number; // 1 = No disposal specified, 2 = Do not dispose, 3 = Restore to background, 4-7 = To be defined
	}

	class GIF {
		constructor(options: GIFOptions);
		addFrame(
			image: CanvasImageSource | ImageData,
			options?: GIFFrameOptions
		): void;
		on(event: "finished", callback: (blob: Blob) => void): void;
		on(event: "progress", callback: (progress: number) => void): void;
		on(event: "abort", callback: () => void): void;
		render(): void;
		abort(): void;
	}

	export default GIF;
}
