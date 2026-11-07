package main

import (
	"os"
	"path/filepath"
	"runtime"
)

// globalDirs returns the npm global node_modules directories for this OS.
func globalDirs() []string {
	if runtime.GOOS == "windows" {
		if ad := os.Getenv("APPDATA"); ad != "" {
			return []string{filepath.Join(ad, "npm", "node_modules")}
		}
		return nil
	}
	dirs := []string{"/usr/local/lib/node_modules"}
	if home, err := os.UserHomeDir(); err == nil {
		dirs = append(dirs, filepath.Join(home, ".npm-global", "lib", "node_modules"))
	}
	return dirs
}

func scanGlobal(dirs []string) []Package {
	var out []Package
	for _, d := range dirs {
		if lstatDir(d) {
			out = append(out, scanNodeModules(d, d, "global", 0)...)
		}
	}
	return out
}
