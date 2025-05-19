"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import { Suspense, useEffect, useRef, useState } from "react";
import VoxelModel from "./VoxelModel";
import Lighting from "./Lighting";
import { useVoxelStore } from "@/store/voxelStore";
import { useTheme } from "next-themes";
import gsap from "gsap";
import * as THREE from "three";

export default function VoxelScene() {
	const { theme } = useTheme();
	const activeModelIndex = useVoxelStore((state) => state.activeModelIndex);
	const loadDefaultModels = useVoxelStore((state) => state.loadDefaultModels);
	const containerRef = useRef<HTMLDivElement>(null);
	const [bgColor, setBgColor] = useState("#ffffff");

	// Load default models on component mount
	useEffect(() => {
		loadDefaultModels();
	}, [loadDefaultModels]);

	// Handle theme changes
	useEffect(() => {
		// Only update after component is mounted
		if (!containerRef.current) return;

		// Update background color based on theme (pure black/white for Vercel style)
		const isDark = theme === "dark";
		const newColor = isDark ? "#000000" : "#ffffff";
		setBgColor(newColor);

		// Animate background color change
		gsap.to(containerRef.current, {
			backgroundColor: newColor,
			duration: 0.5,
		});

		// Dispatch theme-changed event for compatibility with vanilla
		const event = new CustomEvent("theme-changed", {
			detail: { isDark },
		});
		window.dispatchEvent(event);
	}, [theme]);

	// Animate scene container on mount
	useEffect(() => {
		if (!containerRef.current) return;

		gsap.fromTo(
			containerRef.current,
			{ opacity: 0 },
			{ opacity: 1, duration: 1, ease: "power2.out", delay: 0.3 }
		);
	}, []);

	return (
		<div
			id="scene-container"
			ref={containerRef}
			className="w-full h-full"
			style={{ opacity: 0 }} // Start invisible for animation
		>
			<Canvas
				shadows={{
					enabled: true,
					type: THREE.PCFSoftShadowMap,
				}}
				camera={{
					position: [0, 5, 20],
					fov: 35,
					near: 0.1,
					far: 1000,
				}}
				gl={{
					antialias: true,
					alpha: true,
					outputColorSpace: THREE.SRGBColorSpace,
					toneMapping: THREE.ACESFilmicToneMapping,
					toneMappingExposure: 1.2,
				}}
				dpr={Math.min(window.devicePixelRatio, 2)}
			>
				<color attach="background" args={[bgColor]} />

				<Suspense fallback={null}>
					<VoxelModel modelIndex={activeModelIndex} />
					<Lighting />
					<Environment preset="city" />
				</Suspense>

				<OrbitControls
					enableDamping
					dampingFactor={0.05}
					enablePan={false}
					minDistance={15}
					maxDistance={25}
					minPolarAngle={0.3}
					maxPolarAngle={Math.PI * 0.6}
					autoRotate={false}
					autoRotateSpeed={0.5}
				/>
			</Canvas>
		</div>
	);
}
