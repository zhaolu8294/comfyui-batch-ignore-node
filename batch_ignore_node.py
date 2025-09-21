class BatchIgnoreManager:
    def __init__(self):
        pass
    
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {},
            "optional": {}
        }
    
    RETURN_TYPES = ()
    FUNCTION = "manage_ignore"
    CATEGORY = "utils"
    OUTPUT_NODE = True
    
    def manage_ignore(self):
        # 所有逻辑都在前端JavaScript处理
        # Python端只提供节点框架
        return ()

# 节点映射
NODE_CLASS_MAPPINGS = {
    "BatchIgnoreManager": BatchIgnoreManager,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BatchIgnoreManager": "批量忽略管理器",
}
