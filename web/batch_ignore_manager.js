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
                this.fixedWidgets = []; // 存储固定的widgets（主控开关等）
                this.expandButton = null; // 展开按钮引用
                this.collapsedSize = [210, 80]; // 折叠时的尺寸
                this.expandedSize = null; // 展开时的尺寸
                
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
                
                // 更新节点大小的方法
                this.updateSize = function(forceSize = null) {
                    if (forceSize) {
                        this.size = forceSize.slice(); // 使用副本
                    } else if (this.isCollapsed) {
                        this.size = this.collapsedSize.slice(); // 使用副本
                    } else {
                        // 展开状态，计算实际需要的大小
                        this.computeSize();
                        this.expandedSize = this.size.slice(); // 保存展开时的尺寸
                    }
                    this.setDirtyCanvas(true, true);
                };
                
                // 重建widgets的方法
                this.rebuildWidgets = function() {
                    // 清空当前widgets
                    this.widgets = [];
                    
                    // 添加主控开关
                    this.widgets.push(this.masterSwitch);
                    
                    if (this.isCollapsed) {
                        // 折叠状态：只显示主控开关和展开按钮
                        if (!this.expandButton) {
                            this.expandButton = this.addWidget("button", "📂 展开菜单", null, function() {
                                self.expandMenu();
                            });
                        }
                        this.widgets.push(this.expandButton);
                        
                        // 设置折叠时的尺寸
                        this.updateSize(this.collapsedSize);
                    } else {
                        // 展开状态：显示所有widgets
                        this.expandButton = null;
                        
                        // 添加所有节点的控制widgets
                        this.managedNodes.forEach(nodeId => {
                            const widgetData = this.nodeWidgets.get(nodeId);
                            if (widgetData) {
                                this.widgets.push(widgetData.toggle);
                                this.widgets.push(widgetData.button);
                            }
                        });
                        
                        // 添加所有固定的控制按钮
                        this.fixedWidgets.forEach(widget => {
                            this.widgets.push(widget);
                        });
                        
                        // 计算展开时的尺寸
                        this.updateSize();
                    }
                };
                
                // 折叠菜单方法
                this.collapseMenu = function() {
                    if (this.isCollapsed) return; // 已经折叠
                    
                    // 保存当前展开时的尺寸
                    this.expandedSize = this.size.slice();
                    
                    this.isCollapsed = true;
                    this.rebuildWidgets();
                    console.log("菜单已折叠");
                };
                
                // 展开菜单方法
                this.expandMenu = function() {
                    if (!this.isCollapsed) return; // 已经展开
                    this.isCollapsed = false;
                    this.rebuildWidgets();
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
                    if (this.masterSwitch) {
                        if (allYes) {
                            this.masterSwitch.value = true;
                            this.masterSwitch.name = "🎛 全部控制 [YES]";
                        } else if (allNo) {
                            this.masterSwitch.value = false;
                            this.masterSwitch.name = "🎛 全部控制 [NO]";
                        } else {
                            // 混合状态 - 显示为中间状态
                            this.masterSwitch.name = "🎛 全部控制 [混合]";
                        }
                    }
                };
                
                // 添加节点的方法
                this.addNodes = function(nodeIds) {
                    nodeIds.forEach(nodeId => {
                        if (!this.managedNodes.includes(nodeId)) {
                            this.managedNodes.push(nodeId);
                            this.createNodeWidget(nodeId);
                        }
                    });
                    this.updateMasterSwitch();
                    this.rebuildWidgets();
                };
                
                // 移除节点的方法
                this.removeNode = function(nodeId) {
                    const index = this.managedNodes.indexOf(nodeId);
                    if (index > -1) {
                        this.managedNodes.splice(index, 1);
                        
                        // 移除对应的widget数据
                        this.nodeWidgets.delete(nodeId);
                        
                        // 恢复节点状态（设为不忽略）
                        setNodeBypassState(nodeId, false);
                        this.updateMasterSwitch();
                        this.rebuildWidgets();
                    }
                };
                
                // 创建单个节点的控制widget（不直接添加到widgets数组）
                this.createNodeWidget = function(nodeId) {
                    const nodeName = getNodeName(nodeId);
                    const isBypassed = getNodeBypassState(nodeId);
                    const isActive = !isBypassed;
                    
                    // 创建toggle widget
                    const toggleWidget = {
                        type: "toggle",
                        name: isActive ? `✅ ${nodeName} [YES]` : `⭕ ${nodeName} [NO]`,
                        value: isActive,
                        callback: function(value) {
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
                    };
                    
                    const deleteButton = {
                        type: "button",
                        name: `🗑 移除`,
                        callback: function() {
                            self.removeNode(nodeId);
                        }
                    };
                    
                    // 转换为真正的widget对象
                    const realToggle = this.addWidget(toggleWidget.type, toggleWidget.name, toggleWidget.value, toggleWidget.callback);
                    const realButton = this.addWidget(deleteButton.type, deleteButton.name, null, deleteButton.callback);
                    
                    // 立即从widgets数组中移除（稍后通过rebuildWidgets添加）
                    const toggleIndex = this.widgets.indexOf(realToggle);
                    const buttonIndex = this.widgets.indexOf(realButton);
                    if (toggleIndex > -1) this.widgets.splice(toggleIndex, 1);
                    if (buttonIndex > -1) this.widgets.splice(buttonIndex, 1);
                    
                    // 存储widget引用
                    this.nodeWidgets.set(nodeId, {
                        toggle: realToggle,
                        button: realButton
                    });
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
                
                // 初始化固定按钮
                setTimeout(() => {
                    // 创建所有固定的控制按钮
                    const addSelectedButton = this.addWidget("button", "➕ 添加选中节点", null, function() {
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
                    
                    const refreshButton = this.addWidget("button", "🔄 刷新状态", null, function() {
                        self.refreshAllNodeStates();
                        console.log("节点状态已刷新");
                    });
                    
                    const enableAllButton = this.addWidget("button", "✅ 全部启用", null, function() {
                        // 启用所有节点
                        self.managedNodes.forEach(nodeId => {
                            setNodeBypassState(nodeId, false);
                        });
                        self.refreshAllNodeStates();
                        console.log("已启用所有节点");
                    });
                    
                    const bypassAllButton = this.addWidget("button", "⭕ 全部忽略", null, function() {
                        // 忽略所有节点
                        self.managedNodes.forEach(nodeId => {
                            setNodeBypassState(nodeId, true);
                        });
                        self.refreshAllNodeStates();
                        console.log("已忽略所有节点");
                    });
                    
                    const clearButton = this.addWidget("button", "🧹 清空列表", null, function() {
                        // 恢复所有节点状态为启用
                        self.managedNodes.forEach(nodeId => {
                            setNodeBypassState(nodeId, false);
                        });
                        
                        self.managedNodes = [];
                        self.nodeWidgets.clear();
                        self.updateMasterSwitch();
                        self.rebuildWidgets();
                        
                        console.log("已清空管理列表并恢复所有节点");
                    });
                    
                    const collapseButton = this.addWidget("button", "📌 折叠菜单", null, function() {
                        self.collapseMenu();
                    });
                    
                    // 从widgets数组中移除所有固定按钮，存储到fixedWidgets
                    this.fixedWidgets = [
                        addSelectedButton,
                        refreshButton, 
                        enableAllButton,
                        bypassAllButton,
                        clearButton,
                        collapseButton
                    ];
                    
                    // 移除刚添加的按钮
                    this.fixedWidgets.forEach(widget => {
                        const index = this.widgets.indexOf(widget);
                        if (index > -1) {
                            this.widgets.splice(index, 1);
                        }
                    });
                    
                    // 重建widgets显示
                    this.rebuildWidgets();
                }, 100);
                
                // 自定义节点外观
                this.color = "#FF2A2A";
                this.bgcolor = "#FF2A2A";
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
                    o.collapsedSize = this.collapsedSize; // 保存折叠尺寸
                    if (this.expandedSize && Array.isArray(this.expandedSize)) {
                        o.expandedSize = this.expandedSize; // 保存展开尺寸
                    }
                };
                
                const onConfigure = this.onConfigure;
                this.onConfigure = function(o) {
                    if (onConfigure) {
                        onConfigure.apply(this, arguments);
                    }
                    
                    // 恢复折叠相关的属性，添加类型检查
                    if (o.isCollapsed !== undefined) {
                        this.isCollapsed = o.isCollapsed;
                    }
                    if (o.collapsedSize && Array.isArray(o.collapsedSize)) {
                        this.collapsedSize = o.collapsedSize.slice();
                    }
                    if (o.expandedSize && Array.isArray(o.expandedSize)) {
                        this.expandedSize = o.expandedSize.slice();
                    }
                    
                    if (o.managedNodes && Array.isArray(o.managedNodes)) {
                        this.managedNodes = o.managedNodes;
                        // 重建节点控制widgets
                        setTimeout(() => {
                            o.managedNodes.forEach(nodeId => {
                                this.createNodeWidget(nodeId);
                            });
                            this.refreshAllNodeStates();
                            
                            // 恢复折叠状态和正确的尺寸
                            setTimeout(() => {
                                this.rebuildWidgets();
                                
                                // 再次确保折叠状态的尺寸正确
                                if (this.isCollapsed) {
                                    setTimeout(() => {
                                        this.size = this.collapsedSize.slice();
                                        this.setDirtyCanvas(true, true);
                                    }, 50);
                                }
                            }, 50);
                        }, 200);
                    }
                };
            };
        }
    }
});

console.log("批量忽略管理器已加载 - 带折叠菜单功能 v4.4");
