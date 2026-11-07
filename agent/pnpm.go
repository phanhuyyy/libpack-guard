package main

import (
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// pnpm support. Still read-only and still never *follows* a link:
//
//   - pnpm keeps the real package folders in node_modules/.pnpm/<entry>/node_modules/<name>;
//     their dependencies there are links, which plainSubdirs already skips. Scanning those real
//     folders gives every installed package exactly once.
//   - The project's direct dependencies are the links at the top of node_modules
//     (node_modules/<name>, node_modules/@scope/<name>). We read the link *target string*
//     with os.Readlink and, only when it has the shape .../node_modules/<name>, read that
//     single <target>/package.json. No directory is ever walked through a link.

const managerPnpm = "pnpm"

// fileExists reports whether path is a regular file (never follows links; content is not read).
func fileExists(path string) bool {
	info, err := os.Lstat(path)
	return err == nil && info.Mode().IsRegular()
}

// isPnpmProject: a pnpm lockfile sits next to node_modules (presence only, the YAML is not read).
func isPnpmProject(dir string) bool {
	return fileExists(filepath.Join(dir, "pnpm-lock.yaml"))
}

// scanPnpmStore reads node_modules/.pnpm/*/node_modules/<real package dirs>.
func scanPnpmStore(nmDir, projectRoot, scope string) []Package {
	store := filepath.Join(nmDir, ".pnpm")
	if !lstatDir(store) {
		return nil
	}
	var out []Package
	for _, entry := range plainSubdirs(store) {
		if entry == "node_modules" { // .pnpm/node_modules only holds hoisting links
			continue
		}
		inner := filepath.Join(store, entry, "node_modules")
		if lstatDir(inner) {
			out = append(out, scanNodeModules(inner, projectRoot, scope, maxNestedNodeModules)...)
		}
	}
	for i := range out {
		out[i].Manager = managerPnpm
		out[i].pnpmStoreDir = store
	}
	return out
}

// pkgDirOf is the real package folder of a record read from a package.json.
func pkgDirOf(p Package) string { return filepath.Dir(p.SourceFile) }

func dirKey(dir string) string {
	if runtime.GOOS == "windows" {
		return strings.ToLower(filepath.Clean(dir))
	}
	return filepath.Clean(dir)
}

// entryModulesDir: for .../.pnpm/<entry>/node_modules/<name> (or @scope/<name>) returns
// .../.pnpm/<entry>/node_modules, where pnpm puts the links to that package's dependencies.
func entryModulesDir(pkgDir, name string) string {
	d := filepath.Dir(pkgDir)
	if strings.HasPrefix(name, "@") {
		d = filepath.Dir(d)
	}
	return d
}

// prunePnpmOrphans drops .pnpm store entries that nothing uses any more.
//
// pnpm does not delete the old version's folder right away after an update/remove (it prunes
// lazily), so a store can hold orphans. We keep only store packages reachable from the
// direct-dependency links found anywhere in the scan (root and workspace packages), walking
// each reached package's dependency links. Only link *targets* are read; nothing is followed.
// A store that no direct link reaches at all is kept as-is (we would rather over-report).
func prunePnpmOrphans(pkgs []Package) []Package {
	byDir := map[string]int{} // store package dir -> index
	for i, p := range pkgs {
		if p.pnpmStoreDir != "" {
			byDir[dirKey(pkgDirOf(p))] = i
		}
	}
	if len(byDir) == 0 {
		return pkgs
	}
	reached := map[string]bool{}
	storesTouched := map[string]bool{}
	var queue []string
	push := func(dir string) {
		k := dirKey(dir)
		if reached[k] {
			return
		}
		if i, ok := byDir[k]; ok {
			reached[k] = true
			storesTouched[dirKey(pkgs[i].pnpmStoreDir)] = true
			queue = append(queue, dir)
		}
	}
	for _, p := range pkgs {
		if p.Direct && p.pnpmStoreDir == "" && p.Manager == managerPnpm {
			push(pkgDirOf(p))
		}
	}
	for len(queue) > 0 {
		dir := queue[0]
		queue = queue[1:]
		rec := pkgs[byDir[dirKey(dir)]]
		for depName, l := range linkEntries(entryModulesDir(dir, rec.Name)) {
			if t, ok := linkTarget(l); ok && hasNodeModulesShape(t, depName) {
				push(t)
			}
		}
	}
	out := pkgs[:0:0]
	for _, p := range pkgs {
		if p.pnpmStoreDir != "" && storesTouched[dirKey(p.pnpmStoreDir)] && !reached[dirKey(pkgDirOf(p))] {
			continue // orphan left behind in the store
		}
		out = append(out, p)
	}
	return out
}

// linkEntries lists node_modules/<name> and node_modules/@scope/<name> entries that are links
// (symlink or junction), as name -> link path.
func linkEntries(nmDir string) map[string]string {
	out := map[string]string{}
	entries, err := os.ReadDir(nmDir)
	if err != nil {
		return out
	}
	isLink := func(p string) bool {
		info, err := os.Lstat(p)
		return err == nil && info.Mode()&(fs.ModeSymlink|fs.ModeIrregular) != 0
	}
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}
		p := filepath.Join(nmDir, name)
		if strings.HasPrefix(name, "@") && lstatDir(p) {
			subs, _ := os.ReadDir(p)
			for _, s := range subs {
				sp := filepath.Join(p, s.Name())
				if isLink(sp) {
					out[name+"/"+s.Name()] = sp
				}
			}
			continue
		}
		if isLink(p) {
			out[name] = p
		}
	}
	return out
}

