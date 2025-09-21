import json

class BatchIgnoreManager:
    def __init__(self):
        pass
    
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "ignore_enabled": ("BOOLEAN", {"default": False}),
                "node_list": ("STRING", {
                    "multiline": True,
                    "default": "[]",
                    "placeholder": "节点ID列表 (JSON格式)\n例如: [\"1\", \"2\", \"3\"]"
                }),
            }
        }
    
    RETURN_TYPES = ("STRING", "BOOLEAN", "STRING")
    RETURN_NAMES = ("status", "ignore_state", "node_ids")
    FUNCTION = "manage_ignore"
    CATEGORY = "utils"
    OUTPUT_NODE = True
    
    def manage_ignore(self, ignore_enabled, node_list):
        try:
            # 解析节点列表
            if isinstance(node_list, str):
                try:
                    nodes = json.loads(node_list)
                except json.JSONDecodeError:
                    return ("错误: 节点列表格式不正确，请使用JSON格式", False, "[]")
            else:
                nodes = node_list if isinstance(node_list, list) else []
            
            if not isinstance(nodes, list):
                return ("错误: 节点列表必须是数组格式", False, "[]")
            
            node_count = len(nodes)
            status = f"管理 {node_count} 个节点，忽略状态: {'启用' if ignore_enabled else '禁用'}"
            
            return (status, ignore_enabled, json.dumps(nodes))
            
        except Exception as e:
            return (f"错误: {str(e)}", False, "[]")

class NodeSelector:
    """辅助节点选择器"""
    def __init__(self):
        pass
    
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "node_ids": ("STRING", {
                    "default": "",
                    "placeholder": "输入节点ID，用逗号分隔"
                }),
            }
        }
    
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("formatted_list",)
    FUNCTION = "format_nodes"
    CATEGORY = "utils"
    
    def format_nodes(self, node_ids):
        try:
            if not node_ids.strip():
                return ("[]",)
            
            ids = [id.strip() for id in node_ids.split(",") if id.strip()]
            formatted = json.dumps(ids, indent=2)
            
            return (formatted,)
        except Exception as e:
            return (f"错误: {str(e)}",)

# 节点映射
NODE_CLASS_MAPPINGS = {
    "BatchIgnoreManager": BatchIgnoreManager,
    "NodeSelector": NodeSelector,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BatchIgnoreManager": "批量忽略管理器",
    "NodeSelector": "节点选择器",
}
