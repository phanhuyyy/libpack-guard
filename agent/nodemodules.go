package main

import (
	"encoding/json"
	"path/filepath"
	"strings"
)

const maxNestedNodeModules = 12

type manifest struct {
	Name        string          `json:"name"`
	Version     string          `json:"version"`
	Description string          `json:"description"`
	License     json.RawMessage `json:"license"`
	Author      json.RawMessage `json:"author"`
	Homepage    string          `json:"homepage"`
	Repository  json.RawMessage `json:"repository"`
	Scripts     map[string]any  `json:"scripts"`
}

// installHooks are the lifecycle scripts npm runs automatically when a package is installed.
var installHooks = []string{"preinstall", "install", "postinstall"}

const maxScriptLen = 2000

func installScripts(scripts map[string]any) map[string]string {
	var out map[string]string
	for _, h := range installHooks {
		s, ok := scripts[h].(string)
		if !ok || s == "" {
			continue
		}
		if len(s) > maxScriptLen {
			s = s[:maxScriptLen] + "…"
		}
		if out == nil {
			out = map[string]string{}
		}
		out[h] = s
	}
	return out
}

// scanNodeModules reads node_modules/<name>/package.json and node_modules/@scope/<name>/package.json,
// recursing into nested node_modules. It never reads any other file.
func scanNodeModules(nmDir, projectRoot, scope string, depth int) []Package {
	if depth > maxNestedNodeModules {
		return nil
	}
	var out []Package
	for _, name := range plainSubdirs(nmDir) {
		if strings.HasPrefix(name, ".") {
			continue // .bin, .cache, ...
		}
		if strings.HasPrefix(name, "@") {
			scopeDir := filepath.Join(nmDir, name)
			for _, sub := range plainSubdirs(scopeDir) {
				out = append(out, readInstalled(filepath.Join(scopeDir, sub), name+"/"+sub, projectRoot, scope, depth)...)
			}
			continue
		}
		out = append(out, readInstalled(filepath.Join(nmDir, name), name, projectRoot, scope, depth)...)
	}
	return out
}

func readInstalled(pkgDir, dirName, projectRoot, scope string, depth int) []Package {
	var out []Package
	pj := filepath.Join(pkgDir, "package.json")
	if data, err := readFileLimited(pj); err == nil {
		var m manifest
		if json.Unmarshal(data, &m) == nil && m.Version != "" {
			name := m.Name
			if name == "" {
				name = dirName
			}
			out = append(out, Package{
				Ecosystem:      "npm",
				Name:           name,
				Version:        m.Version,
				Scope:          scope,
				ProjectRoot:    projectRoot,
				SourceFile:     pj,
				Description:    m.Description,
				License:        jsonStringOrField(m.License, "type"),
				Author:         jsonStringOrField(m.Author, "name"),
				Homepage:       m.Homepage,
				Repository:     cleanRepoURL(jsonStringOrField(m.Repository, "url")),
				InstallScripts: installScripts(m.Scripts),
			})
			out[len(out)-1].HasInstallScript = len(out[len(out)-1].InstallScripts) > 0
		}
	}
	nested := filepath.Join(pkgDir, "node_modules")
	if lstatDir(nested) {
		out = append(out, scanNodeModules(nested, projectRoot, scope, depth+1)...)
	}
	return out
}

func cleanRepoURL(u string) string {
	u = strings.TrimPrefix(u, "git+")
	u = strings.TrimSuffix(u, ".git")
	if strings.HasPrefix(u, "git://") {
		u = "https://" + strings.TrimPrefix(u, "git://")
	}
	if strings.HasPrefix(u, "github:") {
		u = "https://github.com/" + strings.TrimPrefix(u, "github:")
	}
	return u
}
