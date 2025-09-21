import { app } from "../../scripts/app.js";

// 正确的忽略模式值
const BYPASS_MODE = 4;
const NORMAL_MODE = 0;

// 设置节点忽略状态的函数
function setNodeBypassState(nodeId, bypass) {
    const node = app.graph.getNodeById(parseInt(nodeId));
    if (node) {
        if (bypass) {
            node.mode = BYPASS_MODE;  // 设置为忽略模式
        } else {
            node.mode = NORMAL_MODE;  // 设置为正常模式
        }
        
        // 更新节点外观
        node.setDirtyCanvas(true, true);
        return true;
    }
    return false;
}

// 批量设置节点忽略状态
function batchSetBypassState(nodeIds, bypass) {
    let successCount = 0;
    let failedNodes = [];
    
    nodeIds.forEach(nodeId => {
        if (setNodeBypassState(nodeId, bypass)) {
            successCount++;
        } else {
            failedNodes.push(nodeId);
        }
    });
    
    console.log(`批量忽略操作: ${bypass ? '忽略' : '恢复'} ${successCount} 个节点`);
    if (failedNodes.length > 0) {
        console.warn("未找到的节点ID:", failedNodes);
    }
    
    // 重绘画布
    app.graph.setDirtyCanvas(true, true);
    
    return { success: successCount, failed: failedNodes };
}

// 获取选中节点的ID列表
function getSelectedNodeIds() {
    const selectedNodes = Object.values(app.canvas.selected_nodes || {});
    return selectedNodes.map(node => node.id.toString());
}

// 获取所有节点的ID列表
function getAllNodeIds() {
    return app.graph._nodes.map(node => node.id.toString());
}

// 节点列表操作函数
function addNodesToList(currentList, nodeIds) {
    try {
        let nodes = JSON.parse(currentList || "[]");
        if (!Array.isArray(nodes)) nodes = [];
        
        nodeIds.forEach(id => {
            if (!nodes.includes(id)) {
                nodes.push(id);
            }
        });
        
        return JSON.stringify(nodes, null, 2);
    } catch (e) {
        console.error("添加节点失败:", e);
        return currentList;
    }
}

function removeNodesFromList(currentList, nodeIds) {
    try {
        let nodes = JSON.parse(currentList || "[]");
        if (!Array.isArray(nodes)) nodes = [];
        
        nodeIds.forEach(id => {
            const index = nodes.indexOf(id);
            if (index > -1) {
                nodes.splice(index, 1);
            }
        });
        
        return JSON.stringify(nodes, null, 2);
    } catch (e) {
        console.error("移除节点失败:", e);
        return currentList;
    }
}

// 右键菜单扩展
const originalGetCanvasMenuOptions = LiteGraph.LGraphCanvas.prototype.getCanvasMenuOptions;
LiteGraph.LGraphCanvas.prototype.getCanvasMenuOptions = function () {
    const options = originalGetCanvasMenuOptions.apply(this, arguments);
    
    options.push({
        content: "批量忽略管理",
        submenu: {
            options: [
                {
                    content: "添加选中节点到管理器",
                    callback: () => {
                        const selectedIds = getSelectedNodeIds();
                        if (selectedIds.length === 0) {
                            console.log("没有选中的节点");
                            return;
                        }
                        
                        // 查找或创建批量忽略管理器
                        let managerNode = app.graph._nodes.find(node => node.type === "BatchIgnoreManager");
                        
                        if (!managerNode) {
                            managerNode = LiteGraph.createNode("BatchIgnoreManager");
                            if (managerNode) {
                                app.graph.add(managerNode);
                                managerNode.pos = [app.canvas.graph_mouse[0], app.canvas.graph_mouse[1]];
                            } else {
                                return;
                            }
                        }
                        
                        // 更新节点列表
                        const nodeListWidget = managerNode.widgets?.find(w => w.name === "node_list");
                        if (nodeListWidget) {
                            nodeListWidget.value = addNodesToList(nodeListWidget.value, selectedIds);
                            app.graph.setDirtyCanvas(true);
                            
                            // 自动执行忽略操作
                            if (managerNode.executeBypassOperation) {
                                managerNode.executeBypassOperation();
                            }
                        }
                    }
                },
                {
                    content: "从管理器移除选中节点",
                    callback: () => {
                        const selectedIds = getSelectedNodeIds();
                        if (selectedIds.length === 0) {
                            console.log("没有选中的节点");
                            return;
                        }
                        
                        // 查找批量忽略管理器
                        const managerNode = app.graph._nodes.find(node => node.type === "BatchIgnoreManager");
                        if (!managerNode) {
                            console.log("未找到批量忽略管理器");
                            return;
                        }
                        
                        // 更新节点列表
                        const nodeListWidget = managerNode.widgets?.find(w => w.name === "node_list");
                        if (nodeListWidget) {
                            nodeListWidget.value = removeNodesFromList(nodeListWidget.value, selectedIds);
                            app.graph.setDirtyCanvas(true);
                            
                            // 自动执行忽略操作
                            if (managerNode.executeBypassOperation) {
                                managerNode.executeBypassOperation();
                            }
                        }
                    }
                },
                {
                    content: "忽略选中节点",
                    callback: () => {
                        const selectedIds = getSelectedNodeIds();
                        if (selectedIds.length === 0) return;
                        batchSetBypassState(selectedIds, true);
                    }
                },
                {
                    content: "恢复选中节点",
                    callback: () => {
                        const selectedIds = getSelectedNodeIds();
                        if (selectedIds.length === 0) return;
                        batchSetBypassState(selectedIds, false);
                    }
                }
            ]
        }
    });
    
    return options;
};

