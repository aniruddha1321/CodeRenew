import React, { useRef, useCallback, useMemo, useState, useEffect } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { Eye, EyeOff, ZoomIn, ZoomOut, Maximize } from "lucide-react";

interface GraphNode {
    id: string;
    label: string;
    type: string;
    language?: string;
    external?: boolean;
    lineCount?: number;
    methodCount?: number;
    // force-graph adds these at runtime
    x?: number;
    y?: number;
}

interface GraphLink {
    source: string | GraphNode;
    target: string | GraphNode;
    type: string;
}

interface GraphData {
    nodes: GraphNode[];
    links: GraphLink[];
    stats: {
        total_files: number;
        total_classes: number;
        total_functions: number;
        total_modules: number;
        total_imports: number;
        total_nodes: number;
        total_edges: number;
        python_files: number;
        java_files: number;
    };
}

const NODE_COLORS: Record<string, string> = {
    file: "#3b82f6",       // blue
    class: "#22c55e",      // green
    function: "#eab308",   // yellow
    module: "#a855f7",     // purple
    external: "#6b7280",   // gray
};

const EDGE_COLORS: Record<string, string> = {
    imports: "#3b82f6",
    contains: "#d1d5db",
    inherits: "#ef4444",
    implements: "#f97316",
    calls: "#8b5cf6",
};

const NODE_SIZES: Record<string, number> = {
    file: 6,
    class: 5,
    function: 3,
    module: 8,
    external: 4,
};

interface Props {
    data: GraphData;
}

