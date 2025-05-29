declare module "gifenc" {
	export interface GIFOptions {
		auto?: boolean;
		initialCapacity?: number;
	}

	export interface GIFFrameOptions {
		palette: number[][];
		first?: boolean;
		transparent?: boolean;
		transparentIndex?: number;
		delay?: number;
		repeat?: number;
		dispose?: number;
	}

	export interface GIFEncoder {
		writeFrame(
			index: Uint8Array,
			width: number,
			height: number,
			options?: Partial<GIFFrameOptions>
		): void;
		finish(): void;
		bytes(): Uint8Array;
		bytesView(): Uint8Array;
		writeHeader(): void;
		reset(): void;
		buffer: ArrayBuffer;
		stream: {
			writeByte(byte: number): void;
			writeBytes(
				array: Uint8Array,
				offset?: number,
				length?: number
			): void;
		};
	}

	export function GIFEncoder(options?: Partial<GIFOptions>): GIFEncoder;

	export function quantize(
		rgba: Uint8Array | Uint8ClampedArray,
		maxColors: number,
		options?: any
	): number[][];

	export function applyPalette(
		rgba: Uint8Array | Uint8ClampedArray,
		palette: number[][],
		options?: any
	): Uint8Array;

	export function nearestColorIndex(
		palette: number[][],
		pixel: number[]
	): number;

	export function nearestColorIndexWithDistance(
		palette: number[][],
		pixel: number[]
	): [number, number];
}
