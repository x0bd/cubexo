	/**
	 * Setup effect buttons in the effects panel
	 */
	private setupEffectButtons(): void {
		// Setup shake effect button
		const shakeButton = document.getElementById("effect-shake");
		if (shakeButton) {
			shakeButton.addEventListener("click", () => {
				console.log("Applying shake effect");
				// Apply the shake effect to the current model
				this.viewer.applyShakeEffect();
				
				// Add active state to button
				shakeButton.classList.add("bg-indigo-700/90", "border-indigo-600/70");
				setTimeout(() => {
					shakeButton.classList.remove("bg-indigo-700/90", "border-indigo-600/70");
				}, 800); // Duration slightly longer than the effect
			});
		}

		// Setup explode effect button
		const explodeButton = document.getElementById("effect-explode");
		if (explodeButton) {
			explodeButton.addEventListener("click", () => {
				console.log("Applying explode effect");
				// Apply the explode effect to the current model
				this.viewer.applyExplodeEffect();
				
				// Add active state to button
				explodeButton.classList.add("bg-indigo-700/90", "border-indigo-600/70");
				setTimeout(() => {
					explodeButton.classList.remove("bg-indigo-700/90", "border-indigo-600/70");
				}, 900); // Duration slightly longer than the effect
			});
		}

		// Setup for other effect buttons will be added here in the future
		// Each effect will follow a similar pattern to the shake and explode effects
	}
