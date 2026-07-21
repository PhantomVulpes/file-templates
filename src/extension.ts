import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
    ensureTemplatesDir,
    getTemplatesDir,
    listTemplates,
    findMatchingTemplate,
    loadTemplate,
    buildContext,
    applyVariables,
} from './templateManager';

/** Files written by this extension's own commands — skip auto-apply for these. */
const ownCreatedFiles = new Set<string>();

/**
 * Files that were just created by an external source and are awaiting a
 * subsequent write before we apply the template.  We track them so that
 * when another extension creates-then-writes (two-step), we apply our
 * template on the write event rather than on the (potentially empty) create.
 */
const pendingCreatedFiles = new Set<string>();

export function activate(context: vscode.ExtensionContext): void {
    // Use a FileSystemWatcher instead of workspace.onDidCreateFiles so we
    // catch files created by any means — including other extensions that
    // write via Node's native fs or a language-server subprocess, neither of
    // which fires onDidCreateFiles.
    const watcher = vscode.workspace.createFileSystemWatcher('**/*');

    context.subscriptions.push(
        watcher,
        watcher.onDidCreate((uri) => {
            if (ownCreatedFiles.has(uri.fsPath)) {
                ownCreatedFiles.delete(uri.fsPath);
                return;
            }
            const fileName = path.basename(uri.fsPath);
            if (!findMatchingTemplate(fileName)) {
                return;
            }
            // Mark as pending: another extension may write its own content
            // right after creation.  We'll re-check on the first change event.
            pendingCreatedFiles.add(uri.fsPath);
            // Also schedule an immediate attempt for the case where the file
            // is written in a single atomic operation (so no change fires).
            autoApplyTemplate(uri);
        }),
        watcher.onDidChange((uri) => {
            if (!pendingCreatedFiles.has(uri.fsPath)) {
                return;
            }
            // Another extension just wrote content into a newly-created file —
            // apply our template over it.
            pendingCreatedFiles.delete(uri.fsPath);
            autoApplyTemplate(uri);
        }),
        vscode.commands.registerCommand(
            'file-templates.newFileFromTemplate',
            (uri?: vscode.Uri) => newFileFromTemplate(uri)
        ),
        vscode.commands.registerCommand(
            'file-templates.manageTemplates',
            () => manageTemplates()
        ),
        vscode.commands.registerCommand(
            'file-templates.newTemplate',
            () => newTemplate()
        ),
    );
}

// ---------------------------------------------------------------------------
// Command: New File from Template
// ---------------------------------------------------------------------------

async function newFileFromTemplate(folderUri?: vscode.Uri): Promise<void> {
    const templates = listTemplates();
    if (templates.length === 0) {
        const action = await vscode.window.showInformationMessage(
            'No templates found in .vscode/templates. Create one first?',
            'Create Template'
        );
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
    const templateContent = loadTemplate(templateName) ?? '';
    const ctx = buildContext(fileUri, templateName);
    const content = applyVariables(templateContent, ctx);

    ownCreatedFiles.add(filePath);
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf-8'));
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);
}

// ---------------------------------------------------------------------------
// Command: Manage Templates
// ---------------------------------------------------------------------------

async function manageTemplates(): Promise<void> {
    const dir = ensureTemplatesDir();
    if (!dir) {
        vscode.window.showErrorMessage('No workspace folder open.');
        return;
    }
    await vscode.commands.executeCommand(
        'revealInExplorer',
        vscode.Uri.file(dir)
    );
}

// ---------------------------------------------------------------------------
// Command: New Template
// ---------------------------------------------------------------------------

async function newTemplate(): Promise<void> {
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

    const dir = ensureTemplatesDir();
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
    await vscode.workspace.fs.writeFile(
        vscode.Uri.file(filePath),
        Buffer.from(defaultContent, 'utf-8')
    );
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    await vscode.window.showTextDocument(doc);
}

// ---------------------------------------------------------------------------
// Auto-apply template on file creation
// ---------------------------------------------------------------------------

async function autoApplyTemplate(fileUri: vscode.Uri): Promise<void> {
    // Skip files inside the templates directory itself
    const templatesDir = getTemplatesDir();
    if (templatesDir && fileUri.fsPath.startsWith(templatesDir + path.sep)) {
        return;
    }

    // Skip files that this extension created — template was already applied
    if (ownCreatedFiles.has(fileUri.fsPath)) {
        ownCreatedFiles.delete(fileUri.fsPath);
        return;
    }

    // We're handling this file now — remove from pending so the onDidChange
    // listener doesn't fire a second apply.
    pendingCreatedFiles.delete(fileUri.fsPath);

    const fileName = path.basename(fileUri.fsPath);
    const templateName = findMatchingTemplate(fileName);
    if (!templateName) {
        return;
    }

    const openDoc = vscode.workspace.textDocuments.find(
        (d) => d.uri.fsPath === fileUri.fsPath
    );

    const templateContent = loadTemplate(templateName);
    if (templateContent === undefined) {
        return;
    }

    const ctx = buildContext(fileUri, templateName);
    const content = applyVariables(templateContent, ctx);

    if (openDoc && !openDoc.isClosed) {
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
            openDoc.positionAt(0),
            openDoc.positionAt(openDoc.getText().length)
        );
        edit.replace(fileUri, fullRange, content);
        await vscode.workspace.applyEdit(edit);
    } else {
        await vscode.workspace.fs.writeFile(
            fileUri,
            Buffer.from(content, 'utf-8')
        );
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveTargetFolder(folderUri?: vscode.Uri): string | undefined {
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

function buildDefaultTemplateContent(templateName: string): string {
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

export function deactivate(): void {}
