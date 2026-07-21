import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function getTemplatesDir(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return undefined;
    }
    return path.join(folders[0].uri.fsPath, '.vscode', 'templates');
}

export function ensureTemplatesDir(): string | undefined {
    const dir = getTemplatesDir();
    if (!dir) {
        return undefined;
    }
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

export function listTemplates(): string[] {
    const dir = getTemplatesDir();
    if (!dir || !fs.existsSync(dir)) {
        return [];
    }
    return fs.readdirSync(dir).filter((entry) => {
        return fs.statSync(path.join(dir, entry)).isFile();
    });
}

/**
 * Find the best-matching template for a given filename.
 * Longer (more specific) template names take priority.
 * Returns the template filename (e.g. "Model.cs") or undefined.
 */
export function findMatchingTemplate(fileName: string): string | undefined {
    const templates = listTemplates();
    // Sort by length descending so more-specific suffixes win
    templates.sort((a, b) => b.length - a.length);
    return templates.find((t) => fileName.endsWith(t));
}

export function loadTemplate(templateName: string): string | undefined {
    const dir = getTemplatesDir();
    if (!dir) {
        return undefined;
    }
    const filePath = path.join(dir, templateName);
    if (!fs.existsSync(filePath)) {
        return undefined;
    }
    return fs.readFileSync(filePath, 'utf-8');
}

export interface TemplateContext {
    /** The full file name, e.g. `MyNewDataModel.cs` */
    fileName: string;
    /** The file name without its extension, e.g. `MyNewDataModel` */
    fullName: string;
    /** `fullName` with the template stem removed from the end, e.g. `MyNewData` */
    baseName: string;
    /** Dot-separated folder path from the workspace root, e.g. `Core.Models` */
    namespace: string;
}

export function buildContext(fileUri: vscode.Uri, templateName: string): TemplateContext {
    const fileName = path.basename(fileUri.fsPath);
    const ext = path.extname(fileName);
    const fullName = ext ? fileName.slice(0, -ext.length) : fileName;

    // Strip template extension to get the template stem (e.g. "Model.cs" → "Model")
    const templateExt = path.extname(templateName);
    const templateStem = templateExt
        ? templateName.slice(0, -templateExt.length)
        : templateName;

    const baseName = fullName.endsWith(templateStem)
        ? fullName.slice(0, -templateStem.length)
        : fullName;

    // Build namespace from relative path between workspace root and file directory
    const folders = vscode.workspace.workspaceFolders;
    let namespace = '';
    if (folders && folders.length > 0) {
        const workspaceRoot = folders[0].uri.fsPath;
        const fileDir = path.dirname(fileUri.fsPath);
        const rel = path.relative(workspaceRoot, fileDir);
        namespace = rel
            .split(path.sep)
            .filter((segment) => segment && segment !== '.')
            .join('.');
    }

    return { fileName, fullName, baseName, namespace };
}

export function applyVariables(template: string, ctx: TemplateContext): string {
    return template
        .replace(/\{fileName\}/g, ctx.fileName)
        .replace(/\{fullName\}/g, ctx.fullName)
        .replace(/\{baseName\}/g, ctx.baseName)
        .replace(/\{namespace\}/g, ctx.namespace);
}
