import { create } from "zustand";
import * as THREE from "three";
import { ModelData } from "./types";

interface VoxelState {
	// Scene state
	scene: THREE.Scene | null;
	setScene: (scene: THREE.Scene) => void;

	// Models state
	models: ModelData[];
	setModels: (models: ModelData[]) => void;
	activeModelIndex: number;
	setActiveModelIndex: (index: number) => void;
	activeModelName: string | null;

	// Loading state
	isLoading: boolean;
	setIsLoading: (isLoading: boolean) => void;
}

export const useVoxelStore = create<VoxelState>((set, get) => ({
	// Scene state
	scene: null,
	setScene: (scene) => set({ scene }),

	// Models state
	models: [],
	setModels: (models) => set({ models }),
	activeModelIndex: 0,
	setActiveModelIndex: (index) =>
		set((state) => ({
			activeModelIndex: index,
			activeModelName: state.models[index]?.name || null,
		})),
	activeModelName: null,

	// Loading state
	isLoading: false,
	setIsLoading: (isLoading) => set({ isLoading }),
}));
