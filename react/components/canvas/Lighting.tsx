"use client";

import { useRef, useEffect } from "react";
import * as THREE from "three";
import { useTheme } from "next-themes";
import { useFrame } from "@react-three/fiber";

export default function Lighting() {
	const { theme } = useTheme();
	const lightHolderRef = useRef<THREE.Group>(null);
	const shadowPlaneRef = useRef<THREE.Mesh>(null);
	const mainLightRef = useRef<THREE.DirectionalLight>(null);

	// Update lighting based on theme
	useEffect(() => {
		if (!shadowPlaneRef.current) return;

		// Determine if dark mode is active
		const isDark = theme === "dark";

		// Adjust shadow opacity based on theme
		if (shadowPlaneRef.current.material instanceof THREE.ShadowMaterial) {
			shadowPlaneRef.current.material.opacity = isDark ? 0.06 : 0.1;
			shadowPlaneRef.current.material.needsUpdate = true;
		}
	}, [theme]);

	// Make lights follow camera
	useFrame(({ camera }) => {
		if (lightHolderRef.current) {
			lightHolderRef.current.quaternion.copy(camera.quaternion);
		}
	});

	return (
		<group ref={lightHolderRef}>
			{/* Ambient light - EXACTLY like vanilla */}
			<ambientLight intensity={0.7} color="#ffffff" />

			{/* Main directional light with shadows - EXACTLY like vanilla */}
			<directionalLight
				ref={mainLightRef}
				castShadow
				position={[10, 15, 10]}
				intensity={1.0}
				shadow-mapSize={[1024, 1024]}
				shadow-bias={-0.0001}
			>
				<orthographicCamera
					attach="shadow-camera"
					args={[-15, 15, 15, -15, 0.1, 50]}
				/>
			</directionalLight>

			{/* Fill light - EXACTLY like vanilla */}
			<directionalLight position={[-10, 5, -5]} intensity={0.5} />

			{/* Shadow plane - EXACTLY like vanilla */}
			<mesh
				ref={shadowPlaneRef}
				position={[0, -4, 0]}
				rotation={[-Math.PI / 2, 0, 0]}
				receiveShadow
			>
				<planeGeometry args={[40, 40]} />
				<shadowMaterial
					transparent
					opacity={theme === "dark" ? 0.06 : 0.1}
				/>
			</mesh>
		</group>
	);
}
