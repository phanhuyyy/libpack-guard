package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
)

const defaultMaxDepth = 8

type Config struct {
	Roots    []string `json:"roots"`
	MaxDepth int      `json:"max_depth"`
}

// configPaths lists where config.json is looked up, first match wins:
//  1. <datadir>/config.json  (written by the UI's "Cài đặt quét" page)
//  2. config.json next to the executable
func configPaths() []string {
	var paths []string
	if d, err := dataDir(); err == nil {
		paths = append(paths, filepath.Join(d, "config.json"))
	}
	if exe, err := os.Executable(); err == nil {
		paths = append(paths, filepath.Join(filepath.Dir(exe), "config.json"))
	}
	return paths
}

// loadConfig reads the first config.json found. No file at all means defaults.
func loadConfig() (Config, error) {
	cfg := Config{}
	for _, p := range configPaths() {
		data, err := readFileLimited(p)
		if errors.Is(err, fs.ErrNotExist) {
			continue
		}
		if err != nil {
			return cfg, err
		}
		if err := json.Unmarshal(data, &cfg); err != nil {
			return cfg, fmt.Errorf("%s: %w", p, err)
		}
		break
	}
	if len(cfg.Roots) == 0 {
		cfg.Roots = defaultRoots()
	}
	if cfg.MaxDepth <= 0 {
		cfg.MaxDepth = defaultMaxDepth
	}
	return cfg, nil
}

func defaultRoots() []string {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}
	var names []string
	if runtime.GOOS == "windows" {
		names = []string{"source", "Documents", "code", "projects", "repos", "Desktop"}
	} else {
		names = []string{"code", "projects", "src", "dev", "repos", "Documents", "Desktop"}
	}
	roots := make([]string, 0, len(names))
	for _, n := range names {
		roots = append(roots, filepath.Join(home, n))
	}
	return roots
}
