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
exports.getTemplatesDir = getTemplatesDir;
exports.ensureTemplatesDir = ensureTemplatesDir;
exports.listTemplates = listTemplates;
exports.findMatchingTemplate = findMatchingTemplate;
exports.loadTemplate = loadTemplate;
exports.buildContext = buildContext;
exports.applyVariables = applyVariables;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
function getTemplatesDir() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return undefined;
    }
    return path.join(folders[0].uri.fsPath, '.vscode', 'templates');
}
function ensureTemplatesDir() {
    const dir = getTemplatesDir();
    if (!dir) {
        return undefined;
    }
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}
function listTemplates() {
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
function findMatchingTemplate(fileName) {
    const templates = listTemplates();
    // Sort by length descending so more-specific suffixes win
    templates.sort((a, b) => b.length - a.length);
    return templates.find((t) => fileName.endsWith(t));
}
function loadTemplate(templateName) {
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
function buildContext(fileUri, templateName) {
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
function applyVariables(template, ctx) {
    return template
        .replace(/\{fileName\}/g, ctx.fileName)
        .replace(/\{fullName\}/g, ctx.fullName)
        .replace(/\{baseName\}/g, ctx.baseName)
        .replace(/\{namespace\}/g, ctx.namespace);
}
//# sourceMappingURL=templateManager.js.map