// linkTarget returns the absolute, cleaned target of a symlink/junction without following it.
func linkTarget(linkPath string) (string, bool) {
	t, err := os.Readlink(linkPath)
	if err != nil || t == "" {
		return "", false
	}
	t = strings.TrimPrefix(t, `\\?\`)
	t = strings.TrimPrefix(t, `\??\`)
	if !filepath.IsAbs(t) {
		t = filepath.Join(filepath.Dir(linkPath), t)
	}
	return filepath.Clean(t), true
}

// hasNodeModulesShape: target ends with node_modules/<name> (name may be @scope/name).
func hasNodeModulesShape(target, name string) bool {
	want := filepath.Join("node_modules", filepath.FromSlash(name))
	if runtime.GOOS == "windows" {
		return strings.HasSuffix(strings.ToLower(target), strings.ToLower(string(filepath.Separator)+want))
	}
	return strings.HasSuffix(target, string(filepath.Separator)+want)
}

// pnpmDirectLinks turns the top-level links of a node_modules dir into direct-dependency records.
// Links to workspace folders (no node_modules/<name> shape) are ignored.
func pnpmDirectLinks(nmDir, projectRoot, scope string) []Package {
	var out []Package
	for name, link := range linkEntries(nmDir) {
		target, ok := linkTarget(link)
		if !ok || !hasNodeModulesShape(target, name) {
			continue
		}
		pj := filepath.Join(target, "package.json")
		data, err := readFileLimited(pj)
		if err != nil {
			continue
		}
		var m manifest
		if json.Unmarshal(data, &m) != nil || m.Version == "" {
			continue
		}
		pkgName := m.Name
		if pkgName == "" {
			pkgName = name
		}
		p := Package{
			Ecosystem:      "npm",
			Name:           pkgName,
			Version:        m.Version,
			Scope:          scope,
			ProjectRoot:    projectRoot,
			SourceFile:     pj,
			Direct:         true,
			Description:    m.Description,
			License:        jsonStringOrField(m.License, "type"),
			Author:         jsonStringOrField(m.Author, "name"),
			Homepage:       m.Homepage,
			Repository:     cleanRepoURL(jsonStringOrField(m.Repository, "url")),
			InstallScripts: installScripts(m.Scripts),
		}
		p.HasInstallScript = len(p.InstallScripts) > 0
		if strings.Contains(strings.ToLower(target), ".pnpm") {
			p.Manager = managerPnpm
		}
		out = append(out, p)
	}
	return out
}

// pnpmHome is where pnpm keeps its global installs (PNPM_HOME overrides).
func pnpmHome() string {
	if h := os.Getenv("PNPM_HOME"); h != "" {
		return h
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	switch runtime.GOOS {
	case "windows":
		if la := os.Getenv("LOCALAPPDATA"); la != "" {
			return filepath.Join(la, "pnpm")
		}
		return filepath.Join(home, "AppData", "Local", "pnpm")
	case "darwin":
		return filepath.Join(home, "Library", "pnpm")
	default:
		if x := os.Getenv("XDG_DATA_HOME"); x != "" {
			return filepath.Join(x, "pnpm")
		}
		return filepath.Join(home, ".local", "share", "pnpm")
	}
}

// pnpmGlobalDirs finds global node_modules dirs: <home>/global/<v>/node_modules (older pnpm)
// and <home>/global/<v>/<group>/node_modules (pnpm 10+ keeps one group per global install).
func pnpmGlobalDirs() []string {
	home := pnpmHome()
	if home == "" {
		return nil
	}
	base := filepath.Join(home, "global")
	if !lstatDir(base) {
		return nil
	}
	var out []string
	for _, v := range plainSubdirs(base) {
		vdir := filepath.Join(base, v)
		if nm := filepath.Join(vdir, "node_modules"); lstatDir(nm) {
			out = append(out, nm)
		}
		for _, g := range plainSubdirs(vdir) {
			if g == "node_modules" {
				continue
			}
			if nm := filepath.Join(vdir, g, "node_modules"); lstatDir(nm) {
				out = append(out, nm)
			}
		}
	}
	return out
}

// scanPnpmLayout = real folders in .pnpm + direct links at the top of node_modules.
func scanPnpmLayout(nmDir, projectRoot, scope string) []Package {
	out := scanPnpmStore(nmDir, projectRoot, scope)
	return append(out, pnpmDirectLinks(nmDir, projectRoot, scope)...)
}

func scanPnpmGlobal(dirs []string) []Package {
	var out []Package
	for _, nm := range dirs {
		for _, p := range scanPnpmLayout(nm, nm, "global") {
			p.Manager = managerPnpm
			out = append(out, p)
		}
	}
	return out
}
