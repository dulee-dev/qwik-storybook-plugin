import { withCompilerOptions } from "react-docgen-typescript";
import type { ComponentDoc } from "react-docgen-typescript";
import type { Plugin } from "vite";
import MagicString from "magic-string";
import ts from "typescript";
import path from "node:path";

export function isDocgenComponent(id: string) {
  // Query modules are optimizer output, not a second component declaration.
  return (
    !id.includes("?") &&
    !id.includes("\0") &&
    /\.tsx$/.test(id) &&
    !/(?:^|[/\\])(?:node_modules|dist|build|coverage|storybook-static|styled-system|__tests__|__mocks__|generated)(?:[/\\])/.test(
      id,
    ) &&
    !/\.(?:stories|story|test|spec|generated)\.tsx$/.test(id)
  );
}

function toKebabCase(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

/** One project-aware language service per Vite instance, created only when needed. */
export function createDocgenProject(root: string) {
  let service: ts.LanguageService | undefined;
  let parser: ReturnType<typeof withCompilerOptions>;
  const versions = new Map<string, number>();
  const cache = new Map<string, ComponentDoc[]>();
  const dependencies = new Map<string, Set<string>>();
  const importGraph = new Map<string, string[]>();
  let compilerOptions: ts.CompilerOptions;
  const extraRoots = new Set<string>();
  let configuredRoots = new Set<string>();
  let projectVersion = 0;
  const normalize = (id: string) => path.resolve(id);

  function initialize() {
    const configPath = ts.findConfigFile(root, ts.sys.fileExists);
    let options: ts.CompilerOptions = {
      jsx: ts.JsxEmit.Preserve,
      esModuleInterop: true,
    };
    let files: string[] = [];
    if (configPath) {
      const config = ts.readConfigFile(configPath, ts.sys.readFile);
      if (config.error)
        throw new Error(
          ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
        );
      const parsed = ts.parseJsonConfigFileContent(
        config.config,
        ts.sys,
        path.dirname(configPath),
      );
      const errors = parsed.errors.filter((error) => error.code !== 18003);
      if (errors.length)
        throw new Error(
          errors
            .map((error) =>
              ts.flattenDiagnosticMessageText(error.messageText, "\n"),
            )
            .join("\n"),
        );
      options = parsed.options;
      // Keep project ambient declarations, but load components lazily instead of
      // type-checking every route, story and test on the first preview.
      files = parsed.fileNames.filter((file) => /\.d\.[cm]?ts$/.test(file));
    }
    compilerOptions = options;
    configuredRoots = new Set(files.map(normalize));
    parser = withCompilerOptions(options, {
      propFilter: { skipPropsWithName: ["key", "q:slot"] },
    });
    service = ts.createLanguageService({
      getCompilationSettings: () => options,
      getScriptFileNames: () => [...new Set([...files, ...extraRoots])],
      getScriptVersion: (id) => String(versions.get(normalize(id)) ?? 0),
      getProjectVersion: () => String(projectVersion),
      getScriptSnapshot: (id) => {
        const contents = ts.sys.readFile(id);
        return contents === undefined
          ? undefined
          : ts.ScriptSnapshot.fromString(contents);
      },
      getCurrentDirectory: () => root,
      getDefaultLibFileName: ts.getDefaultLibFilePath,
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      realpath: ts.sys.realpath,
    });
  }

  function collectDependencies(id: string, result = new Set<string>()) {
    if (result.has(id)) return result;
    result.add(id);
    if (id.includes("/node_modules/")) return result;
    let imports = importGraph.get(id);
    if (!imports) {
      const source = service!.getProgram()!.getSourceFile(id);
      imports = source
        ? ts
            .preProcessFile(source.text)
            .importedFiles.flatMap(({ fileName }) => {
              const resolved = ts.resolveModuleName(
                fileName,
                id,
                compilerOptions,
                ts.sys,
              ).resolvedModule;
              return resolved ? [normalize(resolved.resolvedFileName)] : [];
            })
        : [];
      importGraph.set(id, imports);
    }
    for (const dependency of imports) collectDependencies(dependency, result);
    return result;
  }

  return {
    parse(id: string) {
      id = normalize(id);
      const previous = cache.get(id);
      if (previous) return previous;
      if (!service) initialize();
      if (!configuredRoots.has(id) && !extraRoots.has(id)) {
        extraRoots.add(id);
        projectVersion++;
      }
      const docs = parser.parseWithProgramProvider(
        id,
        () => service!.getProgram()!,
      );
      cache.set(id, docs);
      dependencies.set(id, collectDependencies(id));
      return docs;
    },
    invalidate(id: string) {
      id = normalize(id);
      // Type-only imports are absent from Vite's runtime graph. Follow the TS
      // graph instead; ambient declarations and configuration affect all docs.
      const globalChange = /(?:\.d\.[cm]?ts|\.json)$/.test(id);
      const affected = [...cache.keys()].filter(
        (file) => globalChange || dependencies.get(file)?.has(id),
      );
      for (const file of affected) {
        cache.delete(file);
        dependencies.delete(file);
      }
      importGraph.clear();
      versions.set(id, (versions.get(id) ?? 0) + 1);
      projectVersion++;
      if (/\.json$/.test(id)) {
        service?.dispose();
        service = undefined;
      }
      return affected;
    },
    dispose() {
      service?.dispose();
      service = undefined;
      cache.clear();
    },
  };
}

export function qwikDocgen(): Plugin {
  let project: ReturnType<typeof createDocgenProject>;
  return {
    name: "storybook:qwik-docgen-plugin",
    configResolved(config) {
      project = createDocgenProject(config.root);
    },
    handleHotUpdate(ctx) {
      if (!/\.(?:[cm]?[jt]sx?|json)$/.test(ctx.file)) return;
      const affected = project.invalidate(ctx.file);
      const modules = new Set(ctx.modules);
      for (const file of affected) {
        for (const module of ctx.server.moduleGraph.getModulesByFile(file) ??
          []) {
          ctx.server.moduleGraph.invalidateModule(module);
          modules.add(module);
        }
      }
      return [...modules];
    },
    closeBundle() {
      project?.dispose();
    },
    transform(src, id) {
      if (!isDocgenComponent(id)) return;
      const componentDocs = project.parse(id);
      if (!componentDocs.length) return;
      const s = new MagicString(src);
      s.append(
        `\ntypeof window !== 'undefined' && (window.__STORYBOOK_COMPONENT_DOC__ ??= new Map());`,
      );
      for (const componentDoc of componentDocs) {
        s.append(
          `\ntypeof window !== 'undefined' && (window.__STORYBOOK_COMPONENT_DOC__.set(${JSON.stringify(toKebabCase(componentDoc.displayName))}, ${JSON.stringify(componentDoc)}));`,
        );
      }
      return {
        code: s.toString(),
        map: s.generateMap({ hires: true, source: id }),
      };
    },
  };
}