// 注册扩展
app.registerExtension({
    name: "BatchIgnoreManager",
    
    beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "BatchIgnoreManager") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                if (onNodeCreated) {
                    onNodeCreated.apply(this, arguments);
                }
                
                const self = this;
                
                // 添加执行忽略操作的方法
                this.executeBypassOperation = function() {
                    try {
                        const ignoreWidget = this.widgets?.find(w => w.name === "ignore_enabled");
                        const nodeListWidget = this.widgets?.find(w => w.name === "node_list");
                        
                        if (ignoreWidget && nodeListWidget) {
                            const bypass = ignoreWidget.value;
                            const nodeIds = JSON.parse(nodeListWidget.value || "[]");
                            
                            if (Array.isArray(nodeIds) && nodeIds.length > 0) {
                                const result = batchSetBypassState(nodeIds, bypass);
                                console.log(`批量忽略管理器: ${bypass ? '忽略' : '恢复'} ${result.success} 个节点`);
                            }
                        }
                    } catch (e) {
                        console.error("批量忽略管理器执行失败:", e);
                    }
                };
                
                // 等待DOM稳定后添加按钮
                setTimeout(() => {
                    // 添加选中节点管理按钮
                    this.addWidget("button", "添加选中节点", null, function() {
                        const selectedIds = getSelectedNodeIds();
                        if (selectedIds.length === 0) {
                            console.log("没有选中的节点");
                            return;
                        }
                        
                        const nodeListWidget = self.widgets?.find(w => w.name === "node_list");
                        if (nodeListWidget) {
                            nodeListWidget.value = addNodesToList(nodeListWidget.value, selectedIds);
                            app.graph.setDirtyCanvas(true);
                            self.executeBypassOperation();
                            console.log(`已添加 ${selectedIds.length} 个节点到管理器`);
                        }
                    });
                    
                    this.addWidget("button", "移除选中节点", null, function() {
                        const selectedIds = getSelectedNodeIds();
                        if (selectedIds.length === 0) {
                            console.log("没有选中的节点");
                            return;
                        }
                        
                        const nodeListWidget = self.widgets?.find(w => w.name === "node_list");
                        if (nodeListWidget) {
                            nodeListWidget.value = removeNodesFromList(nodeListWidget.value, selectedIds);
                            app.graph.setDirtyCanvas(true);
                            self.executeBypassOperation();
                            console.log(`已从管理器移除 ${selectedIds.length} 个节点`);
                        }
                    });
                    
                    this.addWidget("button", "添加所有节点", null, function() {
                        const allIds = getAllNodeIds().filter(id => id !== self.id.toString()); // 排除管理器自己
                        
                        const nodeListWidget = self.widgets?.find(w => w.name === "node_list");
                        if (nodeListWidget) {
                            nodeListWidget.value = JSON.stringify(allIds, null, 2);
                            app.graph.setDirtyCanvas(true);
                            self.executeBypassOperation();
                            console.log(`已添加所有 ${allIds.length} 个节点到管理器`);
                        }
                    });
                    
                    this.addWidget("button", "清空节点列表", null, function() {
                        const nodeListWidget = self.widgets?.find(w => w.name === "node_list");
                        if (nodeListWidget) {
                            // 先恢复所有被管理的节点
                            try {
                                const currentNodes = JSON.parse(nodeListWidget.value || "[]");
                                if (Array.isArray(currentNodes) && currentNodes.length > 0) {
                                    batchSetBypassState(currentNodes, false);
                                }
                            } catch (e) {
                                console.error("恢复节点失败:", e);
                            }
                            
                            // 清空列表
                            nodeListWidget.value = "[]";
                            app.graph.setDirtyCanvas(true);
                            console.log("已清空节点列表并恢复所有节点");
                        }
                    });
                    
                    // 重新计算节点大小以显示所有控件
                    this.computeSize();
                    this.setDirtyCanvas(true, true);
                }, 100);
                
                // 监听开关变化自动执行
                const setupWidgetCallbacks = () => {
                    const ignoreWidget = this.widgets?.find(w => w.name === "ignore_enabled");
                    if (ignoreWidget) {
                        const originalCallback = ignoreWidget.callback;
                        ignoreWidget.callback = function() {
                            if (originalCallback) {
                                originalCallback.apply(this, arguments);
                            }
                            
                            // 立即执行忽略操作
                            setTimeout(() => {
                                self.executeBypassOperation();
                            }, 10);
                        };
                    }
                    
                    // 监听节点列表变化
                    const nodeListWidget = this.widgets?.find(w => w.name === "node_list");
                    if (nodeListWidget) {
                        const originalCallback = nodeListWidget.callback;
                        nodeListWidget.callback = function() {
                            if (originalCallback) {
                                originalCallback.apply(this, arguments);
                            }
                            
                            // 延迟执行以确保值已更新
                            setTimeout(() => {
                                self.executeBypassOperation();
                            }, 100);
                        };
                    }
                };
                
                // 延迟设置回调以确保widgets已创建
                setTimeout(setupWidgetCallbacks, 50);
                
                // 自定义节点外观
                this.color = "#2a4a6b";
                this.bgcolor = "#1e3a52";
                this.title = "批量忽略管理器";
            };
        }
    }
});

console.log("批量忽略管理器已加载 - 按钮修复版本");