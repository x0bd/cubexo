import { create } from "zustand";
import * as THREE from "three";
import { voxelizer } from "@/utils/voxelizer";

export type Voxel = {
	position: THREE.Vector3;
	color: THREE.Color;
};

type ModelData = {
	name: string;
	url: string;
	voxels: Voxel[];
};

interface VoxelState {
	models: ModelData[];
	activeModelIndex: number;
	isLoading: boolean;
	setActiveModelIndex: (index: number) => void;
	addModelData: (modelData: ModelData) => void;
	loadDefaultModels: () => Promise<void>;
}

// Default model URLs from the original app
const DEFAULT_MODELS = [
	{
		name: "Chili Pepper",
		url: "https://ksenia-k.com/models/Chili%20Pepper.glb",
	},
	{
		name: "Chicken",
		url: "https://ksenia-k.com/models/Chicken.glb",
	},
	{
		name: "Egg",
		url: "https://ksenia-k.com/models/egg.glb",
	},
];

export const useVoxelStore = create<VoxelState>((set, get) => ({
	models: [],
	activeModelIndex: 1, // Start with Chicken
	isLoading: false,

	setActiveModelIndex: (index) => set({ activeModelIndex: index }),

	addModelData: (modelData) =>
		set((state) => ({
			models: [...state.models, modelData],
		})),

	loadDefaultModels: async () => {
		set({ isLoading: true });

		try {
			// Clear existing models
			set({ models: [] });

			// Load and voxelize each model
			for (const model of DEFAULT_MODELS) {
				try {
					console.log(`Loading model: ${model.name}`);

					// Load the 3D model
					const loadedModel = await voxelizer.loadModel(model.url);

					// Voxelize the model
					console.log(`Voxelizing model: ${model.name}`);
					const voxels = voxelizer.voxelizeModel(loadedModel);

					// Add model data to store
					get().addModelData({
						name: model.name,
						url: model.url,
						voxels: voxels,
					});

					console.log(
						`Model "${model.name}" loaded with ${voxels.length} voxels`
					);
				} catch (modelError) {
					console.error(
						`Failed to load model "${model.name}":`,
						modelError
					);
				}
			}
		} catch (error) {
			console.error("Failed to load default models:", error);
		} finally {
			set({ isLoading: false });
		}
	},
}));
