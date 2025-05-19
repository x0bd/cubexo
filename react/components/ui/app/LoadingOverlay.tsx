"use client";

import { useEffect, useRef } from "react";
import { useVoxelStore } from "@/store/voxelStore";
import gsap from "gsap";
import { LoaderIcon } from "@/components/ui/icons";

export default function LoadingOverlay() {
	const isLoading = useVoxelStore((state) => state.isLoading);
	const overlayRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const overlay = overlayRef.current;
		const content = contentRef.current;

		if (!overlay || !content) return;

		if (isLoading) {
			// Show overlay with animation
			gsap.set(overlay, { display: "flex" });

			// Fade in overlay
			gsap.fromTo(
				overlay,
				{ opacity: 0 },
				{ opacity: 1, duration: 0.3, ease: "power2.inOut" }
			);

			// Animate content
			gsap.fromTo(
				content,
				{ opacity: 0, y: 20 },
				{
					opacity: 1,
					y: 0,
					duration: 0.5,
					delay: 0.2,
					ease: "power3.out",
				}
			);

			// Start progress animation
			const progress = overlay.querySelector(
				".progress-bar"
			) as HTMLElement;
			if (progress) {
				// Create pulsing animation for progress bar
				gsap.fromTo(
					progress,
					{ scaleX: 0 },
					{
						scaleX: 0.7,
						duration: 1.5,
						repeat: -1,
						yoyo: true,
						ease: "power2.inOut",
					}
				);
			}

			// Create subtle floating animation for content
			gsap.to(content, {
				y: "-8px",
				duration: 1.8,
				repeat: -1,
				yoyo: true,
				ease: "power1.inOut",
			});

			// Spin the loader icon
			const loaderIcon = overlay.querySelector(
				".loader-icon"
			) as HTMLElement;
			if (loaderIcon) {
				gsap.to(loaderIcon, {
					rotation: 360,
					duration: 2,
					repeat: -1,
					ease: "none",
				});
			}
		} else {
			// Hide overlay with animation if it's visible
			if (overlay.style.display !== "none") {
				gsap.to(overlay, {
					opacity: 0,
					duration: 0.5,
					ease: "power2.inOut",
					onComplete: () => {
						gsap.set(overlay, { display: "none" });
					},
				});
			}
		}
	}, [isLoading]);

	return (
		<div
			ref={overlayRef}
			className="fixed inset-0 bg-background/90 backdrop-blur-md z-50 items-center justify-center"
			style={{ display: "none" }}
		>
			<div
				ref={contentRef}
				className="flex flex-col items-center gap-6 p-8 max-w-md text-center"
			>
				<div className="loader-icon size-12 text-primary">
					<LoaderIcon className="size-full" />
				</div>

				<h2 className="text-xl font-semibold">Loading Voxel Models</h2>
				<p className="text-muted-foreground">
					Please wait while we prepare your voxel models. This might
					take a moment...
				</p>

				<div className="w-full h-1 bg-secondary/30 rounded-full overflow-hidden mt-2">
					<div
						className="progress-bar h-full bg-primary/70 origin-left"
						style={{ transform: "scaleX(0)" }}
					/>
				</div>
			</div>
		</div>
	);
}
