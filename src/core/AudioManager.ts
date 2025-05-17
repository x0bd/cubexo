import * as THREE from "three";

export class AudioManager {
	private listener: THREE.AudioListener;
	private backgroundSound: THREE.Audio | null = null;
	private soundFile = "/sounds/inspiring-cinematic-ambient-255033.mp3";
	private camera: THREE.Camera;
	private audioLoader: THREE.AudioLoader;
	private isLoaded: boolean = false;
	private volume: number = 0.75;

	constructor(camera: THREE.Camera) {
		this.camera = camera;
		this.listener = new THREE.AudioListener();
		this.camera.add(this.listener);
		this.audioLoader = new THREE.AudioLoader();
	}

	public async init(): Promise<void> {
		try {
			const buffer = await this.loadAudio(this.soundFile);
			this.setupBackgroundSound(buffer);
			this.isLoaded = true;
		} catch (error) {
			console.error("Failed to initialize audio:", error);
		}
	}

	private loadAudio(url: string): Promise<THREE.AudioBuffer> {
		return new Promise((resolve, reject) => {
			this.audioLoader.load(
				url,
				(buffer) => {
					resolve(buffer);
				},
				(xhr) => {
					console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
				},
				(error) => {
					console.error(
						"An error happened during the audio loading:",
						error
					);
					reject(error);
				}
			);
		});
	}

	private setupBackgroundSound(buffer: THREE.AudioBuffer): void {
		this.backgroundSound = new THREE.Audio(this.listener);
		this.backgroundSound.setBuffer(buffer);
		this.backgroundSound.setLoop(true);
		this.backgroundSound.setVolume(this.volume);
		this.backgroundSound.play();
	}

	public setVolume(volume: number): void {
		this.volume = Math.max(0, Math.min(1, volume));
		if (this.backgroundSound) {
			this.backgroundSound.setVolume(this.volume);
		}
	}

	public toggleMute(): void {
		if (this.backgroundSound) {
			if (this.backgroundSound.getVolume() > 0) {
				this.backgroundSound.setVolume(0);
			} else {
				this.backgroundSound.setVolume(this.volume);
			}
		}
	}

	public dispose(): void {
		if (this.backgroundSound) {
			this.backgroundSound.stop();
			// @ts-ignore - Private property access for proper cleanup
			this.backgroundSound.buffer = null;
		}

		if (this.listener) {
			this.camera.remove(this.listener);
		}
	}
}
