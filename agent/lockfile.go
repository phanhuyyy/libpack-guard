package main

import (
	"encoding/json"
	"strings"
)

type lockfile struct {
	LockfileVersion int                    `json:"lockfileVersion"`
	Packages        map[string]lockPackage `json:"packages"`     // v2, v3
	Dependencies    map[string]lockDepV1   `json:"dependencies"` // v1 (and v2 for compat)
}

type lockPackage struct {
	Name                 string            `json:"name"`
	Version              string            `json:"version"`
	Link                 bool              `json:"link"`
	HasInstallScript     bool              `json:"hasInstallScript"`
	License              json.RawMessage   `json:"license"`
	Dependencies         map[string]string `json:"dependencies"`
	DevDependencies      map[string]string `json:"devDependencies"`
	OptionalDependencies map[string]string `json:"optionalDependencies"`
	PeerDependencies     map[string]string `json:"peerDependencies"`
}

type lockDepV1 struct {
	Version      string               `json:"version"`
	Dependencies map[string]lockDepV1 `json:"dependencies"`
}

const nmPrefix = "node_modules/"

// parseLockfile returns the packages listed in a package-lock.json (v1, v2, v3).
func parseLockfile(data []byte, projectRoot, sourceFile string) ([]Package, error) {
	var lf lockfile
	if err := json.Unmarshal(data, &lf); err != nil {
		return nil, err
	}
	mk := func(name, version string, direct bool) Package {
		return Package{Ecosystem: "npm", Name: name, Version: version, Scope: "project",
			ProjectRoot: projectRoot, SourceFile: sourceFile, Direct: direct}
	}
	var out []Package

	if len(lf.Packages) > 0 {
		root := lf.Packages[""]
		direct := map[string]bool{}
		for _, m := range []map[string]string{root.Dependencies, root.DevDependencies, root.OptionalDependencies, root.PeerDependencies} {
			for n := range m {
				direct[n] = true
			}
		}
		for key, p := range lf.Packages {
			if key == "" || p.Link || p.Version == "" {
				continue
			}
			idx := strings.LastIndex(key, nmPrefix)
			if idx < 0 {
				continue // workspace folder, not an installed dependency
			}
			installedAs := key[idx+len(nmPrefix):]
			name := installedAs
			if p.Name != "" {
				name = p.Name // npm alias: "node_modules/foo" -> real package name
			}
			isDirect := key == nmPrefix+installedAs && direct[installedAs]
			pkg := mk(name, p.Version, isDirect)
			pkg.License = jsonStringOrField(p.License, "type")
			pkg.HasInstallScript = p.HasInstallScript
			out = append(out, pkg)
		}
		return out, nil
	}

	var walk func(deps map[string]lockDepV1)
	walk = func(deps map[string]lockDepV1) {
		for name, d := range deps {
			n, v := name, d.Version
			if strings.HasPrefix(v, "npm:") { // alias: "npm:real-name@1.2.3"
				spec := strings.TrimPrefix(v, "npm:")
				if at := strings.LastIndex(spec, "@"); at > 0 {
					n, v = spec[:at], spec[at+1:]
				}
			}
			if v != "" && !strings.HasPrefix(v, "file:") {
				// v1 has no notion of direct deps; leave Direct false.
				out = append(out, mk(n, v, false))
			}
			walk(d.Dependencies)
		}
	}
	walk(lf.Dependencies)
	return out, nil
}

// jsonStringOrField decodes either "str" or {"<field>": "str"}.
func jsonStringOrField(raw json.RawMessage, field string) string {
	if len(raw) == 0 {
		return ""
	}
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return s
	}
	var m map[string]any
	if json.Unmarshal(raw, &m) == nil {
		if v, ok := m[field].(string); ok {
			return v
		}
	}
	return ""
}
