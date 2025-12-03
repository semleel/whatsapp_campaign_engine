import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { MessageCircle, GitFork, Zap, Plus, ArrowRight, HelpCircle } from "lucide-react";

const handleStyle = {
  width: 0,
  height: 0,
  background: "transparent",
  border: "none",
  left: "50%",
  transform: "translateX(-50%)",
};

const CallbellNode = ({ data, selected }: NodeProps) => {
  const { nodeType, label, id, ui_metadata } = data as any;
  const titleFromMeta = ui_metadata?.title?.trim();
  const actionLabel = (() => {
    switch (nodeType) {
      case "message": return "Send message";
      case "template": return "Send template";
      case "decision": return "Choice";
      case "api": return "API call";
      case "jump": return "Jump";
      case "fallback": return "Fallback";
      default: return "Action";
    }
  })();
  const title = titleFromMeta || label || actionLabel;

  // Placeholder node
  if (nodeType === "placeholder") {
    return (
      <div className="w-[300px] h-[60px] flex items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 text-gray-400 font-medium cursor-pointer hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all">
        <Handle type="target" position={Position.Top} isConnectable={false} style={handleStyle} />
        <span className="flex items-center gap-2">
          <Plus size={16} /> Add action
        </span>
        <Handle type="source" position={Position.Bottom} isConnectable={false} style={handleStyle} />
      </div>
    );
  }

  // Real nodes
  let Icon = MessageCircle;
  let iconBg = "bg-blue-50 text-blue-600";
  if (nodeType === "decision") {
    Icon = GitFork;
    iconBg = "bg-orange-50 text-orange-600";
  } else if (nodeType === "api") {
    Icon = Zap;
    iconBg = "bg-purple-50 text-purple-600";
  } else if (nodeType === "fallback" || label === "Fallback") {
    Icon = HelpCircle;
    iconBg = "bg-gray-100 text-gray-600";
  }

  return (
    <div
      className={`w-[300px] bg-white rounded-xl border shadow-sm transition-all relative group ${
        selected ? "border-emerald-500 ring-2 ring-emerald-100" : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} style={handleStyle} />

      <div className="p-4 flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          <Icon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 text-sm truncate">
            {title}
          </div>
        </div>
        {nodeType === "decision" && (
          <div className="text-gray-300">
            <ArrowRight size={14} />
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} isConnectable={false} style={handleStyle} />
    </div>
  );
};

export default memo(CallbellNode);
