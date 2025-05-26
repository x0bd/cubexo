import * as THREE from "three";

export class AudioVisualizer {
	private audioContext: AudioContext | null = null;
	private audioElement: HTMLAudioElement | null = null;
	private audioSource: MediaElementAudioSourceNode | null = null;
	private analyzer: AnalyserNode | null = null;
	private dataArray: Uint8Array | null = null;
	private isPlaying: boolean = false;
	private reactivityFactor: number = 0.5; // Default 50%
	private callback: ((data: number[]) => void) | null = null;
	private animationFrameId: number | null = null;

	constructor() {
		// Audio Context is created on user interaction
		this.setupEventListeners();
	}

	/**
	 * Set up event listeners for the audio visualizer UI
	 */
	private setupEventListeners(): void {
		// Stop propagation on the entire audio panel
		const audioPanel = document.getElementById("audio-panel");
		if (audioPanel) {
			audioPanel.addEventListener("click", (e: Event) => {
				e.stopPropagation();
			});

			// Add keyboard event for Escape key
			document.addEventListener("keydown", (e: KeyboardEvent) => {
				if (
					e.key === "Escape" &&
					audioPanel.classList.contains("active")
				) {
					this.stop();
					this.hidePanel();
				}
			});
		}

		// Audio file input
		const audioFileInput = document.getElementById(
			"audio-file-input"
		) as HTMLInputElement;
		if (audioFileInput) {
			audioFileInput.addEventListener("change", (e) =>
				this.handleFileUpload(e)
			);
		}

		// Reactivity slider
		const reactivitySlider = document.getElementById(
			"reactivity-slider"
		) as HTMLInputElement;
		const reactivityValue = document.getElementById("reactivity-value");

		if (reactivitySlider) {
			reactivitySlider.addEventListener("input", () => {
				const value = parseInt(reactivitySlider.value);
				this.reactivityFactor = value / 100;

				if (reactivityValue) {
					reactivityValue.textContent = `${value}%`;
				}
			});
		}

		// Start button
		const startButton = document.getElementById("audio-start");
		if (startButton) {
			startButton.addEventListener("click", (e) => {
				e.stopPropagation();
				this.start();
			});
		}

		// Stop button
		const stopButton = document.getElementById("audio-stop");
		if (stopButton) {
			stopButton.addEventListener("click", (e) => {
				e.stopPropagation();
				this.stop();
			});
		}

		// Close panel button
		const closeButton = document.getElementById("close-audio-panel");
		if (closeButton) {
			closeButton.addEventListener("click", (e) => {
				e.stopPropagation();
				this.stop();
				this.hidePanel();
			});
		}

		// Backdrop click handler for closing
		const backdrop = document.getElementById("audio-backdrop");
		if (backdrop) {
			backdrop.addEventListener("click", () => {
				this.stop();
				this.hidePanel();
			});
		}

		// Drag and drop support for the dropzone
		const dropzone = document.querySelector(".file-dropzone");
		if (dropzone) {
			dropzone.addEventListener("dragover", (e: Event) => {
				e.preventDefault();
				e.stopPropagation();
				dropzone.classList.add("border-indigo-400");
			});

			dropzone.addEventListener("dragleave", () => {
				dropzone.classList.remove("border-indigo-400");
			});

			dropzone.addEventListener("drop", (e: Event) => {
				e.preventDefault();
				e.stopPropagation();
				dropzone.classList.remove("border-indigo-400");

				const dragEvent = e as DragEvent;
				if (
					dragEvent.dataTransfer &&
					dragEvent.dataTransfer.files.length > 0
				) {
					const file = dragEvent.dataTransfer.files[0];
					this.loadAudioFile(file);
				}
			});

			// Make sure any click inside the dropzone doesn't propagate
			dropzone.addEventListener("click", (e: Event) => {
				e.preventDefault();
				e.stopPropagation();

				// Trigger the file input when clicking on the dropzone
				const fileInput = document.getElementById(
					"audio-file-input"
				) as HTMLInputElement;
				if (fileInput) {
					fileInput.click();
				}
			});
		}
	}

