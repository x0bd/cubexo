"use client";

import { useEffect } from "react";
import { useVoxelStore } from "@/store/voxelStore";

export default function DebugPanel() {
	const models = useVoxelStore((state) => state.models);
	const activeModelIndex = useVoxelStore((state) => state.activeModelIndex);

	useEffect(() => {
		console.log("Current models in store:", models);
		console.log("Active model index:", activeModelIndex);
		console.log("Active model:", models[activeModelIndex]);
	}, [models, activeModelIndex]);

	return (
		<div className="fixed top-4 right-4 p-4 bg-background/80 backdrop-blur-sm border border-border rounded-lg shadow-md z-50 max-w-sm">
			<h3 className="font-bold mb-2">Debug Info</h3>
			<p>Model Count: {models.length}</p>
			<p>Active Index: {activeModelIndex}</p>
			{models[activeModelIndex] && (
				<div className="mt-2">
					<p>Active Model: {models[activeModelIndex].name}</p>
					<p>
						Voxel Count:{" "}
						{models[activeModelIndex].voxels?.length || 0}
					</p>
				</div>
			)}
		</div>
	);
}
