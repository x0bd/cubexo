import VoxelScene from "@/components/canvas/VoxelScene";
import ModelSelector from "@/components/ui/app/ModelSelector";
import LoadingOverlay from "@/components/ui/app/LoadingOverlay";
import ThemeToggle from "@/components/ui/app/ThemeToggle";
import ExportButton from "@/components/ui/app/ExportButton";
import DebugPanel from "@/components/ui/app/DebugPanel";

export default function Home() {
	return (
		<main className="relative w-full h-screen overflow-hidden">
			<VoxelScene />
			<ModelSelector />
			<LoadingOverlay />
			<ThemeToggle />
			<ExportButton />
			<DebugPanel />
		</main>
	);
}
