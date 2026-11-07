package main

import (
	"os"
	"os/user"
	"path/filepath"
	"runtime"
	"sort"
	"time"
)

// Mode selects which package manager's world a scan looks at. npm and pnpm are kept apart:
// an npm scan never reports pnpm packages and vice versa.
type Mode string

const (
	ModeNPM  Mode = "npm"
	ModePNPM Mode = "pnpm"
)

func parseMode(s string) (Mode, bool) {
	switch Mode(s) {
	case ModeNPM, ModePNPM:
		return Mode(s), true
	}
	return "", false
}

// scanRoots walks each root (up to maxDepth) looking for projects of the given package manager.
//
//	npm:  package-lock.json + real folders in node_modules; pnpm projects are skipped entirely
//	pnpm: node_modules/.pnpm store + top-level links (incl. workspace packages); nothing else
func scanRoots(roots []string, maxDepth int, mode Mode) []Package {
	var out []Package
	var visit func(dir string, depth int)
	visit = func(dir string, depth int) {
		pnpmProject := isPnpmProject(dir)
		if mode == ModeNPM && !pnpmProject {
			lock := filepath.Join(dir, "package-lock.json")
			if data, err := readFileLimited(lock); err == nil {
				if pkgs, err := parseLockfile(data, dir, lock); err == nil {
					out = append(out, pkgs...)
				}
			}
		}
		for _, name := range plainSubdirs(dir) {
			sub := filepath.Join(dir, name)
			if name == "node_modules" {
				hasStore := lstatDir(filepath.Join(sub, ".pnpm"))
				switch mode {
				case ModeNPM:
					if !pnpmProject && !hasStore {
						out = append(out, scanNodeModules(sub, dir, "project", 0)...)
					}
				case ModePNPM:
					// Also covers pnpm workspace packages whose node_modules only hold links
					// into the root .pnpm store (those links are marked pnpm by pnpmDirectLinks).
					for _, p := range scanPnpmLayout(sub, dir, "project") {
						if pnpmProject || hasStore {
							p.Manager = managerPnpm
						}
						if p.Manager == managerPnpm {
							out = append(out, p)
						}
					}
				}
				continue
			}
			if shouldSkipDir(name) || depth >= maxDepth {
				continue
			}
			visit(sub, depth+1)
		}
	}
	for _, r := range roots {
		if lstatDir(r) {
			visit(filepath.Clean(r), 0)
		}
	}
	return out
}

// dedupe removes records with the same name + version + project_root.
// A node_modules record (has metadata, proves installation) wins over a lockfile record,
// but keeps the lockfile's "direct" flag.
func dedupe(pkgs []Package) []Package {
	type key struct{ n, v, r string }
	idx := map[key]int{}
	var out []Package
	for _, p := range pkgs {
		k := key{p.Name, p.Version, p.ProjectRoot}
		i, seen := idx[k]
		if !seen {
			idx[k] = len(out)
			out = append(out, p)
			continue
		}
		cur := out[i]
		direct := cur.Direct || p.Direct
		hasScript := cur.HasInstallScript || p.HasInstallScript
		if filepath.Base(cur.SourceFile) == "package-lock.json" && filepath.Base(p.SourceFile) == "package.json" {
			cur = p
		}
		cur.Direct = direct
		cur.HasInstallScript = hasScript || len(cur.InstallScripts) > 0
		if p.Manager == managerPnpm {
			cur.Manager = managerPnpm
		}
		out[i] = cur
	}
	sort.Slice(out, func(a, b int) bool {
		if out[a].Name != out[b].Name {
			return out[a].Name < out[b].Name
		}
		if out[a].ProjectRoot != out[b].ProjectRoot {
			return out[a].ProjectRoot < out[b].ProjectRoot
		}
		return out[a].Version < out[b].Version
	})
	return out
}

func runScan(cfg Config, mode Mode) Result {
	var pkgs []Package
	switch mode {
	case ModeNPM:
		pkgs = scanGlobal(globalDirs())
	case ModePNPM:
		pkgs = scanPnpmGlobal(pnpmGlobalDirs())
	}
	pkgs = append(pkgs, scanRoots(cfg.Roots, cfg.MaxDepth, mode)...)
	if mode == ModePNPM {
		pkgs = prunePnpmOrphans(pkgs)
	}
	return Result{
		Manager:      string(mode),
		Machine:      currentMachine(),
		AgentVersion: version,
		ScannedAt:    time.Now().UTC().Format(time.RFC3339),
		Roots:        cfg.Roots,
		Packages:     dedupe(pkgs),
	}
}

func currentMachine() Machine {
	m := Machine{OS: runtime.GOOS, Arch: runtime.GOARCH}
	m.Hostname, _ = os.Hostname()
	if u, err := user.Current(); err == nil {
		m.Username = u.Username
	}
	return m
}
