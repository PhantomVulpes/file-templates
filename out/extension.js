"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const templateManager_1 = require("./templateManager");
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('file-templates.newFileFromTemplate', (uri) => newFileFromTemplate(uri)), vscode.commands.registerCommand('file-templates.manageTemplates', () => manageTemplates()), vscode.commands.registerCommand('file-templates.newTemplate', () => newTemplate()), vscode.workspace.onDidCreateFiles((event) => {
        for (const fileUri of event.files) {
            autoApplyTemplate(fileUri);
        }
    }));
}
// ---------------------------------------------------------------------------
// Command: New File from Template
// ---------------------------------------------------------------------------
async function newFileFromTemplate(folderUri) {
    const templates = (0, templateManager_1.listTemplates)();
    if (templates.length === 0) {
        const action = await vscode.window.showInformationMessage('No templates found in .vscode/templates. Create one first?', 'Create Template');
        if (action === 'Create Template') {
            await newTemplate();
        }
        return;
    }
    const templateName = await vscode.window.showQuickPick(templates, {
        placeHolder: 'Select a template',
        title: 'New File from Template',
    });
    if (!templateName) {
        return;
    }
    const templateExt = path.extname(templateName);
    const templateStem = templateExt
        ? templateName.slice(0, -templateExt.length)
        : templateName;
    const inputName = await vscode.window.showInputBox({
        title: 'New File from Template',
        prompt: `Enter the name for the new file (will be created as <name>${templateName})`,
        placeHolder: `MyNew${templateStem}`,
        validateInput: (value) => {
            if (!value || value.trim() === '') {
                return 'Name cannot be empty';
            }
            if (/[/\\:*?"<>|]/.test(value)) {
                return 'Name contains invalid characters';
            }
            return undefined;
        },
    });
    if (!inputName) {
        return;
    }
    // Resolve target folder: right-click URI → active editor dir → workspace root
    const targetFolder = resolveTargetFolder(folderUri);
    if (!targetFolder) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
    }
    const finalFileName = inputName + templateName; // e.g. MyNewData + Model.cs
    const filePath = path.join(targetFolder, finalFileName);
    if (fs.existsSync(filePath)) {
        vscode.window.showErrorMessage(`File already exists: ${finalFileName}`);
        return;
    }
    const fileUri = vscode.Uri.file(filePath);
    const templateContent = (0, templateManager_1.loadTemplate)(templateName) ?? '';
    const ctx = (0, templateManager_1.buildContext)(fileUri, templateName);
    const content = (0, templateManager_1.applyVariables)(templateContent, ctx);
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);
}
// ---------------------------------------------------------------------------
// Command: Manage Templates
// ---------------------------------------------------------------------------
async function manageTemplates() {
    const dir = (0, templateManager_1.ensureTemplatesDir)();
    if (!dir) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
    }
    await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(dir));
}
// ---------------------------------------------------------------------------
// Command: New Template
// ---------------------------------------------------------------------------
async function newTemplate() {
    const templateName = await vscode.window.showInputBox({
        title: 'New Template',
        prompt: 'Enter template name — any new file whose name ends with this will use it',
        placeHolder: 'Model.cs',
        validateInput: (value) => {
            if (!value || value.trim() === '') {
                return 'Template name cannot be empty';
            }
            if (/[/\\:*?"<>|]/.test(value)) {
                return 'Name contains invalid characters';
            }
            return undefined;
        },
    });
    if (!templateName) {
        return;
    }
    const dir = (0, templateManager_1.ensureTemplatesDir)();
    if (!dir) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
    }
    const filePath = path.join(dir, templateName);
    // If the template already exists just open it
    if (fs.existsSync(filePath)) {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        await vscode.window.showTextDocument(doc);
        return;
    }
    const defaultContent = buildDefaultTemplateContent(templateName);
    await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(defaultContent, 'utf-8'));
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    await vscode.window.showTextDocument(doc);
}
// ---------------------------------------------------------------------------
// Auto-apply template on file creation
// ---------------------------------------------------------------------------
async function autoApplyTemplate(fileUri) {
    // Skip files inside the templates directory itself
    const templatesDir = (0, templateManager_1.getTemplatesDir)();
    if (templatesDir && fileUri.fsPath.startsWith(templatesDir + path.sep)) {
        return;
    }
    const fileName = path.basename(fileUri.fsPath);
    const templateName = (0, templateManager_1.findMatchingTemplate)(fileName);
    if (!templateName) {
        return;
    }
    // Only apply to empty files
    const openDoc = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === fileUri.fsPath);
    if (openDoc) {
        if (openDoc.getText().length > 0) {
            return;
        }
    }
    else {
        try {
            const stat = await vscode.workspace.fs.stat(fileUri);
            if (stat.size > 0) {
                return;
            }
        }
        catch {
            return;
        }
    }
    const templateContent = (0, templateManager_1.loadTemplate)(templateName);
    if (templateContent === undefined) {
        return;
    }
    const ctx = (0, templateManager_1.buildContext)(fileUri, templateName);
    const content = (0, templateManager_1.applyVariables)(templateContent, ctx);
    if (openDoc && !openDoc.isClosed) {
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(openDoc.positionAt(0), openDoc.positionAt(openDoc.getText().length));
        edit.replace(fileUri, fullRange, content);
        await vscode.workspace.applyEdit(edit);
    }
    else {
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));
    }
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function resolveTargetFolder(folderUri) {
    if (folderUri) {
        return folderUri.fsPath;
    }
    // Use the directory of the active editor if available
    const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;
    if (activeFile) {
        return path.dirname(activeFile);
    }
    // Fall back to workspace root
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
}
function buildDefaultTemplateContent(templateName) {
    const ext = path.extname(templateName).toLowerCase();
    switch (ext) {
        case '.cs':
            return [
                'namespace {namespace};',
                '',
                'public class {fullName}',
                '{',
                '}',
            ].join('\n');
        case '.ts':
        case '.js':
            return `export class {fullName} {\n}\n`;
        case '.tsx':
        case '.jsx':
            return [
                "import React from 'react';",
                '',
                'export function {fullName}() {',
                '    return (',
                '        <div>',
                '            {fullName}',
                '        </div>',
                '    );',
                '}',
                '',
            ].join('\n');
        default:
            return `// {fileName}\n`;
    }
}
function deactivate() { }
//# sourceMappingURL=extension.js.map