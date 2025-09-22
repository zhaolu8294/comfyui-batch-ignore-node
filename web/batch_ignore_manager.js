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
                this.collapseButton = null; // 折叠按钮引用
                this.collapsedHeight = 85; // 折叠时的高度
                this.isMixedState = false; // 混合状态标志
                this.savedMixedStates = new Map(); // 保存混合状态时每个节点的状态
                this.isInAllBypassMode = false; // 是否处于全忽略模式（从混合状态切换而来）
                
                // 创建主控开关
                const masterSwitch = this.addWidget("toggle", "🎛 全部控制 [YES]", true, function(value) {
                    if (self.isMixedState) {
                        // 混合状态下的逻辑：在混合状态和全忽略之间切换
                        if (self.isInAllBypassMode) {
                            // 当前是全忽略状态，恢复到保存的混合状态
                            self.savedMixedStates.forEach((shouldBypass, nodeId) => {
                                setNodeBypassState(nodeId, shouldBypass);
                                
                                // 同步更新单个节点的开关显示
                                const widgetData = self.nodeWidgets.get(nodeId);
                                if (widgetData && widgetData.toggle) {
                                    const nodeName = getNodeName(nodeId);
                                    widgetData.toggle.value = !shouldBypass;
                                    widgetData.toggle.name = !shouldBypass ? `✅ ${nodeName} [YES]` : `⭕ ${nodeName} [NO]`;
                                }
                            });
                            self.isInAllBypassMode = false;
                            console.log("恢复到混合状态");
                        } else {
                            // 当前是混合状态，切换到全忽略
                            self.managedNodes.forEach(nodeId => {
                                setNodeBypassState(nodeId, true);
                                
                                // 同步更新单个节点的开关显示
                                const widgetData = self.nodeWidgets.get(nodeId);
                                if (widgetData && widgetData.toggle) {
                                    const nodeName = getNodeName(nodeId);
                                    widgetData.toggle.value = false;
                                    widgetData.toggle.name = `⭕ ${nodeName} [NO]`;
                                }
                            });
                            self.isInAllBypassMode = true;
                            console.log("从混合状态切换到全忽略");
                        }
                        
                        // 更新主控开关显示
                        self.updateMasterSwitchDisplay();
                    } else {
                        // 非混合状态下的逻辑：在全开和全忽略之间切换
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
                        
                        console.log(`非混合状态：切换到${value ? '全部启用' : '全部忽略'}`);
                    }
                    
                    app.graph.setDirtyCanvas(true);
                });
                this.masterSwitch = masterSwitch; // 存储主控开关引用
                
                // 更新主控开关显示的方法
                this.updateMasterSwitchDisplay = function() {
                    if (!this.masterSwitch) return;
                    
                    if (this.isMixedState) {
                        if (this.isInAllBypassMode) {
                            // 混合状态下的全忽略模式
                            this.masterSwitch.value = false;
                            this.masterSwitch.name = "🎛 全部控制 [NO]";
                        } else {
                            // 混合状态
                            const enabledCount = this.managedNodes.filter(nodeId => !getNodeBypassState(nodeId)).length;
                            const bypassedCount = this.managedNodes.length - enabledCount;
                            this.masterSwitch.value = true; // 混合状态显示为开启
                            this.masterSwitch.name = `🎛 全部控制 [混合: ${enabledCount}启用/${bypassedCount}忽略]`;
                        }
                    } else {
                        // 非混合状态：全开或全关
                        const allEnabled = this.managedNodes.every(nodeId => !getNodeBypassState(nodeId));
                        this.masterSwitch.value = allEnabled;
                        this.masterSwitch.name = allEnabled ? "🎛 全部控制 [YES]" : "🎛 全部控制 [NO]";
                    }
                };
                
                // 保存当前混合状态的方法
                this.saveMixedStates = function() {
                    this.savedMixedStates.clear();
                    this.managedNodes.forEach(nodeId => {
                        const isBypassed = getNodeBypassState(nodeId);
                        this.savedMixedStates.set(nodeId, isBypassed);
                    });
                    console.log("保存混合状态:", Array.from(this.savedMixedStates.entries()));
                };
                
                // 强制刷新节点显示的方法
                this.forceRefresh = function() {
                    // 保持当前宽度
                    const currentWidth = this.size[0];
                    
                    if (this.isCollapsed) {
                        // 折叠状态：固定高度
                        this.size = [currentWidth, this.collapsedHeight];
                    } else {
                        // 展开状态：重新计算高度
                        this.computeSize();
                        this.size[0] = currentWidth; // 恢复宽度
                    }
                    
                    // 多种方式确保节点正确刷新
                    this.setDirtyCanvas(true, true);
                    
                    // 强制重新计算和绘制
                    if (app.canvas) {
                        app.canvas.setDirty(true, true);
                    }
                    
                    // 请求动画帧更新
                    requestAnimationFrame(() => {
                        this.setDirtyCanvas(true, true);
                        if (app.canvas) {
                            app.canvas.setDirty(true, true);
                        }
                    });
                };
                
                // 创建展开按钮的方法
                this.createExpandButton = function() {
                    return this.addWidget("button", "📂 展开菜单", null, function() {
                        self.expandMenu();
                    });
                };
                
                // 重建widgets的方法
                this.rebuildWidgets = function() {
                    // 保存当前宽度
                    const currentWidth = this.size[0];
                    
                    // 清空当前widgets
                    this.widgets = [];
                    
                    // 添加主控开关
                    this.widgets.push(this.masterSwitch);
                    
                    if (this.isCollapsed) {
                        // 折叠状态：重新创建展开按钮
                        this.expandButton = this.createExpandButton();
                        this.widgets.push(this.expandButton);
                        
                        // 立即设置折叠状态的固定高度和刷新
                        setTimeout(() => {
                            this.size = [currentWidth, this.collapsedHeight];
                            this.setDirtyCanvas(true, true);
                            if (app.canvas) {
                                app.canvas.setDirty(true, true);
                            }
                        }, 0);
                        
                        // 再次确保布局正确
                        setTimeout(() => {
                            this.size = [currentWidth, this.collapsedHeight];
                            this.setDirtyCanvas(true, true);
                            if (app.canvas) {
                                app.canvas.setDirty(true, true);
                            }
                        }, 50);
                    } else {
                        // 展开状态：显示所有内容
                        this.expandButton = null;
                        
                        // 添加所有固定的控制按钮（在节点列表之前）
                        this.fixedWidgets.forEach(widget => {
                            this.widgets.push(widget);
                        });
                        
                        // 添加所有节点的控制widgets（显示在最下面）
                        this.managedNodes.forEach(nodeId => {
                            const widgetData = this.nodeWidgets.get(nodeId);
                            if (widgetData) {
                                this.widgets.push(widgetData.toggle);
                                this.widgets.push(widgetData.button);
                            }
                        });
                        
                        // 重新计算展开状态的高度
                        setTimeout(() => {
                            this.computeSize();
                            this.size[0] = currentWidth; // 保持宽度不变
                            this.setDirtyCanvas(true, true);
                            if (app.canvas) {
                                app.canvas.setDirty(true, true);
                            }
                        }, 0);
                    }
                };
                
                // 折叠菜单方法
                this.collapseMenu = function() {
                    if (this.isCollapsed) return; // 已经折叠
                    
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
                    if (self.managedNodes.length === 0) {
                        // 没有管理的节点时，重置为默认状态
                        this.isMixedState = false;
                        this.isInAllBypassMode = false;
                        this.savedMixedStates.clear();
                        this.updateMasterSwitchDisplay();
                        return;
                    }
                    
                    // 检查所有节点的状态
                    let enabledCount = 0;  // 启用的节点数量
                    let bypassedCount = 0; // 忽略的节点数量
                    
                    self.managedNodes.forEach(nodeId => {
                        const isBypassed = getNodeBypassState(nodeId);
                        if (isBypassed) {
                            bypassedCount++;
                        } else {
                            enabledCount++;
                        }
                    });
                    
                    const wasInMixedState = this.isMixedState;
                    
                    if (enabledCount === self.managedNodes.length) {
                        // 全部启用 - 非混合状态
                        this.isMixedState = false;
                        this.isInAllBypassMode = false;
                        this.savedMixedStates.clear();
                    } else if (bypassedCount === self.managedNodes.length) {
                        // 全部忽略
                        if (wasInMixedState && this.savedMixedStates.size > 0) {
                            // 如果之前是混合状态，保持混合状态标志，标记为全忽略模式
                            this.isInAllBypassMode = true;
                        } else {
                            // 非混合状态下的全部忽略
                            this.isMixedState = false;
                            this.isInAllBypassMode = false;
                            this.savedMixedStates.clear();
                        }
                    } else {
                        // 混合状态 - 既有启用也有忽略的节点
                        if (!this.isMixedState) {
                            // 新进入混合状态，保存当前状态
                            this.isMixedState = true;
                            this.isInAllBypassMode = false;
                            this.saveMixedStates();
                            console.log(`进入混合状态: ${enabledCount} 个节点启用, ${bypassedCount} 个节点忽略`);
                        } else {
                            // 已经在混合状态中，更新保存的状态
                            this.isInAllBypassMode = false;
                            this.saveMixedStates();
                        }
                    }
                    
                    this.updateMasterSwitchDisplay();
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
                        this.savedMixedStates.delete(nodeId);
                        
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
                    self.forceRefresh();
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
                        // 清除混合状态
                        self.isMixedState = false;
                        self.isInAllBypassMode = false;
                        self.savedMixedStates.clear();
                        self.refreshAllNodeStates();
                        console.log("已启用所有节点");
                    });
                    
                    const bypassAllButton = this.addWidget("button", "⭕ 全部忽略", null, function() {
                        // 忽略所有节点
                        self.managedNodes.forEach(nodeId => {
                            setNodeBypassState(nodeId, true);
                        });
                        // 清除混合状态
                        self.isMixedState = false;
                        self.isInAllBypassMode = false;
                        self.savedMixedStates.clear();
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
                        self.isMixedState = false;
                        self.isInAllBypassMode = false;
                        self.savedMixedStates.clear();
                        self.updateMasterSwitch();
                        self.rebuildWidgets();
                        
                        console.log("已清空管理列表并恢复所有节点");
                    });
                    
                    // 创建折叠按钮
                    const collapseButton = this.addWidget("button", "📌 折叠菜单", null, function() {
                        self.collapseMenu();
                    });
                    this.collapseButton = collapseButton;
                    
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
                    o.isMixedState = this.isMixedState; // 保存混合状态
                    o.isInAllBypassMode = this.isInAllBypassMode; // 保存全忽略模式状态
                    // 保存混合状态的节点状态
                    if (this.savedMixedStates.size > 0) {
                        o.savedMixedStates = Array.from(this.savedMixedStates.entries());
                    }
                };
                
                const onConfigure = this.onConfigure;
                this.onConfigure = function(o) {
                    if (onConfigure) {
                        onConfigure.apply(this, arguments);
                    }
                    
                    // 恢复状态
                    if (o.isCollapsed !== undefined) {
                        this.isCollapsed = o.isCollapsed;
                    }
                    if (o.isMixedState !== undefined) {
                        this.isMixedState = o.isMixedState;
                    }
                    if (o.isInAllBypassMode !== undefined) {
                        this.isInAllBypassMode = o.isInAllBypassMode;
                    }
                    // 恢复保存的混合状态
                    if (o.savedMixedStates && Array.isArray(o.savedMixedStates)) {
                        this.savedMixedStates = new Map(o.savedMixedStates);
                    }
                    
                    if (o.managedNodes && Array.isArray(o.managedNodes)) {
                        this.managedNodes = o.managedNodes;
                        // 重建节点控制widgets
                        setTimeout(() => {
                            o.managedNodes.forEach(nodeId => {
                                this.createNodeWidget(nodeId);
                            });
                            this.refreshAllNodeStates();
                            
                            // 恢复折叠状态
                            setTimeout(() => {
                                this.rebuildWidgets();
                            }, 50);
                        }, 200);
                    }
                };
            };
        }
    }
});

console.log("批量忽略管理器已加载 - 优化主控开关逻辑 v6.1");
