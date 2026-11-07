package main

import (
	"os"
	"path/filepath"
	"runtime"
)

const appDirName = "libpack"

// dataDir is the only place the agent writes to. LIBPACK_DATA_DIR overrides it.
func dataDir() (string, error) {
	if d := os.Getenv("LIBPACK_DATA_DIR"); d != "" {
		return d, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	switch runtime.GOOS {
	case "windows":
		if la := os.Getenv("LOCALAPPDATA"); la != "" {
			return filepath.Join(la, appDirName), nil
		}
		return filepath.Join(home, "AppData", "Local", appDirName), nil
	case "darwin":
		return filepath.Join(home, "Library", "Application Support", appDirName), nil
	default:
		if x := os.Getenv("XDG_DATA_HOME"); x != "" {
			return filepath.Join(x, appDirName), nil
		}
		return filepath.Join(home, ".local", "share", appDirName), nil
	}
}
