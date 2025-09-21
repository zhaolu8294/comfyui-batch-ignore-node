# Batch Ignore Manager

An advanced node-management plugin for [ComfyUI](https://github.com/comfyanonymous/ComfyUI) that provides a visual interface to batch-control nodes’ enable/ignore states.

## Features

### 🎯 Core Features
- Batch node management: control the ignore state of multiple nodes via a single controller node
- Visual control UI: each managed node has its own toggle control
- Global master switch: toggle all nodes’ enable/ignore states with one click
- Real-time state sync: automatically detect and display each node’s current state

### 🛠️ Operations
- Add selected nodes: add currently selected nodes to the manager
- Refresh status: re-sync the current state of all nodes
- Enable all: enable all managed nodes with one click
- Ignore all: ignore all managed nodes with one click
- Clear list: remove all nodes and restore their states

### 💾 Persistence
- Workflow save: manager state is saved with the workflow
- Auto-restore: automatically restores all node management relationships when loading a workflow

## Installation

1. Place the plugin files into ComfyUI’s `custom_nodes` directory
2. Restart ComfyUI or refresh the node list
3. Find the “Batch Ignore Manager” node under the “utils” category in the node menu

## Usage Guide

### Basic Usage

1. Create a manager: add the “Batch Ignore Manager” node from the node menu
2. Add nodes: select the nodes you want to manage, then click the “➕ Add Selected Nodes” button in the manager
3. Control state: use each node’s toggle or the global master switch to control states

### Control Descriptions

- 🎛️ Full Control: master switch that controls the overall state of all nodes
- ✅ Node Name [YES]: individual node toggle (green indicates enabled)
- ⭕ Node Name [NO]: individual node toggle (red indicates ignored)
- 🗑️ Remove: remove the node from the manager
- Action button group: provides batch operation buttons

### State Indicators

- YES: node is enabled (executes normally)
- NO: node is ignored (bypassed)
- Mixed: master switch shows mixed state when nodes are inconsistent

## Technical Details

### Frontend Logic
All node control logic is implemented in frontend JavaScript:
- Use `BYPASS_MODE = 4` to set the ignored state
- Use `NORMAL_MODE = 0` to set the normal state
- Real-time updates of node appearance and state display

### Backend Framework
Python side provides the basic node framework:
- Defines node input and output types
- Provides node categories and metadata
- Ensures compatibility with ComfyUI

### Data Persistence
- Uses node serialization to save the list of managed nodes
- Automatically rebuilds management relationships when loading a workflow

## Notes

1. Cannot manage itself: the manager cannot add itself to the management list
2. Node ID dependency: management is based on node IDs; be mindful when duplicating nodes
3. State sync: after manually changing a node’s state, click “Refresh Status” to synchronize
4. Performance: when managing many nodes, the UI may become long; consider using multiple managers for grouping

## Version Info

- Current version: v4.0 (logic-optimized)
- Compatibility: latest ComfyUI
- Update date: 2025-09-21

## Troubleshooting

### Common Issues

1. Node state out of sync: click “Refresh Status”
2. Node not found: the node may have been deleted; use “Clear List” to clean up
3. UI display issues: resize the manager node or refresh the page

### Logs
The browser console will output detailed operation logs, including:
- Number of successful/failed node operations
- List of missing node IDs
- Results of various actions

## Development

### File Structure
```
batch_ignore_manager/
├── init.py                 # Plugin entry
├── batch_ignore_node.py    # Node class definition
└── web/
    └── extensions.js       # Frontend logic
```

### Extension API
The plugin uses ComfyUI’s standard extension mechanism:
- `app.registerExtension()` to register the extension
- `beforeRegisterNodeDef` to modify node behavior
- Uses the standard widget system to build UI controls

## Support & Feedback
If you have questions or suggestions, please provide:
1. ComfyUI version
2. Plugin version
3. Browser console error messages

4. Steps to reproduce the issue
