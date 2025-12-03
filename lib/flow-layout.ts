import dagre from "dagre";
import { Edge, Node, Position } from "reactflow";

type AnyNode = Node<any>;
type AnyEdge = Edge<any>;

const isGlobalFallback = (node: AnyNode) => String(node.id).toUpperCase() === "GLOBAL_FALLBACK";

const isPlaceholderNode = (node: AnyNode) => {
  const id = String(node.id).toLowerCase();
  return id.includes("placeholder");
};

const getNodeSize = (node: AnyNode) => {
  const type = node.type || (node.data as any)?.nodeType;
  if (type === "placeholder") return { width: 300, height: 60 };
  return { width: 300, height: 100 };
};

function createPlaceholder(id: string, parentId: string): AnyNode {
  return {
    id,
    type: "custom",
    data: { id, label: "Add action", nodeType: "placeholder", parentId },
    position: { x: 0, y: 0 },
    draggable: false,
  };
}

function isFallbackEdge(edge: AnyEdge) {
  return (
    (edge.data as any)?.edgeKind === "fallback" ||
    (typeof edge.label === "string" && String(edge.label).toUpperCase() === "FALLBACK") ||
    edge.sourceHandle === "fallback"
  );
}

export function getLayoutedElements<NodeData = any, EdgeData = any>(
  nodes: Node<NodeData>[],
  edges: Edge<EdgeData>[],
  entryKey?: string | number | null
) {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: "TB", ranksep: 80, nodesep: 80 });

  const baseNodes = nodes.filter((n) => !isPlaceholderNode(n) && !isGlobalFallback(n));

  const childMap = new Map<string, { edge: AnyEdge; target: string }[]>();
  baseNodes.forEach((n) => childMap.set(String(n.id), []));
  edges.forEach((e) => {
    const src = String(e.source);
    const tgt = String(e.target);
    if (childMap.has(src) && childMap.has(tgt)) {
      childMap.get(src)!.push({ edge: { ...e }, target: tgt });
    }
  });

  const augmentedNodes: AnyNode[] = [];
  const augmentedEdges: AnyEdge[] = [];

  baseNodes.forEach((node) => {
    const nodeId = String(node.id);
    const children = childMap.get(nodeId) || [];

    augmentedNodes.push({ ...node, draggable: false });

    const standard = children.filter((c) => !isFallbackEdge(c.edge));
    const fallback = children.filter((c) => isFallbackEdge(c.edge));
    const orderedChildren = [...standard, ...fallback]; // fallback last/right

    if (orderedChildren.length === 0) {
      const phId = `placeholder-${nodeId}`;
      augmentedNodes.push(createPlaceholder(phId, nodeId));
      augmentedEdges.push({
        id: `e-${nodeId}-${phId}`,
        source: nodeId,
        target: phId,
        type: "step",
        style: { stroke: "#94a3b8", strokeWidth: 2, strokeDasharray: "5 5" },
      });
    } else {
      orderedChildren.forEach((child) => {
        augmentedEdges.push({
          ...child.edge,
          id: child.edge.id || `e-${nodeId}-${child.target}`,
          source: nodeId,
          target: child.target,
          type: "step",
          style: { stroke: "#94a3b8", strokeWidth: 2, ...(child.edge.style || {}) },
        });
      });
    }
  });

  augmentedNodes.forEach((node) => {
    const { width, height } = getNodeSize(node);
    dagreGraph.setNode(String(node.id), { width, height });
  });
  augmentedEdges.forEach((edge) => {
    dagreGraph.setEdge(String(edge.source), String(edge.target));
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = augmentedNodes.map((node) => {
    const pos = dagreGraph.node(String(node.id));
    const { width, height } = getNodeSize(node);
    if (!pos) return node;
    return {
      ...node,
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
      position: {
        x: pos.x - width / 2,
        y: pos.y - height / 2,
      },
    };
  });

  return { initialNodes: layoutedNodes, initialEdges: augmentedEdges };
}
