import * as THREE from "three";
import { createNoise3D } from "simplex-noise";

interface VoxelPosition {
	p: THREE.Vector3;
	col: THREE.Color;
	d: number;
}

export class VoxelEarth {
	private span: number;
	private resolution: number;
	private voxelSize: number;
	private voxelEarth: THREE.InstancedMesh | null = null;
	private startingPositions: VoxelPosition[] = [];
	private dummy: THREE.Object3D;
	private noise3D: ReturnType<typeof createNoise3D>;
	private earthUpperlimit: number = 0.55;
	private cloudsLowerLimit: number = 0.95;

	constructor(span: number, resolution: number) {
		this.span = span;
		this.resolution = resolution;
		this.voxelSize = span / resolution;
		this.dummy = new THREE.Object3D();
		this.noise3D = createNoise3D();
	}

	public async init(): Promise<void> {
		// Calculate starting positions
		this.calculateStartingPositions();

		// Create instanced mesh
		const geometry = new THREE.BoxGeometry(
			this.voxelSize,
			this.voxelSize,
			this.voxelSize
		);
		const material = new THREE.MeshStandardMaterial();

		this.voxelEarth = new THREE.InstancedMesh(
			geometry,
			material,
			this.startingPositions.length
		);

		// Set initial positions and colors
		for (let i = 0; i < this.startingPositions.length; i++) {
			const voxel = this.startingPositions[i];

			this.dummy.position.set(voxel.p.x, voxel.p.y, voxel.p.z);
			this.dummy.updateMatrix();
			this.voxelEarth.setMatrixAt(i, this.dummy.matrix);
			this.voxelEarth.setColorAt(i, voxel.col);
		}

		this.voxelEarth.instanceMatrix.needsUpdate = true;
		this.voxelEarth.instanceColor!.needsUpdate = true;
	}

	private calculateStartingPositions(): void {
		for (let x = 0; x < this.resolution; x++) {
			for (let y = 0; y < this.resolution; y++) {
				for (let z = 0; z < this.resolution; z++) {
					const position = new THREE.Vector3(
						-this.span / 2 + x * this.voxelSize,
						-this.span / 2 + y * this.voxelSize,
						-this.span / 2 + z * this.voxelSize
					);

					const normD =
						Math.sqrt(
							position.x ** 2 + position.y ** 2 + position.z ** 2
						) /
						(this.span / 2);

					if (this.isOutsideBounds(normD)) continue;

					this.startingPositions.push({
						p: position.clone(),
						col: this.getInstanceColor(normD),
						d: normD,
					});
				}
			}
		}
	}

	private isOutsideBounds(normD: number): boolean {
		return (
			normD > 1 ||
			(normD > this.earthUpperlimit && normD < this.cloudsLowerLimit)
		);
	}

	private getInstanceColor(d: number): THREE.Color {
		// Define color bands
		const bands = {
			core: 0.2, // white to gold
			mantle: 0.4, // gold to red
			crust: 0.5, // red to brown
			surface: this.earthUpperlimit, // brown to green
			highAtmo: this.cloudsLowerLimit, // green to dark grey
			clouds: 1.0, // dark grey to white
		};

		// Define colors
		const colors = {
			white: new THREE.Color(0xffffff),
			gold: new THREE.Color(0xffcc00),
			red: new THREE.Color(0xff0000),
			brown: new THREE.Color(0x8b4513),
			green: new THREE.Color(0x00ff00),
			darkGrey: new THREE.Color(0x333333),
		};

		// Determine which band the distance falls into
		let color = new THREE.Color();

		if (d <= bands.core) {
			// core: white to gold
			const t = this.mapVal(d, 0, bands.core, 0, 1);
			color.copy(colors.white).lerp(colors.gold, t);
		} else if (d <= bands.mantle) {
			// mantle: gold to red
			const t = this.mapVal(d, bands.core, bands.mantle, 0, 1);
			color.copy(colors.gold).lerp(colors.red, t);
		} else if (d <= bands.crust) {
			// crust: red to brown
			const t = this.mapVal(d, bands.mantle, bands.crust, 0, 1);
			color.copy(colors.red).lerp(colors.brown, t);
		} else if (d <= bands.surface) {
			// surface: brown to green
			const t = this.mapVal(d, bands.crust, bands.surface, 0, 1);
			color.copy(colors.brown).lerp(colors.green, t);
		} else if (d <= bands.highAtmo) {
			// This band is skipped (no voxels)
			color.copy(colors.green);
		} else {
			// clouds: dark grey to white
			const t = this.mapVal(d, bands.highAtmo, bands.clouds, 0, 1);
			color.copy(colors.darkGrey).lerp(colors.white, t);
		}

		return color;
	}