	/**
	 * Handle file upload from the input element
	 */
	private handleFileUpload(event: Event): void {
		const input = event.target as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			this.loadAudioFile(input.files[0]);
		}
	}

	/**
	 * Load an audio file
	 */
	private loadAudioFile(file: File): void {
		// Check if file is an audio file
		if (!file.type.startsWith("audio/")) {
			console.error("Please upload an audio file");
			this.showNotification("Please upload an audio file", "error");
			return;
		}

		// Create an audio element if it doesn't exist
		if (!this.audioElement) {
			this.audioElement = new Audio();
			this.audioElement.controls = false;
		}

		// Create a URL for the file
		const objectURL = URL.createObjectURL(file);
		this.audioElement.src = objectURL;

		// Update UI
		const fileNameElement = document.querySelector(
			".file-dropzone span:first-of-type"
		);
		if (fileNameElement) {
			fileNameElement.textContent = file.name;
		}

		// Enable the start button
		const startButton = document.getElementById("audio-start");
		if (startButton) {
			startButton.removeAttribute("disabled");
			startButton.classList.remove("bg-zinc-800/90", "text-zinc-500");
			startButton.classList.add("bg-indigo-600/90", "text-zinc-200");
		}

		// Show notification
		this.showNotification(`Audio loaded: ${file.name}`);
	}

	/**
	 * Initialize the audio context and analyzer
	 */
	private initAudio(): void {
		if (!this.audioElement) {
			console.error("No audio element found");
			return;
		}

		// Create audio context if not already created
		if (!this.audioContext) {
			this.audioContext = new (window.AudioContext ||
				(window as any).webkitAudioContext)();
		}

		// Create analyzer
		this.analyzer = this.audioContext.createAnalyser();
		this.analyzer.fftSize = 256;
		const bufferLength = this.analyzer.frequencyBinCount;
		this.dataArray = new Uint8Array(bufferLength);

		// Connect audio source
		this.audioSource = this.audioContext.createMediaElementSource(
			this.audioElement
		);
		this.audioSource.connect(this.analyzer);
		this.analyzer.connect(this.audioContext.destination);
	}

	/**
	 * Start audio playback and visualization
	 */
	public start(): void {
		if (!this.audioElement || !this.audioElement.src) {
			this.showNotification("Please upload an audio file first", "error");
			return;
		}

		// Initialize audio context if needed
		if (!this.audioContext) {
			this.initAudio();
		}

		// Start playback
		this.audioElement
			.play()
			.then(() => {
				this.isPlaying = true;
				this.updateButtons(true);
				this.animate();
			})
			.catch((err) => {
				console.error("Error playing audio:", err);
				this.showNotification("Error playing audio", "error");
			});
	}

	/**
	 * Stop audio playback and visualization
	 */
	public stop(): void {
		if (this.audioElement && this.isPlaying) {
			this.audioElement.pause();
			this.audioElement.currentTime = 0;
			this.isPlaying = false;
			this.updateButtons(false);

			if (this.animationFrameId !== null) {
				cancelAnimationFrame(this.animationFrameId);
				this.animationFrameId = null;
			}

			// Reset any visualization
			if (this.callback) {
				this.callback(new Array(128).fill(0));
			}
		}
	}

	/**
	 * Update the UI button states
	 */
	private updateButtons(isPlaying: boolean): void {
		const startButton = document.getElementById("audio-start");
		const stopButton = document.getElementById("audio-stop");

		if (startButton) {
			if (isPlaying) {
				startButton.setAttribute("disabled", "true");
				startButton.classList.remove(
					"bg-indigo-600/90",
					"hover:bg-indigo-500/90",
					"text-zinc-200"
				);
				startButton.classList.add("bg-zinc-800/90", "text-zinc-500");
			} else {
				startButton.removeAttribute("disabled");
				startButton.classList.remove("bg-zinc-800/90", "text-zinc-500");
				startButton.classList.add(
					"bg-indigo-600/90",
					"hover:bg-indigo-500/90",
					"text-zinc-200"
				);
			}
		}

		if (stopButton) {
			if (isPlaying) {
				stopButton.removeAttribute("disabled");
				stopButton.classList.remove("bg-zinc-800/90", "text-zinc-500");
				stopButton.classList.add(
					"bg-rose-600/90",
					"hover:bg-rose-500/90",
					"text-zinc-200"
				);
			} else {
				stopButton.setAttribute("disabled", "true");
				stopButton.classList.remove(
					"bg-rose-600/90",
					"hover:bg-rose-500/90",
					"text-zinc-200"
				);
				stopButton.classList.add("bg-zinc-800/90", "text-zinc-500");
			}
		}
	}

	/**
	 * Animation loop for audio visualization
	 */
	private animate(): void {
		if (!this.isPlaying || !this.analyzer || !this.dataArray) return;

		// Get frequency data
		this.analyzer.getByteFrequencyData(this.dataArray);

		// Apply reactivity factor to the data
		const scaledData = Array.from(this.dataArray).map(
			(value) => value * this.reactivityFactor
		);

		// Call the callback with the data
		if (this.callback) {
			this.callback(scaledData);
		}

		// Update the waveform visualization in the UI
		this.updateWaveform(scaledData);

		// Continue animation loop
		this.animationFrameId = requestAnimationFrame(() => this.animate());
	}

	/**
	 * Update the waveform visualization in the UI
	 */
	private updateWaveform(data: number[]): void {
		const waveElements = document.querySelectorAll(
			".waveform-placeholder .wave span"
		);
		const step = Math.floor(data.length / waveElements.length);

		waveElements.forEach((element, index) => {
			const dataIndex = index * step;
			if (dataIndex < data.length) {
				const value = data[dataIndex];
				const height = Math.max(4, Math.min(70, (value / 255) * 70));
				(element as HTMLElement).style.height = `${height}px`;
			}
		});
	}

	/**
	 * Set a callback function to receive audio data
	 */
	public setCallback(callback: (data: number[]) => void): void {
		this.callback = callback;
	}

	/**
	 * Show the audio visualizer panel
	 */
	public showPanel(): void {
		const panel = document.getElementById("audio-panel");
		const backdrop = document.getElementById("audio-backdrop");

		if (panel) {
			panel.classList.add("active");
		}

		if (backdrop) {
			backdrop.classList.add("active");
		}

		// Reset the audio file input to ensure we can select the same file again
		const fileInput = document.getElementById(
			"audio-file-input"
		) as HTMLInputElement;
		if (fileInput) {
			fileInput.value = "";
		}
	}

	/**
	 * Hide the audio visualizer panel
	 */
	public hidePanel(): void {
		const panel = document.getElementById("audio-panel");
		const backdrop = document.getElementById("audio-backdrop");

		if (panel) {
			panel.classList.remove("active");
		}

		if (backdrop) {
			backdrop.classList.remove("active");
		}
	}

	/**
	 * Show a notification
	 */
	private showNotification(
		message: string,
		type: "success" | "error" = "success"
	): void {
		const event = new CustomEvent("show-notification", {
			detail: { message, type },
		});
		window.dispatchEvent(event);
	}

	/**
	 * Clean up resources
	 */
	public dispose(): void {
		this.stop();

		// Clean up audio resources
		if (this.audioSource) {
			this.audioSource.disconnect();
		}

		if (this.analyzer) {
			this.analyzer.disconnect();
		}

		if (this.audioContext) {
			this.audioContext.close();
		}

		// Clear audio element
		if (this.audioElement) {
			this.audioElement.src = "";
		}
	}
}
