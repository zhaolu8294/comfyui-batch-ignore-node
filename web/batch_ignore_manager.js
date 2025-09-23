import { app } from "../../scripts/app.js";

const BYPASS_MODE = 4, NORMAL_MODE = 0;

// 工具函数
const setNodeBypassState = (nodeId, bypass) => {
    const node = app.graph.getNodeById(parseInt(nodeId));
    if (node) {
        node.mode = bypass ? BYPASS_MODE : NORMAL_MODE;
        node.setDirtyCanvas(true, true);
        return true;
    }
    return false;
};

const getNodeBypassState = (nodeId) => {
    const node = app.graph.getNodeById(parseInt(nodeId));
    return node ? node.mode === BYPASS_MODE : false;
};

const getSelectedNodeIds = () => Object.values(app.canvas.selected_nodes || {}).map(node => node.id.toString());

const getNodeName = (nodeId) => {
    const node = app.graph.getNodeById(parseInt(nodeId));
    return node ? (node.title || node.type || `Node ${nodeId}`) : `Node ${nodeId}`;
};

app.registerExtension({
    name: "BatchIgnoreManager",
    
    beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "BatchIgnoreManager") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                onNodeCreated?.apply(this, arguments);
                
                const self = this;
                
                // 状态变量
                Object.assign(this, {
                    managedNodes: [],
                    nodeWidgets: new Map(),
                    isCollapsed: false,
                    fixedWidgets: [],
                    expandButton: null,
                    collapsedHeight: 85,
                    isMixedState: false,
                    savedMixedStates: new Map(),
                    isInAllBypassMode: false
                });
                
                // 创建主控开关
                this.masterSwitch = this.addWidget("toggle", "🎛 全部控制 [YES]", true, function(value) {
                    self.handleMasterSwitchClick(value);
                    app.graph.setDirtyCanvas(true);
                });
                
                // 主控开关点击处理
                this.handleMasterSwitchClick = function(value) {
                    if (this.isMixedState) {
                        this.handleMixedStateToggle();
                    } else {
                        this.handleNormalStateToggle(value);
                    }
                };
                
                // 混合状态切换
                this.handleMixedStateToggle = function() {
                    if (this.isInAllBypassMode) {
                        // 恢复混合状态
                        this.savedMixedStates.forEach((shouldBypass, nodeId) => {
                            setNodeBypassState(nodeId, shouldBypass);
                            this.updateNodeWidget(nodeId, !shouldBypass);
                        });
                        this.isInAllBypassMode = false;
                    } else {
                        // 切换到全忽略
                        this.managedNodes.forEach(nodeId => {
                            setNodeBypassState(nodeId, true);
                            this.updateNodeWidget(nodeId, false);
                        });
                        this.isInAllBypassMode = true;
                    }
                    this.updateMasterSwitchDisplay();
                };
                
                // 正常状态切换
                this.handleNormalStateToggle = function(value) {
                    const bypass = !value;
                    this.managedNodes.forEach(nodeId => {
                        setNodeBypassState(nodeId, bypass);
                        this.updateNodeWidget(nodeId, value);
                    });
                    this.masterSwitch.name = value ? "🎛 全部控制 [YES]" : "🎛 全部控制 [NO]";
                };
                
                // 更新单个节点widget显示
                this.updateNodeWidget = function(nodeId, isActive) {
                    const widgetData = this.nodeWidgets.get(nodeId);
                    if (widgetData?.toggle) {
                        const nodeName = getNodeName(nodeId);
                        widgetData.toggle.value = isActive;
                        widgetData.toggle.name = isActive ? `✅ ${nodeName} [YES]` : `⭕ ${nodeName} [NO]`;
                    }
                };
                
                // 更新主控开关显示
                this.updateMasterSwitchDisplay = function() {
                    if (!this.masterSwitch) return;
                    
                    if (this.isMixedState) {
                        if (this.isInAllBypassMode) {
                            this.masterSwitch.value = false;
                            this.masterSwitch.name = "🎛 全部控制 [NO]";
                        } else {
                            const enabledCount = this.managedNodes.filter(nodeId => !getNodeBypassState(nodeId)).length;
                            const bypassedCount = this.managedNodes.length - enabledCount;
                            this.masterSwitch.value = true;
                            this.masterSwitch.name = `🎛 全部控制 [混合: ${enabledCount}启用/${bypassedCount}忽略]`;
                        }
                    } else {
                        const allEnabled = this.managedNodes.every(nodeId => !getNodeBypassState(nodeId));
                        this.masterSwitch.value = allEnabled;
                        this.masterSwitch.name = allEnabled ? "🎛 全部控制 [YES]" : "🎛 全部控制 [NO]";
                    }
                };
                
                // 保存混合状态
                this.saveMixedStates = function() {
                    this.savedMixedStates.clear();
                    this.managedNodes.forEach(nodeId => {
                        this.savedMixedStates.set(nodeId, getNodeBypassState(nodeId));
                    });
                };
                
                // 统一的刷新方法
                this.refresh = function() {
                    const currentWidth = this.size[0];
                    
                    if (this.isCollapsed) {
                        this.size = [currentWidth, this.collapsedHeight];
                    } else {
                        this.computeSize();
                        this.size[0] = currentWidth;
                    }
                    
                    this.setDirtyCanvas(true, true);
                    app.canvas?.setDirty(true, true);
                };
                
                // 重建widgets
                this.rebuildWidgets = function() {
                    const currentWidth = this.size[0];
                    this.widgets = [this.masterSwitch];
                    
                    if (this.isCollapsed) {
                        this.expandButton = this.addWidget("button", "📂 展开菜单", null, () => this.toggleCollapse());
                        this.widgets.push(this.expandButton);
                    } else {
                        this.expandButton = null;
                        this.widgets.push(...this.fixedWidgets);
                        
                        this.managedNodes.forEach(nodeId => {
                            const widgetData = this.nodeWidgets.get(nodeId);
                            if (widgetData) {
                                this.widgets.push(widgetData.toggle, widgetData.button);
                            }
                        });
                    }
                    
                    setTimeout(() => {
                        this.computeSize();
                        this.size[0] = currentWidth;
                        this.refresh();
                    }, 0);
                };
                
                // 切换折叠状态
                this.toggleCollapse = function() {
                    this.isCollapsed = !this.isCollapsed;
                    this.rebuildWidgets();
                };
                
                // 更新主控状态
                this.updateMasterSwitch = function() {
                    if (this.managedNodes.length === 0) {
                        this.resetToDefault();
                        return;
                    }
                    
                    const enabledCount = this.managedNodes.filter(nodeId => !getNodeBypassState(nodeId)).length;
                    const bypassedCount = this.managedNodes.length - enabledCount;
                    const wasInMixedState = this.isMixedState;
                    
                    if (enabledCount === this.managedNodes.length) {
                        this.resetToDefault();
                    } else if (bypassedCount === this.managedNodes.length) {
                        if (wasInMixedState && this.savedMixedStates.size > 0) {
                            this.isInAllBypassMode = true;
                        } else {
                            this.resetToDefault();
                        }
                    } else {
                        if (!this.isMixedState) {
                            this.isMixedState = true;
                            this.isInAllBypassMode = false;
                            this.saveMixedStates();
                        } else {
                            this.isInAllBypassMode = false;
                            this.saveMixedStates();
                        }
                    }
                    
                    this.updateMasterSwitchDisplay();
                };
                
                // 重置为默认状态
                this.resetToDefault = function() {
                    this.isMixedState = false;
                    this.isInAllBypassMode = false;
                    this.savedMixedStates.clear();
                };
                
                // 添加节点
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
                
                // 移除节点
                this.removeNode = function(nodeId) {
                    const index = this.managedNodes.indexOf(nodeId);
                    if (index > -1) {
                        this.managedNodes.splice(index, 1);
                        this.nodeWidgets.delete(nodeId);
                        this.savedMixedStates.delete(nodeId);
                        setNodeBypassState(nodeId, false);
                        this.updateMasterSwitch();
                        this.rebuildWidgets();
                    }
                };
                
                // 创建节点widget
                this.createNodeWidget = function(nodeId) {
                    const nodeName = getNodeName(nodeId);
                    const isActive = !getNodeBypassState(nodeId);
                    
                    const toggle = this.addWidget("toggle", 
                        isActive ? `✅ ${nodeName} [YES]` : `⭕ ${nodeName} [NO]`, 
                        isActive, 
                        (value) => {
                            setNodeBypassState(nodeId, !value);
                            this.name = value ? `✅ ${getNodeName(nodeId)} [YES]` : `⭕ ${getNodeName(nodeId)} [NO]`;
                            this.updateMasterSwitch();
                            app.graph.setDirtyCanvas(true);
                        }
                    );
                    
                    const button = this.addWidget("button", "🗑 移除", null, () => this.removeNode(nodeId));
                    
                    // 从widgets中移除，稍后通过rebuildWidgets添加
                    [toggle, button].forEach(widget => {
                        const index = this.widgets.indexOf(widget);
                        if (index > -1) this.widgets.splice(index, 1);
                    });
                    
                    this.nodeWidgets.set(nodeId, { toggle, button });
                };
                
                // 刷新所有节点状态
                this.refreshAllNodeStates = function() {
                    this.managedNodes.forEach(nodeId => {
                        const isActive = !getNodeBypassState(nodeId);
                        this.updateNodeWidget(nodeId, isActive);
                    });
                    this.updateMasterSwitch();
                    this.refresh();
                };
                
                // 批量操作
                this.batchOperation = function(bypass, clearMixed = true) {
                    this.managedNodes.forEach(nodeId => setNodeBypassState(nodeId, bypass));
                    if (clearMixed) this.resetToDefault();
                    this.refreshAllNodeStates();
                };
                
                // 初始化按钮配置
                const buttonConfigs = [
                    ["➕ 添加选中节点", () => {
                        const selectedIds = getSelectedNodeIds().filter(id => id !== this.id.toString());
                        if (selectedIds.length === 0) {
                            console.log(selectedIds.length === getSelectedNodeIds().length ? "不能添加管理器自身" : "请先选中要管理的节点");
                            return;
                        }
                        this.addNodes(selectedIds);
                        console.log(`已添加 ${selectedIds.length} 个节点到管理器`);
                    }],
                    ["🔄 刷新状态", () => {
                        this.refreshAllNodeStates();
                        console.log("节点状态已刷新");
                    }],
                    ["✅ 全部启用", () => {
                        this.batchOperation(false);
                        console.log("已启用所有节点");
                    }],
                    ["⭕ 全部忽略", () => {
                        this.batchOperation(true);
                        console.log("已忽略所有节点");
                    }],
                    ["🧹 清空列表", () => {
                        this.managedNodes.forEach(nodeId => setNodeBypassState(nodeId, false));
                        this.managedNodes = [];
                        this.nodeWidgets.clear();
                        this.resetToDefault();
                        this.updateMasterSwitch();
                        this.rebuildWidgets();
                        console.log("已清空管理列表并恢复所有节点");
                    }],
                    ["📌 折叠菜单", () => this.toggleCollapse()]
                ];
                
                // 初始化
                setTimeout(() => {
                    this.fixedWidgets = buttonConfigs.map(([name, callback]) => {
                        const widget = this.addWidget("button", name, null, callback);
                        const index = this.widgets.indexOf(widget);
                        if (index > -1) this.widgets.splice(index, 1);
                        return widget;
                    });
                    this.rebuildWidgets();
                }, 100);
                
                // 节点外观
                Object.assign(this, {
                    color: "#FF2A2A",
                    bgcolor: "#FF2A2A", 
                    title: "📋 批量忽略管理器",
                    size: [320, 200]
                });
                
                // 序列化
                const onSerialize = this.onSerialize;
                this.onSerialize = function(o) {
                    onSerialize?.apply(this, arguments);
                    Object.assign(o, {
                        managedNodes: this.managedNodes,
                        isCollapsed: this.isCollapsed,
                        isMixedState: this.isMixedState,
                        isInAllBypassMode: this.isInAllBypassMode,
                        savedMixedStates: this.savedMixedStates.size > 0 ? Array.from(this.savedMixedStates.entries()) : undefined
                    });
                };
                
                // 反序列化
                const onConfigure = this.onConfigure;
                this.onConfigure = function(o) {
                    onConfigure?.apply(this, arguments);
                    
                    Object.assign(this, {
                        isCollapsed: o.isCollapsed || false,
                        isMixedState: o.isMixedState || false,
                        isInAllBypassMode: o.isInAllBypassMode || false,
                        savedMixedStates: o.savedMixedStates ? new Map(o.savedMixedStates) : new Map()
                    });
                    
                    if (o.managedNodes?.length) {
                        this.managedNodes = o.managedNodes;
                        setTimeout(() => {
                            o.managedNodes.forEach(nodeId => this.createNodeWidget(nodeId));
                            this.refreshAllNodeStates();
                            setTimeout(() => this.rebuildWidgets(), 50);
                        }, 200);
                    }
                   // 新增：更新总控开关的显示
                   this.updateMasterSwitchDisplay();
                };
            };
        }
    }
});

console.log("批量忽略管理器已加载 - 优化版本 v6.2");
