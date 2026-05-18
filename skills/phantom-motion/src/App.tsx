import { useRef, useState } from "react";

const App = () => {
	const [chaos, setChaos] = useState(1.0);
	const [entangle, setEntangle] = useState(0.0);
	const iframeRef = useRef<HTMLIFrameElement>(null);

	const updateProp = (key: string, value: number) => {
		if (iframeRef.current && iframeRef.current.contentWindow) {
			iframeRef.current.contentWindow.postMessage(
				{
					type: "UPDATE_PROP",
					payload: { key, value },
				},
				"*",
			);
		}
	};

	return (
		<div className="flex h-screen w-screen font-sans text-black">
			{/* Workspace / Stage */}
			<main className="flex-1 relative bg-[#fafaf9] p-8">
				<div className="w-full h-full rounded-2xl overflow-hidden shadow-mono border border-black/5 bg-black">
					<iframe
						ref={iframeRef}
						src="/stage.html"
						className="w-full h-full border-none"
						title="Phantom Stage"
					/>
				</div>
			</main>

			{/* Inspector / Chrome */}
			<aside className="w-80 bg-white border-l border-black/10 p-6 flex flex-col gap-8 shadow-mono">
				<header>
					<div className="text-[10px] uppercase tracking-widest text-black/40 font-bold mb-1">
						Project
					</div>
					<h2 className="text-xl font-medium tracking-tight">Quantum Order</h2>
				</header>

				<section className="flex flex-col gap-6">
					{/* Chaos Slider */}
					<div>
						<div className="flex justify-between items-center mb-3">
							<label className="text-[10px] uppercase tracking-widest text-black/40 font-bold">
								Chaos Factor
							</label>
							<span className="tabular-nums text-sm font-medium">
								{(chaos * 100).toFixed(0)}%
							</span>
						</div>
						<input
							type="range"
							min="0"
							max="2"
							step="0.01"
							value={chaos}
							onChange={(e) => {
								const v = Number.parseFloat(e.target.value);
								setChaos(v);
								updateProp("chaos", v);
							}}
							className="w-full h-1 bg-black/5 rounded-full appearance-none accent-black cursor-pointer"
						/>
					</div>

					{/* Entangle Slider */}
					<div>
						<div className="flex justify-between items-center mb-3">
							<label className="text-[10px] uppercase tracking-widest text-black/40 font-bold">
								Entanglement
							</label>
							<span className="tabular-nums text-sm font-medium">
								{(entangle * 100).toFixed(0)}%
							</span>
						</div>
						<input
							type="range"
							min="0"
							max="1"
							step="0.01"
							value={entangle}
							onChange={(e) => {
								const v = Number.parseFloat(e.target.value);
								setEntangle(v);
								updateProp("entangle", v);
							}}
							className="w-full h-1 bg-black/5 rounded-full appearance-none accent-black cursor-pointer"
						/>
					</div>
				</section>

				<footer className="mt-auto pt-6 border-t border-black/5">
					<button className="w-full h-10 bg-black text-white rounded-lg text-sm font-medium hover:bg-black/80 transition-colors cursor-pointer">
						Export Sequence
					</button>
				</footer>
			</aside>
		</div>
	);
};

export default App;
