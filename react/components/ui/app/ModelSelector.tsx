"use client";

import { useEffect, useRef } from "react";
import { useVoxelStore } from "@/store/voxelStore";
import gsap from "gsap";

export default function ModelSelector() {
	const models = useVoxelStore((state) => state.models);
	const activeModelIndex = useVoxelStore((state) => state.activeModelIndex);
	const setActiveModelIndex = useVoxelStore(
		(state) => state.setActiveModelIndex
	);
	const containerRef = useRef<HTMLDivElement>(null);

	// Initialize with fade-in animation - EXACTLY like vanilla
	useEffect(() => {
		if (!containerRef.current || !models.length) return;

		// Animate container in
		gsap.fromTo(
			containerRef.current,
			{ opacity: 0, y: 20 },
			{ opacity: 1, y: 0, duration: 0.8, ease: "power2.out" }
		);

		// Highlight active model
		const activeButton = containerRef.current.querySelector(
			`.model-button[data-idx="${activeModelIndex}"]`
		) as HTMLElement;
		if (activeButton) {
			gsap.to(activeButton, {
				backgroundColor: "rgba(0, 0, 0, 0.2)",
				color: "#fff",
				duration: 0.3,
			});
		}
	}, [models.length, activeModelIndex]);

	// Handle model selection
	const handleModelSelect = (index: number) => {
		if (index === activeModelIndex) return;

		// Animate the scene transition - using event-based approach like vanilla
		const sceneContainer = document.getElementById("scene-container");
		if (sceneContainer) {
			// First fade out
			gsap.to(sceneContainer, {
				opacity: 0,
				scale: 0.95,
				duration: 0.4,
				ease: "power2.in",
				onComplete: () => {
					// Change model
					setActiveModelIndex(index);

					// Then fade back in
					gsap.to(sceneContainer, {
						opacity: 1,
						scale: 1,
						duration: 0.6,
						ease: "elastic.out(1, 0.7)",
					});
				},
			});

			// Update button styles - EXACTLY like vanilla style
			if (containerRef.current) {
				// Remove active class from current button
				const currentButton = containerRef.current.querySelector(
					`.model-button[data-idx="${activeModelIndex}"]`
				) as HTMLElement;
				if (currentButton) {
					gsap.to(currentButton, {
						backgroundColor: "rgba(255, 255, 255, 0.1)",
						color: "rgba(255, 255, 255, 0.7)",
						duration: 0.3,
					});
				}

				// Add active class to new button
				const newButton = containerRef.current.querySelector(
					`.model-button[data-idx="${index}"]`
				) as HTMLElement;
				if (newButton) {
					gsap.to(newButton, {
						backgroundColor: "rgba(0, 0, 0, 0.2)",
						color: "#fff",
						duration: 0.3,
					});
				}
			}
		} else {
			// Fallback if container not found
			setActiveModelIndex(index);
		}
	};

	// Exit if no models
	if (!models.length) return null;

	return (
		<div
			ref={containerRef}
			className="fixed bottom-4 left-0 right-0 flex justify-center gap-2 z-10"
		>
			<div className="bg-background/30 backdrop-blur-md border-border border rounded-full p-1 px-2 flex gap-2 shadow-lg">
				{models.map((model, index) => (
					<button
						key={model.name}
						data-idx={index}
						data-model-name={model.name}
						className={`model-button px-4 py-2 rounded-full transition-colors relative ${
							index === activeModelIndex
								? "text-foreground font-medium"
								: "text-muted-foreground"
						}`}
						style={{
							backgroundColor:
								index === activeModelIndex
									? "rgba(0, 0, 0, 0.2)"
									: "rgba(255, 255, 255, 0.1)",
						}}
						onClick={() => handleModelSelect(index)}
					>
						{model.name}
					</button>
				))}
			</div>
		</div>
	);
}