const KnowledgeGraph: React.FC<Props> = ({ data }) => {
    const graphRef = useRef<any>();
    const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
    const [highlightLinks, setHighlightLinks] = useState<Set<any>>(new Set());
    const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
    const [hoverNode, setHoverNode] = useState<GraphNode | null>(null);

    // Filters
    const [showFiles, setShowFiles] = useState(true);
    const [showClasses, setShowClasses] = useState(true);
    const [showFunctions, setShowFunctions] = useState(true);
    const [showModules, setShowModules] = useState(true);
    const [showExternal, setShowExternal] = useState(false);

    // Auto zoom-to-fit after layout settles
    useEffect(() => {
        const t = setTimeout(() => {
            if (graphRef.current) graphRef.current.zoomToFit(600, 60);
        }, 1500);
        return () => clearTimeout(t);
    }, []);

    // Filter graph data
    const filteredData = useMemo(() => {
        const visibleTypes = new Set<string>();
        if (showFiles) visibleTypes.add("file");
        if (showClasses) visibleTypes.add("class");
        if (showFunctions) visibleTypes.add("function");
        if (showModules) visibleTypes.add("module");
        if (showExternal) visibleTypes.add("external");

        const nodes = data.nodes.filter(n => visibleTypes.has(n.type));
        const nodeIds = new Set(nodes.map(n => n.id));
        const links = data.links.filter(l => {
            const sourceId = typeof l.source === "string" ? l.source : l.source.id;
            const targetId = typeof l.target === "string" ? l.target : l.target.id;
            return nodeIds.has(sourceId) && nodeIds.has(targetId);
        });

        return { nodes, links };
    }, [data, showFiles, showClasses, showFunctions, showModules, showExternal]);

    const handleNodeClick = useCallback((node: any) => {
        setSelectedNode(node);

        // Highlight connected nodes
        const connectedNodes = new Set<string>([node.id]);
        const connectedLinks = new Set<any>();

        filteredData.links.forEach((link: any) => {
            const sourceId = typeof link.source === "string" ? link.source : link.source.id;
            const targetId = typeof link.target === "string" ? link.target : link.target.id;
            if (sourceId === node.id || targetId === node.id) {
                connectedNodes.add(sourceId);
                connectedNodes.add(targetId);
                connectedLinks.add(link);
            }
        });

        setHighlightNodes(connectedNodes);
        setHighlightLinks(connectedLinks);

        // Center on node
        if (graphRef.current) {
            graphRef.current.centerAt(node.x, node.y, 500);
            graphRef.current.zoom(3, 500);
        }
    }, [filteredData.links]);

    const handleNodeHover = useCallback((node: any) => {
        setHoverNode(node || null);
    }, []);

    const handleBackgroundClick = useCallback(() => {
        setSelectedNode(null);
        setHighlightNodes(new Set());
        setHighlightLinks(new Set());
    }, []);

    const handleZoomToFit = () => {
        if (graphRef.current) graphRef.current.zoomToFit(400, 50);
    };

    const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const size = NODE_SIZES[node.type] || 4;
        const color = NODE_COLORS[node.type] || "#999";
        const isHighlighted = highlightNodes.size === 0 || highlightNodes.has(node.id);
        const isHovered = hoverNode?.id === node.id;
        const alpha = isHighlighted ? 1 : 0.15;

        ctx.globalAlpha = alpha;

        // Glow for hovered node
        if (isHovered) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, size + 4, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.25;
            ctx.fill();
            ctx.globalAlpha = alpha;
        }

        // Draw node circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();

        // Show label only when: hovered, highlighted/selected, or zoomed in enough
        const showLabel = isHovered || (isHighlighted && highlightNodes.size > 0) || globalScale > 2;

        if (showLabel) {
            const fontSize = Math.min(14, Math.max(3, 11 / globalScale));
            ctx.font = `600 ${fontSize}px Inter, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";

            // Shadow for readability
            ctx.fillStyle = "rgba(0,0,0,0.8)";
            ctx.fillText(node.label, node.x + 0.3 / globalScale, node.y + size + 2.3 / globalScale);

            // Label text
            ctx.fillStyle = isHovered ? "#fbbf24" : "#e5e7eb";
            ctx.fillText(node.label, node.x, node.y + size + 2 / globalScale);
        }

        ctx.globalAlpha = 1;
    }, [highlightNodes, hoverNode]);

    const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D) => {
        const isHighlighted = highlightLinks.size === 0 || highlightLinks.has(link);
        const color = EDGE_COLORS[link.type] || "#d1d5db";

        ctx.globalAlpha = isHighlighted ? 0.6 : 0.05;
        ctx.strokeStyle = color;
        ctx.lineWidth = isHighlighted ? 1.5 : 0.5;

        if (link.type === "contains") {
            ctx.setLineDash([2, 2]);
        } else if (link.type === "calls") {
            ctx.setLineDash([4, 2]);
        } else {
            ctx.setLineDash([]);
        }

        ctx.beginPath();
        ctx.moveTo(link.source.x, link.source.y);
        ctx.lineTo(link.target.x, link.target.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
    }, [highlightLinks]);

    const stats = data.stats;

    return (
        <div className="flex flex-col" style={{ height: "600px" }}>
            {/* Controls bar */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
                {/* Filter toggles */}
                <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-gray-500 uppercase">Show:</span>
                    {[
                        { key: "files", show: showFiles, set: setShowFiles, color: NODE_COLORS.file, label: "Files" },
                        { key: "classes", show: showClasses, set: setShowClasses, color: NODE_COLORS.class, label: "Classes" },
                        { key: "functions", show: showFunctions, set: setShowFunctions, color: NODE_COLORS.function, label: "Functions" },
                        { key: "modules", show: showModules, set: setShowModules, color: NODE_COLORS.module, label: "Modules" },
                        { key: "external", show: showExternal, set: setShowExternal, color: NODE_COLORS.external, label: "External" },
                    ].map(f => (
                        <button
                            key={f.key}
                            onClick={() => f.set(!f.show)}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${f.show ? "bg-white border shadow-sm" : "bg-gray-200 text-gray-400"
                                }`}
                        >
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: f.show ? f.color : "#d1d5db" }} />
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* Zoom controls */}
                <button onClick={handleZoomToFit} className="flex items-center gap-1 px-3 py-1 bg-white border rounded text-xs hover:bg-gray-50">
                    <Maximize size={12} /> Fit
                </button>
            </div>

            {/* Graph + Stats sidebar */}
            <div className="flex flex-1 overflow-hidden">
                {/* Graph canvas */}
                <div className="flex-1 bg-gray-900 relative">
                    <ForceGraph2D
                        ref={graphRef}
                        graphData={filteredData}
                        nodeCanvasObject={paintNode}
                        nodeCanvasObjectMode={() => "replace"}
                        linkCanvasObject={paintLink}
                        onNodeClick={handleNodeClick}
                        onNodeHover={handleNodeHover}
                        onNodeDragEnd={(node: any) => {
                            node.fx = node.x;
                            node.fy = node.y;
                        }}
                        onBackgroundClick={handleBackgroundClick}
                        enableNodeDrag={true}
                        enableZoomInteraction={true}
                        enablePanInteraction={true}
                        nodeId="id"
                        linkSource="source"
                        linkTarget="target"
                        backgroundColor="#111827"
                        nodeRelSize={4}
                        cooldownTime={3000}
                        d3AlphaDecay={0.02}
                        d3VelocityDecay={0.3}
                        nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
                            const s = (NODE_SIZES[node.type] || 4) + 4;
                            ctx.beginPath();
                            ctx.arc(node.x, node.y, s, 0, 2 * Math.PI);
                            ctx.fillStyle = color;
                            ctx.fill();
                        }}
                    />

                    {/* Hover tooltip */}
                    {hoverNode && (
                        <div
                            className="absolute pointer-events-none bg-gray-900/95 border border-gray-600 text-white p-3 rounded-lg shadow-xl text-xs"
                            style={{ top: 12, right: 12, minWidth: 170, zIndex: 50 }}
                        >
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: NODE_COLORS[hoverNode.type] }} />
                                <span className="font-bold text-sm truncate">{hoverNode.label}</span>
                            </div>
                            <div className="text-gray-400 space-y-0.5">
                                <div>Type: <span className="text-gray-200 capitalize">{hoverNode.type}</span></div>
                                {hoverNode.language && <div>Language: <span className="text-gray-200">{hoverNode.language}</span></div>}
                                {hoverNode.lineCount && <div>Lines: <span className="text-gray-200">{hoverNode.lineCount}</span></div>}
                            </div>
                        </div>
                    )}
                </div>

                {/* Stats panel */}
                <div className="w-56 bg-white border-l p-4 overflow-y-auto">
                    <h4 className="text-sm font-semibold text-gray-800 mb-3">Graph Stats</h4>
                    <div className="space-y-2 text-sm">
                        {[
                            { label: "Files", value: stats.total_files, color: NODE_COLORS.file },
                            { label: "Classes", value: stats.total_classes, color: NODE_COLORS.class },
                            { label: "Functions", value: stats.total_functions, color: NODE_COLORS.function },
                            { label: "Modules", value: stats.total_modules, color: NODE_COLORS.module },
                            { label: "Import Links", value: stats.total_imports, color: EDGE_COLORS.imports },
                        ].map(s => (
                            <div key={s.label} className="flex items-center justify-between">
                                <span className="flex items-center gap-2 text-gray-600">
                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                                    {s.label}
                                </span>
                                <span className="font-medium text-gray-800">{s.value}</span>
                            </div>
                        ))}
                        <div className="border-t pt-2 mt-2">
                            <div className="flex items-center justify-between">
                                <span className="text-gray-600">Total Nodes</span>
                                <span className="font-medium">{stats.total_nodes}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-600">Total Edges</span>
                                <span className="font-medium">{stats.total_edges}</span>
                            </div>
                        </div>

                        {stats.python_files > 0 && (
                            <div className="flex items-center justify-between mt-2">
                                <span className="text-blue-600">Python Files</span>
                                <span className="font-medium">{stats.python_files}</span>
                            </div>
                        )}
                        {stats.java_files > 0 && (
                            <div className="flex items-center justify-between">
                                <span className="text-orange-600">Java Files</span>
                                <span className="font-medium">{stats.java_files}</span>
                            </div>
                        )}
                    </div>

                    {/* Selected node info */}
                    {selectedNode && (
                        <div className="mt-4 pt-4 border-t">
                            <h4 className="text-sm font-semibold text-gray-800 mb-2">Selected</h4>
                            <div className="text-xs space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: NODE_COLORS[selectedNode.type] }} />
                                    <span className="font-medium">{selectedNode.label}</span>
                                </div>
                                <div className="text-gray-500">Type: {selectedNode.type}</div>
                                {selectedNode.language && <div className="text-gray-500">Language: {selectedNode.language}</div>}
                                {selectedNode.lineCount && <div className="text-gray-500">Lines: {selectedNode.lineCount}</div>}
                                {selectedNode.methodCount !== undefined && <div className="text-gray-500">Methods: {selectedNode.methodCount}</div>}
                            </div>
                        </div>
                    )}

                    {/* Legend */}
                    <div className="mt-4 pt-4 border-t">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Edge Types</h4>
                        <div className="space-y-1 text-xs text-gray-500">
                            {Object.entries(EDGE_COLORS).map(([type, color]) => (
                                <div key={type} className="flex items-center gap-2">
                                    <div className="w-4 h-0.5" style={{ backgroundColor: color }} />
                                    {type}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default KnowledgeGraph;
