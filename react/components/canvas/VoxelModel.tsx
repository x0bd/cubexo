"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useVoxelStore } from "@/store/voxelStore";
import gsap from "gsap";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

// Create a dummy object for matrix updates
const dummy = new THREE.Object3D();

const BOX_SIZE = 0.24;
const BOX_ROUNDNESS = 0.03;

interface VoxelModelProps {
	modelIndex: number;
}

export default function VoxelModel({ modelIndex }: VoxelModelProps) {
	const models = useVoxelStore((state) => state.models);
	const [prevModelIndex, setPrevModelIndex] = useState(modelIndex);
	const meshRef = useRef<THREE.InstancedMesh>(null);
	const [count, setCount] = useState(0);

	// Track voxel data for animations
	const voxels = useRef<
		{
			position: THREE.Vector3;
			color: THREE.Color;
		}[]
	>([]);

	// Create geometry once - use RoundedBoxGeometry for premium look
	const geometry = useMemo(() => {
		return new RoundedBoxGeometry(
			BOX_SIZE,
			BOX_SIZE,
			BOX_SIZE,
			3,
			BOX_ROUNDNESS
		);
	}, []);

	// Create enhanced material for better light reflection
	const material = useMemo(() => {
		return new THREE.MeshStandardMaterial({
			roughness: 0.3,
			metalness: 0.15,
			flatShading: false,
			envMapIntensity: 1.0,
		});
	}, []);

	// Initialize voxels on first load
	useEffect(() => {
		if (!models.length) return;

		// Find max voxel count across all models
		const maxVoxelCount = Math.max(
			...models.map((model) => model.voxels?.length || 0)
		);

		// Only initialize if we haven't already
		if (voxels.current.length === 0 && maxVoxelCount > 0) {
			const newVoxels = [];

			for (let i = 0; i < maxVoxelCount; i++) {
				// Initialize with random positions and white color
				newVoxels.push({
					position: new THREE.Vector3(
						(Math.random() - 0.5) * 3,
						(Math.random() - 0.5) * 3,
						(Math.random() - 0.5) * 3
					),
					color: new THREE.Color(1, 1, 1),
				});
			}

			voxels.current = newVoxels;

			// If we have a current model, set the count
			if (models[modelIndex]?.voxels) {
				setCount(models[modelIndex].voxels.length);
			}
		}
	}, [models, modelIndex]);

	// Handle model transitions when model index changes
	useEffect(() => {
		// Skip if no mesh, no models, or it's the first load (prevModelIndex === modelIndex)
		if (!meshRef.current || !models.length || modelIndex === prevModelIndex)
			return;

		const currentModel = models[modelIndex];
		const prevModel = models[prevModelIndex];

		if (!currentModel?.voxels) return;

		// 1. Animate model rotation during transition - EXACTLY like vanilla
		gsap.to(meshRef.current.rotation, {
			duration: 2.0, // Increased from 1.2 to 2.0 (vanilla value)
			y: `+=${1.3 * Math.PI}`,
			ease: "power2.out",
		});

		// 2. Animate to show the correct number of voxels - EXACTLY like vanilla
		gsap.to(meshRef.current, {
			duration: 0.8, // Increased from 0.4 to 0.8 (vanilla value)
			count: currentModel.voxels.length,
		});

		// 3. Animate each voxel - EXACTLY like vanilla animations
		for (let i = 0; i < voxels.current.length; i++) {
			// Clear any existing animations
			gsap.killTweensOf(voxels.current[i].position);
			gsap.killTweensOf(voxels.current[i].color);

			let targetPos;

			// Move to new position if available; otherwise, use a randomly selected existing position
			if (i < currentModel.voxels.length) {
				targetPos = currentModel.voxels[i].position;
			} else if (currentModel.voxels.length > 0) {
				// Use a random position from the target model
				const randomIndex = Math.floor(
					currentModel.voxels.length * Math.random()
				);
				targetPos = currentModel.voxels[randomIndex].position;
			} else {
				// Fallback
				targetPos = new THREE.Vector3(0, 0, 0);
			}

			// Animate position with longer duration - EXACTLY like vanilla
			const duration = 1.0 + 0.8 * Math.pow(Math.random(), 6);
			gsap.to(voxels.current[i].position, {
				delay: 0.4 * Math.random(),
				duration: duration,
				x: targetPos.x,
				y: targetPos.y,
				z: targetPos.z,
				ease: "back.out(3)",
				onUpdate: () => {
					// Update the matrix on each frame
					updateMatrix(i);
				},
			});

			// Animate color if voxel exists in target model - EXACTLY like vanilla
			if (i < currentModel.voxels.length) {
				gsap.to(voxels.current[i].color, {
					delay: 0.9 * Math.random() * duration,
					duration: 0.2,
					r: currentModel.voxels[i].color.r,
					g: currentModel.voxels[i].color.g,
					b: currentModel.voxels[i].color.b,
					ease: "power1.in",
					onUpdate: () => {
						// Update color when it changes
						if (meshRef.current) {
							meshRef.current.setColorAt(
								i,
								voxels.current[i].color
							);
							if (meshRef.current.instanceColor) {
								meshRef.current.instanceColor.needsUpdate =
									true;
							}
						}
					},
				});
			}
		}

		// Update prevModelIndex for next transition
		setPrevModelIndex(modelIndex);

		// Force update for the entire duration of the transition
		gsap.to(
			{},
			{
				duration: 2.2, // Increased from 1.0 to 2.2 (vanilla value)
				onUpdate: () => {
					if (meshRef.current) {
						meshRef.current.instanceMatrix.needsUpdate = true;
					}
				},
			}
		);
	}, [modelIndex, models, prevModelIndex]);

	// Helper function to update matrix for a specific instance
	const updateMatrix = (index: number) => {
		if (!meshRef.current) return;

		dummy.position.copy(voxels.current[index].position);
		dummy.updateMatrix();
		meshRef.current.setMatrixAt(index, dummy.matrix);
		meshRef.current.instanceMatrix.needsUpdate = true;
	};

	// Set initial voxel positions and colors when model changes
	useEffect(() => {
		if (!meshRef.current || !models.length || !models[modelIndex]?.voxels)
			return;

		const model = models[modelIndex];

		// Update the count
		setCount(model.voxels.length);

		// Update positions and colors only on first load
		if (prevModelIndex === modelIndex) {
			for (let i = 0; i < model.voxels.length; i++) {
				if (i < voxels.current.length) {
					voxels.current[i].position.copy(model.voxels[i].position);
					voxels.current[i].color.copy(model.voxels[i].color);
					updateMatrix(i);

					if (meshRef.current) {
						meshRef.current.setColorAt(i, voxels.current[i].color);
					}
				}
			}

			if (meshRef.current) {
				meshRef.current.instanceMatrix.needsUpdate = true;
				if (meshRef.current.instanceColor) {
					meshRef.current.instanceColor.needsUpdate = true;
				}
			}
		}
	}, [models, modelIndex, prevModelIndex]);

	// Don't render anything if no models or no count
	if (!models.length || !count) return null;

	return (
		<instancedMesh
			ref={meshRef}
			args={[geometry, material, count]}
			castShadow
			receiveShadow
		/>
	);
}
