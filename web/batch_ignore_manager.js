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

// 获取节点当前状态
function getNodeBypassState(nodeId) {
    const node = app.graph.getNodeById(parseInt(nodeId));
    if (node) {
        return node.mode === BYPASS_MODE;
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
    
    console.log(`批量操作: ${bypass ? '忽略' : '启用'} ${successCount} 个节点`);
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

// 获取节点名称
function getNodeName(nodeId) {
    const node = app.graph.getNodeById(parseInt(nodeId));
    if (node) {
        return node.title || node.type || `Node ${nodeId}`;
    }
    return `Node ${nodeId}`;
}

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
                
                // 存储管理的节点列表（内部使用）
                this.managedNodes = [];
                this.nodeWidgets = new Map(); // 存储每个节点对应的widget
                this.isCollapsed = false; // 折叠状态标志
                this.originalWidgets = null; // 存储原始widgets数组
                
                // 创建主控开关
                const masterSwitch = this.addWidget("toggle", "🎛 全部控制 [YES]", true, function(value) {
                    // 更新显示文本
                    this.name = value ? "🎛 全部控制 [YES]" : "🎛 全部控制 [NO]";
                    
                    // value为true时表示YES(不忽略)，false时表示NO(忽略)
                    const bypass = !value;
                    
                    // 批量更新所有管理的节点
                    self.managedNodes.forEach(nodeId => {
                        setNodeBypassState(nodeId, bypass);
                        
                        // 同步更新单个节点的开关显示
                        const widgetData = self.nodeWidgets.get(nodeId);
                        if (widgetData && widgetData.toggle) {
                            const nodeName = getNodeName(nodeId);
                            widgetData.toggle.value = value;
                            widgetData.toggle.name = value ? `✅ ${nodeName} [YES]` : `⭕ ${nodeName} [NO]`;
                        }
                    });
                    
                    app.graph.setDirtyCanvas(true);
                });
                this.masterSwitch = masterSwitch; // 存储主控开关引用
                
                // 折叠菜单方法
                this.collapseMenu = function() {
                    if (this.isCollapsed) return; // 已经折叠
                    this.isCollapsed = true;
                    // 备份当前widgets（用于恢复）
                    this.originalWidgets = this.widgets.slice();
                    // 只保留主控开关
                    this.widgets = [this.masterSwitch];
                    // 添加展开按钮
                    this.addWidget("button", "📂 展开菜单", null, function() {
                        self.expandMenu();
                    });
                    // 设置高度为仅对应两项菜单的高度
                     this.size = [210, 80];
                    this.updateSize();
                    console.log("菜单已折叠");
                };
                
                // 展开菜单方法
               this.expandMenu = function() {
                    if (!this.isCollapsed) return; // 已经展开
                         this.isCollapsed = false;
                                                             // 恢复原始widgets
                        this.widgets = this.originalWidgets.slice();
                        this.updateSize(); // 立即更新大小
    
               // 延迟一点以确保高度刷新
                      setTimeout(() => {
                                 this.updateSize();
                       }, 0);
    
    console.log("菜单已展开");
};
                
                // 更新全局控制状态的方法
                this.updateMasterSwitch = function() {
                    // 检查所有节点的状态
                    let allYes = true;
                    let allNo = true;
                    
                    self.managedNodes.forEach(nodeId => {
                        const isBypassed = getNodeBypassState(nodeId);
                        if (isBypassed) {
                            allYes = false;
                        } else {
                            allNo = false;
                        }
                    });
                    
                    // 根据子节点状态更新主控开关
                    const masterWidget = self.widgets.find(w => w.name && w.name.includes("全部控制"));
                    if (masterWidget) {
                        if (allYes) {
                            masterWidget.value = true;
                            masterWidget.name = "🎛 全部控制 [YES]";
                        } else if (allNo) {
                            masterWidget.value = false;
                            masterWidget.name = "🎛 全部控制 [NO]";
                        } else {
                            // 混合状态 - 显示为中间状态
                            masterWidget.name = "🎛 全部控制 [混合]";
                        }
                    }
                };
                
                // 添加节点的方法
                this.addNodes = function(nodeIds) {
                    nodeIds.forEach(nodeId => {
                        if (!this.managedNodes.includes(nodeId)) {
                            this.managedNodes.push(nodeId);
                            this.addNodeWidget(nodeId);
                        }
                    });
                    this.updateMasterSwitch();
                    this.updateSize();
                };
                
                // 移除节点的方法
                this.removeNode = function(nodeId) {
                    const index = this.managedNodes.indexOf(nodeId);
                    if (index > -1) {
                        this.managedNodes.splice(index, 1);
                        
                        // 移除对应的widget
                        const widgetData = this.nodeWidgets.get(nodeId);
                        if (widgetData) {
                            // 移除toggle widget
                            if (widgetData.toggle) {
                                const toggleIndex = this.widgets.indexOf(widgetData.toggle);
                                if (toggleIndex > -1) {
                                    this.widgets.splice(toggleIndex, 1);
                                }
                            }
                            // 移除button widget
                            if (widgetData.button) {
                                const buttonIndex = this.widgets.indexOf(widgetData.button);
                                if (buttonIndex > -1) {
                                    this.widgets.splice(buttonIndex, 1);
                                }
                            }
                            this.nodeWidgets.delete(nodeId);
                        }
                        
                        // 恢复节点状态（设为不忽略）
                        setNodeBypassState(nodeId, false);
                        this.updateMasterSwitch();
                        this.updateSize();
                    }
                };
                
                // 为单个节点添加控制widget
                this.addNodeWidget = function(nodeId) {
                    const nodeName = getNodeName(nodeId);
                    const isBypassed = getNodeBypassState(nodeId);
                    const isActive = !isBypassed;
                    
                    // 创建toggle - true表示YES(不忽略)，false表示NO(忽略)
                    const toggleWidget = this.addWidget("toggle", 
                        isActive ? `✅ ${nodeName} [YES]` : `⭕ ${nodeName} [NO]`, 
                        isActive, 
                        function(value) {
                            // value为true时表示YES(不忽略)，false时表示NO(忽略)
                            const bypass = !value;
                            setNodeBypassState(nodeId, bypass);
                            
                            // 更新显示文本
                            const nodeName = getNodeName(nodeId);
                            this.name = value ? `✅ ${nodeName} [YES]` : `⭕ ${nodeName} [NO]`;
                            
                            // 更新主控开关状态
                            self.updateMasterSwitch();
                            
                            app.graph.setDirtyCanvas(true);
                        }
                    );
                    
                    const deleteButton = this.addWidget("button", `🗑 移除`, null, function() {
                        self.removeNode(nodeId);
                    });
                    
                    // 存储widget引用
                    this.nodeWidgets.set(nodeId, {
                        toggle: toggleWidget,
                        button: deleteButton
                    });
                };
                
                // 更新节点大小
                this.updateSize = function() {
                    this.computeSize();
                    this.setDirtyCanvas(true, true);
                };
                
                // 刷新所有节点状态
                this.refreshAllNodeStates = function() {
                    self.managedNodes.forEach(nodeId => {
                        const isBypassed = getNodeBypassState(nodeId);
                        const widgetData = self.nodeWidgets.get(nodeId);
                        
                        if (widgetData && widgetData.toggle) {
                            const nodeName = getNodeName(nodeId);
                            const isActive = !isBypassed;
                            
                            widgetData.toggle.value = isActive;
                            widgetData.toggle.name = isActive ? `✅ ${nodeName} [YES]` : `⭕ ${nodeName} [NO]`;
                        }
                    });
                    
                    self.updateMasterSwitch();
                    self.updateSize();
                };
                
                // 添加控制按钮
                setTimeout(() => {
                    // 添加操作按钮组
                    this.addWidget("button", "➕ 添加选中节点", null, function() {
                        const selectedIds = getSelectedNodeIds();
                        if (selectedIds.length === 0) {
                            console.log("请先选中要管理的节点");
                            return;
                        }
                        
                        // 过滤掉自己
                        const filteredIds = selectedIds.filter(id => id !== self.id.toString());
                        
                        if (filteredIds.length === 0) {
                            console.log("不能添加管理器自身");
                            return;
                        }
                        
                        self.addNodes(filteredIds);
                        console.log(`已添加 ${filteredIds.length} 个节点到管理器`);
                    });
                    
                    this.addWidget("button", "🔄 刷新状态", null, function() {
                        self.refreshAllNodeStates();
                        console.log("节点状态已刷新");
                    });
                    
                    this.addWidget("button", "✅ 全部启用", null, function() {
                        // 启用所有节点
                        self.managedNodes.forEach(nodeId => {
                            setNodeBypassState(nodeId, false);
                        });
                        self.refreshAllNodeStates();
                        console.log("已启用所有节点");
                    });
                    
                    this.addWidget("button", "⭕ 全部忽略", null, function() {
                        // 忽略所有节点
                        self.managedNodes.forEach(nodeId => {
                            setNodeBypassState(nodeId, true);
                        });
                        self.refreshAllNodeStates();
                        console.log("已忽略所有节点");
                    });
                    
                    this.addWidget("button", "🧹 清空列表", null, function() {
                        // 恢复所有节点状态为启用
                        self.managedNodes.forEach(nodeId => {
                            setNodeBypassState(nodeId, false);
                        });
                        
                        // 清除所有节点widget
                        self.nodeWidgets.forEach((widgetData, nodeId) => {
                            if (widgetData.toggle) {
                                const toggleIndex = self.widgets.indexOf(widgetData.toggle);
                                if (toggleIndex > -1) {
                                    self.widgets.splice(toggleIndex, 1);
                                }
                            }
                            if (widgetData.button) {
                                const buttonIndex = self.widgets.indexOf(widgetData.button);
                                if (buttonIndex > -1) {
                                    self.widgets.splice(buttonIndex, 1);
                                }
                            }
                        });
                        
                        self.managedNodes = [];
                        self.nodeWidgets.clear();
                        self.updateMasterSwitch();
                        self.updateSize();
                        
                        console.log("已清空管理列表并恢复所有节点");
                    });
                    
                    // 添加折叠菜单按钮
                    this.addWidget("button", "📌 折叠菜单", null, function() {
                        self.collapseMenu();
                    });
                    
                    // 存储原始widgets引用（用于折叠/展开恢复）
                    this.originalWidgets = this.widgets.slice();
                    
                    // 更新大小
                    this.updateSize();
                }, 100);
                
                // 自定义节点外观
                this.color = "#323e4f";
                this.bgcolor = "#1e2936";
                this.title = "📋 批量忽略管理器";
                
                // 设置最小宽度
                this.size = [320, 200];
                
                // 序列化和反序列化
                const onSerialize = this.onSerialize;
                this.onSerialize = function(o) {
                    if (onSerialize) {
                        onSerialize.apply(this, arguments);
                    }
                    o.managedNodes = this.managedNodes;
                    o.isCollapsed = this.isCollapsed; // 保存折叠状态
                };
                
                const onConfigure = this.onConfigure;
                this.onConfigure = function(o) {
                    if (onConfigure) {
                        onConfigure.apply(this, arguments);
                    }
                    if (o.managedNodes) {
                        this.managedNodes = o.managedNodes;
                        // 重建节点控制widgets
                        setTimeout(() => {
                            o.managedNodes.forEach(nodeId => {
                                this.addNodeWidget(nodeId);
                            });
                            this.refreshAllNodeStates();
                        }, 200);
                    }
                    // 恢复折叠状态
                    if (o.isCollapsed) {
                        setTimeout(() => {
                            this.collapseMenu();
                        }, 300);
                    }
                };
            };
        }
    }
});

console.log("批量忽略管理器已加载 - 带折叠菜单功能 v4.1");