	private getSimplexValue(
		p: THREE.Vector3,
		noiseZoom: number,
		t: number
	): number {
		return (
			this.noise3D(
				p.x * noiseZoom + t,
				p.y * noiseZoom + t,
				p.z * noiseZoom - t
			) *
				0.5 +
			0.5
		);
	}

	private mapVal(
		val: number,
		srcMin: number,
		srcMax: number,
		targetMin: number,
		targetMax: number
	): number {
		return (
			targetMin +
			((targetMax - targetMin) * (val - srcMin)) / (srcMax - srcMin)
		);
	}

	private getThresholdForDistance(normD: number): number {
		// For the Earth (inner core to surface)
		if (normD < this.earthUpperlimit) {
			// Scale threshold linearly from center (easier to see through near center)
			return this.mapVal(normD, 0, this.earthUpperlimit, 0.4, 0.7);
		}
		// For the clouds (outer layer)
		else if (normD >= this.cloudsLowerLimit) {
			// Higher threshold for clouds (more sparse)
			return 0.7;
		}
		// For the empty space between Earth and clouds
		else {
			// No voxels should be visible here (threshold above max possible noise)
			return 2.0;
		}
	}

	private smoothstep(edge0: number, edge1: number, x: number): number {
		// Scale, bias and saturate x to 0..1 range
		x = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
		// Evaluate polynomial
		return x * x * (3 - 2 * x);
	}

	private smoothstepSteep(
		edge0: number,
		edge1: number,
		x: number,
		power: number = 2
	): number {
		// Scale, bias and saturate x to 0..1 range
		x = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));

		// Apply power for steeper transition
		if (power !== 1) {
			x = Math.pow(x, power);
		}

		// Evaluate polynomial
		return x * x * (3 - 2 * x);
	}

	private getVoxelScale(
		noiseValue: number,
		threshold: number,
		steepness: number = 2
	): number {
		// Basic scaling - if below threshold, scale is 0
		if (noiseValue < threshold) return 0;

		// Smooth transition from threshold to 1.0
		const t = this.smoothstepSteep(threshold, 1.0, noiseValue, steepness);

		// Scale from 0.5 to 1.0 based on the smoothed value
		return 0.5 + t * 0.5;
	}

	public update(
		time: number,
		noiseZoom: number,
		threshold: number,
		cloudClumpage: number,
		steepness: number
	): void {
		if (!this.voxelEarth) return;

		// Rotate the voxel earth
		this.voxelEarth.rotation.x += 0.001;
		this.voxelEarth.rotation.y += 0.001;

		// Update all voxels based on simplex noise
		for (let i = 0; i < this.startingPositions.length; i++) {
			const voxel = this.startingPositions[i];

			// Get adaptive noiseZoom
			const adaptiveNoiseZoom =
				voxel.d >= this.cloudsLowerLimit
					? cloudClumpage * noiseZoom
					: noiseZoom;

			// Get the current noise value for this position
			const noiseValue = this.getSimplexValue(
				voxel.p,
				adaptiveNoiseZoom,
				time
			);

			// Get adaptive threshold based on distance
			const adaptiveThreshold = this.getThresholdForDistance(voxel.d);

			// Reset the dummy object transformation
			const scaleFactor = this.getVoxelScale(
				noiseValue,
				adaptiveThreshold,
				steepness
			);
			this.dummy.scale.set(scaleFactor, scaleFactor, scaleFactor);
			this.dummy.position.set(voxel.p.x, voxel.p.y, voxel.p.z);

			// Apply the filtering conditions
			if (noiseValue < adaptiveThreshold) {
				this.dummy.scale.set(0, 0, 0);
			}

			this.dummy.updateMatrix();
			this.voxelEarth.setMatrixAt(i, this.dummy.matrix);
		}

		this.voxelEarth.instanceMatrix.needsUpdate = true;
	}

	public getMesh(): THREE.InstancedMesh {
		if (!this.voxelEarth) {
			throw new Error("Voxel Earth not initialized");
		}
		return this.voxelEarth;
	}

	public dispose(): void {
		if (this.voxelEarth) {
			this.voxelEarth.geometry.dispose();
			if (Array.isArray(this.voxelEarth.material)) {
				this.voxelEarth.material.forEach((material) =>
					material.dispose()
				);
			} else {
				this.voxelEarth.material.dispose();
			}
		}
	}
}
