"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export default function TestCube() {
	const meshRef = useRef<THREE.Mesh>(null);

	useFrame(() => {
		if (meshRef.current) {
			meshRef.current.rotation.x += 0.01;
			meshRef.current.rotation.y += 0.01;
		}
	});

	return (
		<mesh ref={meshRef} position={[0, 0, 0]} castShadow receiveShadow>
			<boxGeometry args={[3, 3, 3]} />
			<meshStandardMaterial color="hotpink" />
		</mesh>
	);
}
