package main

import (
	"os"
	"path/filepath"
	"testing"
)

// mkPkg writes <dir>/package.json for name@version.
func mkPkg(t *testing.T, dir, name, version string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	body := `{"name":"` + name + `","version":"` + version + `","license":"MIT"}`
	if err := os.WriteFile(filepath.Join(dir, "package.json"), []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

// link creates a directory symlink (relative target, like pnpm) or skips the test when not allowed.
func link(t *testing.T, target, at string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(at), 0o755); err != nil {
		t.Fatal(err)
	}
	rel, err := filepath.Rel(filepath.Dir(at), target)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(rel, at); err != nil {
		t.Skipf("cannot create symlinks here (Windows needs Developer Mode): %v", err)
	}
}

func findIn(pkgs []Package, name, version string) []Package {
	var out []Package
	for _, p := range pkgs {
		if p.Name == name && p.Version == version {
			out = append(out, p)
		}
	}
	return out
}

// A pnpm project: real packages live in node_modules/.pnpm, top-level entries are links.
func TestPnpmProject(t *testing.T) {
	root := t.TempDir()
	proj := filepath.Join(root, "proj")
	nm := filepath.Join(proj, "node_modules")
	store := filepath.Join(nm, ".pnpm")

	mkPkg(t, filepath.Join(store, "foo@1.0.0", "node_modules", "foo"), "foo", "1.0.0")
	mkPkg(t, filepath.Join(store, "@s+bar@2.0.0", "node_modules", "@s", "bar"), "@s/bar", "2.0.0")
	mkPkg(t, filepath.Join(store, "dep@3.0.0", "node_modules", "dep"), "dep", "3.0.0")
	// dependency link inside the store: must not create a second record
	link(t, filepath.Join(store, "dep@3.0.0", "node_modules", "dep"), filepath.Join(store, "foo@1.0.0", "node_modules", "dep"))
	// orphans pnpm leaves behind after an update: real folders nothing links to any more
	mkPkg(t, filepath.Join(store, "foo@0.5.0", "node_modules", "foo"), "foo", "0.5.0")
	mkPkg(t, filepath.Join(store, "unused@1.0.0", "node_modules", "unused"), "unused", "1.0.0")
	// top-level links = direct dependencies
	link(t, filepath.Join(store, "foo@1.0.0", "node_modules", "foo"), filepath.Join(nm, "foo"))
	link(t, filepath.Join(store, "@s+bar@2.0.0", "node_modules", "@s", "bar"), filepath.Join(nm, "@s", "bar"))
	// workspace link (not node_modules/<name> shaped): ignored
	mkPkg(t, filepath.Join(proj, "packages", "ws"), "ws", "0.0.1")
	link(t, filepath.Join(proj, "packages", "ws"), filepath.Join(nm, "ws"))

	// pnpm lockfile present + a stale package-lock.json claiming foo@0.9.0
	os.WriteFile(filepath.Join(proj, "pnpm-lock.yaml"), []byte("lockfileVersion: '9.0'\n"), 0o644)
	os.WriteFile(filepath.Join(proj, "package-lock.json"),
		[]byte(`{"lockfileVersion":3,"packages":{"":{"dependencies":{"foo":"^0.9.0"}},"node_modules/foo":{"version":"0.9.0"}}}`), 0o644)

	pkgs := dedupe(prunePnpmOrphans(scanRoots([]string{root}, 4, ModePNPM)))

	if len(findIn(pkgs, "foo", "0.9.0")) != 0 {
		t.Error("stale package-lock.json must be ignored in a pnpm project")
	}
	for _, c := range []struct {
		name, version string
		direct        bool
	}{{"foo", "1.0.0", true}, {"@s/bar", "2.0.0", true}, {"dep", "3.0.0", false}} {
		got := findIn(pkgs, c.name, c.version)
		if len(got) != 1 {
			t.Errorf("%s@%s: want exactly 1 record, got %d: %+v", c.name, c.version, len(got), got)
			continue
		}
		p := got[0]
		if p.Direct != c.direct || p.Manager != "pnpm" || p.Scope != "project" || p.ProjectRoot != proj {
			t.Errorf("%s@%s: direct=%v manager=%q scope=%s root=%s", c.name, c.version, p.Direct, p.Manager, p.Scope, p.ProjectRoot)
		}
	}
	if len(findIn(pkgs, "foo", "0.5.0"))+len(findIn(pkgs, "unused", "1.0.0")) != 0 {
		t.Error("orphaned .pnpm entries (not reachable from any direct link) must be dropped")
	}
	if len(findIn(pkgs, "ws", "0.0.1")) != 0 {
		t.Error("workspace link must not be reported as an installed dependency")
	}
}

// pnpm 10+ global installs: <PNPM_HOME>/global/v11/<group>/node_modules
func TestPnpmGlobal(t *testing.T) {
	home := t.TempDir()
	t.Setenv("PNPM_HOME", home)
	nm := filepath.Join(home, "global", "v11", "grp1", "node_modules")
	mkPkg(t, filepath.Join(nm, ".pnpm", "gtool@1.2.3", "node_modules", "gtool"), "gtool", "1.2.3")
	link(t, filepath.Join(nm, ".pnpm", "gtool@1.2.3", "node_modules", "gtool"), filepath.Join(nm, "gtool"))

	dirs := pnpmGlobalDirs()
	if len(dirs) != 1 || dirs[0] != nm {
		t.Fatalf("pnpmGlobalDirs = %v, want [%s]", dirs, nm)
	}
	pkgs := dedupe(prunePnpmOrphans(scanPnpmGlobal(dirs)))
	got := findIn(pkgs, "gtool", "1.2.3")
	if len(got) != 1 || !got[0].Direct || got[0].Scope != "global" || got[0].Manager != "pnpm" || got[0].ProjectRoot != nm {
		t.Errorf("global pnpm package: %+v", got)
	}
}

func TestLinkShape(t *testing.T) {
	sep := string(filepath.Separator)
	ok := filepath.Join("x", "node_modules", ".pnpm", "a@1", "node_modules", "@s", "a")
	if !hasNodeModulesShape(sep+ok, "@s/a") {
		t.Error("scoped node_modules target not recognised")
	}
	if hasNodeModulesShape(sep+filepath.Join("x", "packages", "a"), "a") {
		t.Error("workspace folder must not match")
	}
}

// npm and pnpm never see each other's packages.
func TestManagersAreSeparate(t *testing.T) {
	root := t.TempDir()

	// an npm project
	npmProj := filepath.Join(root, "npm-app")
	mkPkg(t, filepath.Join(npmProj, "node_modules", "left"), "left", "1.0.0")

	// a pnpm project with a stale package-lock.json
	pn := filepath.Join(root, "pnpm-app")
	store := filepath.Join(pn, "node_modules", ".pnpm")
	mkPkg(t, filepath.Join(store, "right@2.0.0", "node_modules", "right"), "right", "2.0.0")
	link(t, filepath.Join(store, "right@2.0.0", "node_modules", "right"), filepath.Join(pn, "node_modules", "right"))
	os.WriteFile(filepath.Join(pn, "pnpm-lock.yaml"), []byte("lockfileVersion: '9.0'\n"), 0o644)
	os.WriteFile(filepath.Join(pn, "package-lock.json"),
		[]byte(`{"lockfileVersion":3,"packages":{"node_modules/stale":{"version":"0.0.1"}}}`), 0o644)

	npm := dedupe(scanRoots([]string{root}, 3, ModeNPM))
	if len(npm) != 1 || npm[0].Name != "left" || npm[0].Manager != "" {
		t.Errorf("npm scan must only see the npm project: %+v", npm)
	}
	pnpm := dedupe(prunePnpmOrphans(scanRoots([]string{root}, 3, ModePNPM)))
	if len(pnpm) != 1 || pnpm[0].Name != "right" || pnpm[0].Manager != "pnpm" {
		t.Errorf("pnpm scan must only see the pnpm project: %+v", pnpm)
	}
}
