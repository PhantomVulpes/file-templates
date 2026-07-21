# File Templates

A VS Code extension for creating new files from customizable templates,with automatic template application based on filename suffixes.

## Features

- **Auto-apply template on file creation** - Configure suffix mappings so that any new file whose name ense with a given suffix (e.g. `Model.cs`) automatically gets the matching template applied
- **New File from Template** - Right-click a folder in the Explorerand choose *File Templates: New File from Template* to pick an existing template manually.
- **Template variables** - Templates support placeholders that are replaced with values derived from the new file's name and location.
- **Template sharing** - Templates are stored in `.vscode/templates` so they can be moved to other projects easily or shared amongst teams if desired.

## Getting Started

1. Run **File Templates: New Template** to create a new template.
1. Modify your new template. Utilize variables below to improve your template.

## Template Variables

| Variable | Resolves to |
| --- | --- |
| `{fileName}` | The full file name. i.e. `MyNewDataModel.cs` |
| `{fullName}` | The full name entered for the file. i.e. `MyNewDataModel` |
| `{baseName}` | The file stem with the template name removed. i.e. `MyNewData` |
| `{namespace}` | Dot-separated folder path from workspace root. i.e. `Core.Models` |

Templates live under `.vscode/templates/`. i.e. `.vscode/templates/Model.cs`. Any file named `*Model.cs` will load this template. Templates with longer, more specific names are prioritized.

## Commands

| Command | Description |
| --- | --- |
| `File Templates: New File from Template` | Pick a template and create a named file. |
| `File Templates: Manage Templates` | Open the templates folder in the file explorer. |
| `File Templates: New Template` | Creates a new template in the templates folder and opens it for editing. |